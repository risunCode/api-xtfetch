/**
 * Telegram Bot URL Handler
 * Auto-detects social media URLs and processes downloads with smart content detection
 * 
 * Flow by content type:
 * - Video (non-YouTube): Send video directly with quality buttons
 * - YouTube: Send thumbnail preview with quality buttons (user must select)
 * - Photo (single): Send photo directly with Original URL button
 * - Photo (album): Send all photos as media group with Original URL button
 */

import { Bot, InputFile, InlineKeyboard } from 'grammy';
import type { InputMediaPhoto } from 'grammy/types';

import { platformDetect, type PlatformId } from '@/core/config';
import { serviceConfigLoad, serviceConfigIsPlatformEnabled, serviceConfigGetPlatformDisabledMessage } from '@/lib/config';
import { logger } from '@/lib/services/shared/logger';
import { optimizeCdnUrl } from '@/lib/services/facebook/cdn';

import type { BotContext, DownloadResult } from '../types';
import { detectContentType } from '../types';
import { botRateLimitRecordDownload, getMultiUrlUsage, canUseMultiUrl, recordMultiUrlUsage } from '../middleware';
import { botIsInMaintenance, botGetMaintenanceMessage } from '../middleware';
import { errorKeyboard, cookieErrorKeyboard, buildVideoKeyboard, buildPhotoKeyboard, buildYouTubeKeyboard, buildVideoSuccessKeyboard, buildVideoFallbackKeyboard, detectDetailedQualities, MAX_TELEGRAM_FILESIZE } from '../keyboards';
import { t, detectLanguage, formatFilesize, type BotLanguage } from '../i18n';
import { sanitizeTitle } from '../utils/format';
import { recordDownloadSuccess, recordDownloadFailure } from '../utils/monitoring';
import { downloadQueue, isQueueAvailable } from '../queue';
import { botDownloadCreate, botDownloadUpdateStatus } from '../services/downloadService';
import { log } from '../helpers';

// ============================================================================
// URL DETECTION
// ============================================================================

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

const SUPPORTED_DOMAINS = [
    // Core platforms
    'youtube.com', 'youtu.be',
    'instagram.com', 'instagr.am',
    'tiktok.com',
    'twitter.com', 'x.com', 't.co',
    'facebook.com', 'fb.com', 'fb.watch',
    'weibo.com', 'weibo.cn',
    // New platforms (yt-dlp/gallery-dl)
    'bilibili.com', 'b23.tv',
    'reddit.com', 'redd.it', 'v.redd.it',
    'soundcloud.com',
    'threads.net',
    'pixiv.net',
    'erome.com',
    'eporner.com',
    'pornhub.com',
    'rule34video.com',
];

// Multi-URL limits
const MAX_URLS_FREE_PER_MSG = 10;     // Free users: max 10 URLs per message
const MAX_URLS_DONATOR_PER_MSG = 10;  // VIP users: max 10 URLs per message
const FREE_MULTI_URL_DAILY_LIMIT = 10; // Free users: max 10 multi-URL requests per day

// Helper to format time until reset
function getTimeUntilResetFormatted(resetAt: Date): { hours: number; minutes: number } {
    const diffMs = resetAt.getTime() - Date.now();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return { hours: Math.max(0, hours), minutes: Math.max(0, minutes) };
}

// Feature flag for queue-based processing
const USE_QUEUE_PROCESSING = process.env.BOT_USE_QUEUE === 'true';

// Timeout for sending media to prevent "Processing Stuck" bug
const SEND_TIMEOUT_MS = 60000;

function botUrlExtract(text: string): string | null {
    const matches = text.match(URL_REGEX);
    if (!matches) return null;

    for (const url of matches) {
        try {
            const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
            const isSupported = SUPPORTED_DOMAINS.some(domain => 
                hostname === domain || hostname.endsWith('.' + domain)
            );
            if (isSupported) return url;
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * Extract social media URLs from text
 * @param text - Message text
 * @param maxUrls - Maximum URLs to extract
 * @returns Array of valid social media URLs
 */
function extractSocialUrls(text: string, maxUrls: number): string[] {
    const matches = text.match(URL_REGEX) || [];
    const validUrls: string[] = [];
    
    for (const url of matches) {
        if (validUrls.length >= maxUrls) break;
        
        try {
            const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
            const isSupported = SUPPORTED_DOMAINS.some(domain => 
                hostname === domain || hostname.endsWith('.' + domain)
            );
            if (isSupported && !validUrls.includes(url)) {
                validUrls.push(url);
            }
        } catch {
            continue;
        }
    }
    
    return validUrls;
}

function botUrlGetPlatformName(platform: PlatformId): string {
    const names: Record<PlatformId, string> = {
        youtube: 'YouTube',
        instagram: 'Instagram',
        tiktok: 'TikTok',
        twitter: 'X/Twitter',
        facebook: 'Facebook',
        weibo: 'Weibo',
        // New platforms
        bilibili: 'BiliBili',
        reddit: 'Reddit',
        soundcloud: 'SoundCloud',
        eporner: 'Eporner',
        pornhub: 'PornHub',
        rule34video: 'Rule34Video',
        threads: 'Threads',
        erome: 'Erome',
        pixiv: 'Pixiv',
    };
    return names[platform] || platform;
}

// ============================================================================
// SCRAPER VIA INTERNAL API
// ============================================================================

import { API_BASE_URL } from '../config';

/**
 * Call internal API to scrape URL (same as frontend)
 * This ensures bot uses the same logic as web frontend
 */
async function botUrlCallScraper(url: string, isPremium: boolean = false): Promise<DownloadResult> {
    const startTime = Date.now();

    try {
        // Detect platform for logging
        const platform = platformDetect(url);
        if (platform) {
            logger.request(platform, 'telegram' as 'web');
        }

        // Call internal API (bypass origin check by using internal URL)
        const apiUrl = `${API_BASE_URL}/api/v1/publicservices`;
        
        log.debug(`API call: ${url.substring(0, 50)}...`);
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Internal request marker - bypass origin check
                'X-Internal-Request': 'telegram-bot',
                'Origin': API_BASE_URL,
                'Referer': `${API_BASE_URL}/`,
            },
            body: JSON.stringify({ 
                url,
                // VIP users get private cookies
                cookie: isPremium ? undefined : undefined, // Let API handle cookie selection
            }),
        });

        const data = await response.json();
        const responseTime = Date.now() - startTime;

        if (data.success && data.data) {
            const resolvedPlatform = data.meta?.platform || platform;
            logger.complete(resolvedPlatform, responseTime);
            
            log.debug(`Success: ${resolvedPlatform}, ${data.data.formats?.length || 0} formats`);
            
            return {
                success: true,
                platform: resolvedPlatform,
                title: data.data.title,
                thumbnail: data.data.thumbnail,
                author: data.data.author,
                formats: data.data.formats,
                usedCookie: true,
            };
        }

        const resolvedPlatform = data.meta?.platform || platform;
        log.debug(`Failed: ${data.error} (${data.errorCode})`);
        logger.scrapeError(resolvedPlatform || 'unknown', data.errorCode || 'UNKNOWN', data.error);
        
        return {
            success: false,
            platform: resolvedPlatform,
            error: data.error || 'Failed to download',
            errorCode: data.errorCode,
        };

    } catch (error) {
        log.error('API call error', error);
        logger.error('telegram', error, 'API_CALL');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Internal error',
            errorCode: 'INTERNAL_ERROR',
        };
    }
}

// ============================================================================
// CAPTION BUILDER
// ============================================================================

import { escapeMarkdown, buildSimpleCaptionFromResult as buildSimpleCaption } from '../helpers';

/**
 * Get VIP expiry days from context
 * Returns undefined if not VIP, or days until expiry
 */
function getVipExpiryDays(ctx: BotContext): number | undefined {
    if (!ctx.isVip || !ctx.botUser?.vip_expires_at) {
        return undefined;
    }
    
    const expiryDate = new Date(ctx.botUser.vip_expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysLeft > 0 ? daysLeft : undefined;
}

/**
 * Build caption with bold platform name, sanitized title, filesize, and optional expiry warning
 * Used for YouTube only (keeps full format)
 */
function buildCaption(result: DownloadResult, lang: BotLanguage = 'en', vipExpiryDays?: number): string {
    const platformName = botUrlGetPlatformName(result.platform!);
    
    let caption = `*${platformName}*\n\n`;
    
    // Sanitize title - removes hashtags, cleans up special chars, truncates
    if (result.title) {
        const cleanTitle = sanitizeTitle(result.title, 200);
        if (cleanTitle) {
            caption += `${escapeMarkdown(cleanTitle)}\n`;
        }
    }
    
    // Author
    if (result.author) {
        caption += `${escapeMarkdown(result.author)}\n`;
    }
    
    // Filesize - show best quality size
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    const bestVideo = videos.find(f => 
        f.quality.includes('1080') || f.quality.includes('720') || f.quality.toLowerCase().includes('hd')
    ) || videos[0];
    
    if (bestVideo?.filesize) {
        caption += `\n📦 ${formatFilesize(bestVideo.filesize, lang)}`;
    }
    
    // VIP expiry warning (< 7 days)
    if (vipExpiryDays !== undefined && vipExpiryDays > 0 && vipExpiryDays < 7) {
        caption += `\n\n⚠️ VIP expires in ${vipExpiryDays} day${vipExpiryDays === 1 ? '' : 's'}`;
    }
    
    return caption.trim();
}



// ============================================================================
// SEND FUNCTIONS BY CONTENT TYPE
// ============================================================================

/**
 * Send video directly (non-YouTube)
 * 
 * IMPORTANT: Validates filesize BEFORE downloading to prevent OOM kills!
 * 
 * Smart quality logic:
 * - If HD filesize ≤ 40MB → Download & send HD, show only [🔗 Original]
 * - If HD > 40MB but SD ≤ 40MB → Download & send SD, show [🎬 HD (link)] [🔗 Original]
 * - If both > 40MB → DON'T download, send direct link only
 */
async function sendVideoDirectly(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string,
    visitorId: string,
    processingMsgId?: number | null
): Promise<boolean> {
    const lang = detectLanguage(ctx.from?.language_code);
    const platformName = botUrlGetPlatformName(result.platform!);
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    if (videos.length === 0) return false;

    // Find HD video (1080p, 720p, hd, fullhd, high, original)
    const hdVideo = videos.find(f => {
        const q = f.quality.toLowerCase();
        return q.includes('1080') || q.includes('720') || q.includes('hd') || 
               q.includes('fullhd') || q.includes('high') || q.includes('original');
    });
    
    // Find SD video (480p, 360p, sd, low, medium) or fallback to last video
    const sdVideo = videos.find(f => {
        const q = f.quality.toLowerCase();
        return q.includes('480') || q.includes('360') || q.includes('sd') || 
               q.includes('low') || q.includes('medium');
    }) || (videos.length > 1 ? videos[videos.length - 1] : undefined);

    // CRITICAL: Check filesize BEFORE downloading to prevent OOM
    const hdExceedsLimit = hdVideo?.filesize && hdVideo.filesize > MAX_TELEGRAM_FILESIZE;
    const sdExceedsLimit = sdVideo?.filesize && sdVideo.filesize > MAX_TELEGRAM_FILESIZE;
    const onlyVideoExceedsLimit = !hdVideo && !sdVideo && videos[0]?.filesize && videos[0].filesize > MAX_TELEGRAM_FILESIZE;
    
    // If ALL available videos exceed 40MB, send direct link WITHOUT downloading
    const allExceedLimit = (hdExceedsLimit && (!sdVideo || sdExceedsLimit)) || onlyVideoExceedsLimit;
    
    if (allExceedLimit) {
        log.debug('All formats exceed 40MB limit, sending direct link only');
        
        // Delete processing message - we'll send a new message with direct link
        if (processingMsgId) {
            await deleteMessage(ctx, processingMsgId);
        }
        
        const bestVideo = hdVideo || sdVideo || videos[0];
        const optimizedUrl = bestVideo.url.includes('fbcdn.net') ? optimizeCdnUrl(bestVideo.url) : bestVideo.url;
        const filesizeMB = bestVideo.filesize ? (bestVideo.filesize / 1024 / 1024).toFixed(0) : '?';
        
        const caption = lang === 'id'
            ? `📥 *${platformName}*\n\n` +
              `${result.author ? escapeMarkdown(result.author) + '\n' : ''}` +
              `⚠️ Video terlalu besar (${filesizeMB}MB) untuk Telegram.\nKlik tombol untuk download langsung.`
            : `📥 *${botUrlGetPlatformName(result.platform!)}*\n\n` +
              `${result.author ? escapeMarkdown(result.author) + '\n' : ''}` +
              `⚠️ Video too large (${filesizeMB}MB) for Telegram.\nTap button to download directly.`;
        
        const keyboard = new InlineKeyboard()
            .url('▶️ ' + (lang === 'id' ? 'Download Video' : 'Download Video'), optimizedUrl)
            .url('🔗 Original', originalUrl);
        
        // Try to send with thumbnail if available
        const thumbUrl = result.thumbnail;
        if (thumbUrl) {
            try {
                if (thumbUrl.includes('fbcdn.net') || thumbUrl.includes('cdninstagram.com')) {
                    const thumbResponse = await fetch(thumbUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://www.facebook.com/',
                        },
                    });
                    if (thumbResponse.ok) {
                        const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());
                        await ctx.replyWithPhoto(new InputFile(thumbBuffer, 'thumb.jpg'), {
                            caption,
                            parse_mode: 'Markdown',
                            reply_markup: keyboard,
                        });
                        return true;
                    }
                } else {
                    await ctx.replyWithPhoto(new InputFile({ url: thumbUrl }), {
                        caption,
                        parse_mode: 'Markdown',
                        reply_markup: keyboard,
                    });
                    return true;
                }
            } catch { /* fall through to text message */ }
        }
        
        // No thumbnail, send text message
        await ctx.reply(caption, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
            link_preview_options: { is_disabled: true },
        });
        return true;
    }
    
    // Select video to send: SD fallback if HD exceeds limit, otherwise HD (or first available)
    const videoToSend = hdExceedsLimit && sdVideo ? sdVideo : (hdVideo || videos[0]);

    // Use simple caption (just username) for non-YouTube
    let caption = buildSimpleCaption(result, originalUrl);
    
    // Get optimized video URL for HD+Sound button (direct CDN link has audio)
    const videoUrlForButton = videoToSend.url.includes('fbcdn.net') 
        ? optimizeCdnUrl(videoToSend.url) 
        : videoToSend.url;
    
    // Build appropriate keyboard based on whether we're using fallback
    let keyboard;
    if (hdExceedsLimit && hdVideo) {
        // HD exceeds limit - sending SD as fallback, show HD as external link
        const optimizedHdUrl = hdVideo.url.includes('fbcdn.net') ? optimizeCdnUrl(hdVideo.url) : hdVideo.url;
        keyboard = buildVideoFallbackKeyboard(optimizedHdUrl, originalUrl);
        if (caption) caption += '\n';
        caption += '⚠️ HD > 40MB';
    } else {
        // HD sent successfully - show HD+Sound link (direct CDN has audio) + Origin URL
        keyboard = buildVideoSuccessKeyboard(originalUrl, videoUrlForButton);
    }

    const videoUrl = videoToSend.url;

    // For Facebook/Instagram CDN: download first then upload as buffer
    // Telegram servers can't fetch these URLs directly
    const needsDownloadFirst = videoUrl.includes('fbcdn.net') || videoUrl.includes('cdninstagram.com');

    // Helper: fetch with retry for CDN URLs (handles transient network failures)
    const fetchWithRetry = async (url: string, maxRetries = 3): Promise<Buffer> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                log.debug(`Download attempt ${attempt}/${maxRetries}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s per attempt
                
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*',
                        'Referer': 'https://www.facebook.com/',
                    },
                    signal: controller.signal,
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const buffer = Buffer.from(await response.arrayBuffer());
                log.debug(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
                return buffer;
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Unknown error';
                log.debug(`Attempt ${attempt} failed: ${msg}`);
                
                if (attempt < maxRetries) {
                    // Exponential backoff: 2s, 4s
                    const delay = 2000 * attempt;
                    log.debug(`Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw new Error(`All ${maxRetries} attempts failed: ${msg}`);
                }
            }
        }
        throw new Error('Retry logic error');
    };

    try {
        if (needsDownloadFirst) {
            // Optimize CDN URL for Facebook (redirect US/EU to Jakarta)
            const optimizedUrl = videoUrl.includes('fbcdn.net') ? optimizeCdnUrl(videoUrl) : videoUrl;
            
            // Log filesize info before download (full URL for debugging)
            const expectedSize = videoToSend.filesize ? (videoToSend.filesize / 1024 / 1024).toFixed(1) : '?';
            log.debug(`Downloading ${videoToSend.quality} (~${expectedSize}MB) from CDN`);
            
            // Show "uploading video" status under bot name
            await ctx.replyWithChatAction('upload_video');
            
            const buffer = await fetchWithRetry(optimizedUrl);
            log.debug('Uploading to Telegram...');
            
            // Refresh chat action for upload phase
            await ctx.replyWithChatAction('upload_video');
            
            await ctx.replyWithVideo(new InputFile(buffer, 'video.mp4'), {
                caption: caption || undefined,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
            
            // Delete processing message after success
            if (processingMsgId) await deleteMessage(ctx, processingMsgId);
        } else {
            // Other platforms: use URL directly
            await ctx.replyWithChatAction('upload_video');
            
            await ctx.replyWithVideo(new InputFile({ url: videoUrl }), {
                caption: caption || undefined,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
            
            // Delete processing message after success
            if (processingMsgId) await deleteMessage(ctx, processingMsgId);
        }
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_VIDEO');
        
        // Fallback: Send thumbnail with download buttons instead of raw link
        try {
            const fallbackCaption = lang === 'id'
                ? `📥 *${botUrlGetPlatformName(result.platform!)}*\n\n` +
                  `${result.author ? escapeMarkdown(result.author) + '\n' : ''}\n` +
                  `⚠️ Gagal mengirim video.`
                : `📥 *${botUrlGetPlatformName(result.platform!)}*\n\n` +
                  `${result.author ? escapeMarkdown(result.author) + '\n' : ''}\n` +
                  `⚠️ Failed to send video.`;
            
            const fallbackKeyboard = new InlineKeyboard()
                .url('▶️ ' + (lang === 'id' ? 'Tonton' : 'Watch'), videoToSend.url)
                .url('🔗 Original', originalUrl);
            
            // Clean up processing message on error
            if (processingMsgId) {
                await deleteMessage(ctx, processingMsgId);
            }
            
            // Try to send thumbnail with buttons
            const thumbUrl = result.thumbnail;
            if (thumbUrl) {
                // Download thumbnail too if it's fbcdn
                if (thumbUrl.includes('fbcdn.net') || thumbUrl.includes('cdninstagram.com')) {
                    try {
                        const thumbResponse = await fetch(thumbUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Referer': 'https://www.facebook.com/',
                            },
                        });
                        if (thumbResponse.ok) {
                            const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());
                            await ctx.replyWithPhoto(new InputFile(thumbBuffer, 'thumb.jpg'), {
                                caption: fallbackCaption,
                                parse_mode: 'Markdown',
                                reply_markup: fallbackKeyboard,
                            });
                            return true;
                        }
                    } catch { /* fall through */ }
                } else {
                    await ctx.replyWithPhoto(new InputFile({ url: thumbUrl }), {
                        caption: fallbackCaption,
                        parse_mode: 'Markdown',
                        reply_markup: fallbackKeyboard,
                    });
                    return true;
                }
            }
            
            // No thumbnail or thumbnail failed, send text message with buttons
            await ctx.reply(fallbackCaption, {
                parse_mode: 'Markdown',
                reply_markup: fallbackKeyboard,
                link_preview_options: { is_disabled: true },
            });
            return true;
        } catch (fallbackError) {
            logger.error('telegram', fallbackError, 'SEND_VIDEO_FALLBACK');
            // Ensure processing message is cleaned up even if fallback fails
            if (processingMsgId) {
                await deleteMessage(ctx, processingMsgId);
            }
            return false;
        }
    }
}

/**
 * Send YouTube preview with thumbnail
 */
async function sendYouTubePreview(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string,
    visitorId: string
): Promise<boolean> {
    const lang = detectLanguage(ctx.from?.language_code);
    const vipExpiryDays = getVipExpiryDays(ctx);
    const caption = buildCaption(result, lang, vipExpiryDays);
    const qualities = detectDetailedQualities(result);
    const keyboard = buildYouTubeKeyboard(originalUrl, visitorId, qualities);
    
    // Use YouTube-specific select quality message with filesize warning
    const selectQualityMsg = t('select_quality_youtube', lang);

    try {
        if (result.thumbnail) {
            await ctx.replyWithPhoto(new InputFile({ url: result.thumbnail }), {
                caption: `${caption}\n\n${selectQualityMsg}`,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        } else {
            await ctx.reply(`${caption}\n\n${selectQualityMsg}`, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        }
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_YT_PREVIEW');
        return false;
    }
}

/**
 * Send single photo directly
 */
async function sendSinglePhoto(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string
): Promise<boolean> {
    const lang = detectLanguage(ctx.from?.language_code);
    const images = result.formats?.filter(f => f.type === 'image') || [];
    if (images.length === 0) return false;

    // Deduplicate images by itemId - keep only highest quality per item
    const bestImages = deduplicateImages(images);
    
    // Use simple caption (just username)
    const caption = buildSimpleCaption(result, originalUrl);
    const keyboard = buildPhotoKeyboard(originalUrl);

    const photoUrl = bestImages[0].url;
    const needsDownloadFirst = photoUrl.includes('fbcdn.net') || photoUrl.includes('cdninstagram.com');

    try {
        if (needsDownloadFirst) {
            // Download photo to buffer for Facebook/Instagram
            const response = await fetch(photoUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.facebook.com/',
                },
            });
            if (!response.ok) throw new Error(`Download failed: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            
            await ctx.replyWithPhoto(new InputFile(buffer, 'photo.jpg'), {
                caption: caption || undefined,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        } else {
            await ctx.replyWithPhoto(new InputFile({ url: photoUrl }), {
                caption: caption || undefined,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        }
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_PHOTO');
        return false;
    }
}

/**
 * Send Facebook Stories with multi-select support
 * - Single story: send directly
 * - Multiple stories: send thumbnail with keyboard buttons for each story
 */
async function sendFacebookStories(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string,
    processingMsgId?: number | null
): Promise<boolean> {
    const lang = detectLanguage(ctx.from?.language_code);
    const formats = result.formats || [];
    
    // Group stories by storyIndex or itemId
    const storyGroups = new Map<string, Array<typeof formats[0]>>();
    
    for (const format of formats) {
        // Use storyIndex if available, otherwise itemId, otherwise treat as single story
        const storyKey = format.storyIndex?.toString() || format.itemId || 'single';
        if (!storyGroups.has(storyKey)) {
            storyGroups.set(storyKey, []);
        }
        storyGroups.get(storyKey)!.push(format);
    }
    
    const storyCount = storyGroups.size;
    
    // Single story - send directly using existing video/photo logic
    if (storyCount <= 1) {
        const videos = formats.filter(f => f.type === 'video');
        if (videos.length > 0) {
            return await sendVideoDirectly(ctx, result, originalUrl, '', processingMsgId);
        } else {
            const sent = await sendSinglePhoto(ctx, result, originalUrl);
            if (sent && processingMsgId) await deleteMessage(ctx, processingMsgId);
            return sent;
        }
    }
    
    // Multiple stories - send thumbnail with selection buttons
    const caption = lang === 'id'
        ? `📖 *Facebook Stories*\n\n` +
          `${result.author ? escapeMarkdown(result.author) + '\n' : ''}` +
          `📚 ${storyCount} stories tersedia\n\n` +
          `Pilih story untuk didownload:`
        : `📖 *Facebook Stories*\n\n` +
          `${result.author ? escapeMarkdown(result.author) + '\n' : ''}` +
          `📚 ${storyCount} stories available\n\n` +
          `Select a story to download:`;
    
    // Build keyboard with buttons for each story
    const keyboard = new InlineKeyboard();
    let storyIdx = 0;
    
    for (const [storyKey, storyFormats] of storyGroups) {
        storyIdx++;
        // Get best quality format for this story (prefer HD video)
        const bestFormat = storyFormats.find(f => f.type === 'video' && f.quality.includes('HD')) 
            || storyFormats.find(f => f.type === 'video')
            || storyFormats[0];
        
        if (bestFormat) {
            const optimizedUrl = bestFormat.url.includes('fbcdn.net') 
                ? optimizeCdnUrl(bestFormat.url) 
                : bestFormat.url;
            const isVideo = bestFormat.type === 'video';
            const label = isVideo 
                ? `${storyIdx}. 🎬 Story ${storyIdx}` 
                : `${storyIdx}. 🖼️ Story ${storyIdx}`;
            
            keyboard.url(label, optimizedUrl);
            
            // 2 buttons per row
            if (storyIdx % 2 === 0) {
                keyboard.row();
            }
        }
    }
    
    // Add original URL button on new row
    keyboard.row().url('🔗 Original', originalUrl);
    
    // Delete processing message
    if (processingMsgId) {
        await deleteMessage(ctx, processingMsgId);
    }
    
    // Try to send with thumbnail
    const thumbUrl = result.thumbnail;
    if (thumbUrl) {
        try {
            if (thumbUrl.includes('fbcdn.net') || thumbUrl.includes('cdninstagram.com')) {
                const thumbResponse = await fetch(thumbUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.facebook.com/',
                    },
                });
                if (thumbResponse.ok) {
                    const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());
                    await ctx.replyWithPhoto(new InputFile(thumbBuffer, 'thumb.jpg'), {
                        caption,
                        parse_mode: 'Markdown',
                        reply_markup: keyboard,
                    });
                    return true;
                }
            } else {
                await ctx.replyWithPhoto(new InputFile({ url: thumbUrl }), {
                    caption,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                });
                return true;
            }
        } catch { /* fall through to text message */ }
    }
    
    // No thumbnail or thumbnail failed, send text message
    await ctx.reply(caption, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
    });
    return true;
}

/**
 * Deduplicate images - keep only highest quality per itemId
 * Twitter sends both 4K and large for same image, we only want 4K
 */
function deduplicateImages(images: Array<{ url: string; quality: string; type: string; itemId?: string }>): typeof images {
    // Quality priority (higher = better)
    const qualityPriority: Record<string, number> = {
        '4k': 100,
        'orig': 90,
        'original': 90,
        '4096': 85,
        '2048': 80,
        'large': 70,
        'medium': 50,
        'small': 30,
        'thumb': 10,
    };
    
    const getQualityScore = (quality: string): number => {
        const q = quality.toLowerCase();
        for (const [key, score] of Object.entries(qualityPriority)) {
            if (q.includes(key)) return score;
        }
        // Check for resolution numbers
        const match = q.match(/(\d{3,4})/);
        if (match) return parseInt(match[1]) / 10;
        return 50; // default
    };
    
    // Group by itemId
    const byItemId = new Map<string, typeof images[0]>();
    
    for (const img of images) {
        const itemId = img.itemId || img.url; // fallback to url if no itemId
        const existing = byItemId.get(itemId);
        
        if (!existing) {
            byItemId.set(itemId, img);
        } else {
            // Keep higher quality
            if (getQualityScore(img.quality) > getQualityScore(existing.quality)) {
                byItemId.set(itemId, img);
            }
        }
    }
    
    return Array.from(byItemId.values());
}

/**
 * Send multiple photos as album (media group)
 */
async function sendPhotoAlbum(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string
): Promise<boolean> {
    const lang = detectLanguage(ctx.from?.language_code);
    const images = result.formats?.filter(f => f.type === 'image') || [];
    if (images.length === 0) return false;

    // Deduplicate images - keep only highest quality per item
    const bestImages = deduplicateImages(images);
    
    // Use simple caption (just username) for album
    const caption = buildSimpleCaption(result, originalUrl);

    // Check if we need to download first (Facebook/Instagram CDN)
    const needsDownloadFirst = bestImages.some(img => 
        img.url.includes('fbcdn.net') || img.url.includes('cdninstagram.com')
    );

    try {
        if (needsDownloadFirst) {
            // Download all images to buffers first
            const downloadPromises = bestImages.slice(0, 10).map(async (img) => {
                const response = await fetch(img.url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.facebook.com/',
                    },
                });
                if (!response.ok) throw new Error(`Download failed: ${response.status}`);
                return Buffer.from(await response.arrayBuffer());
            });
            
            const buffers = await Promise.all(downloadPromises);
            
            const mediaGroup: InputMediaPhoto[] = buffers.map((buffer, index) => ({
                type: 'photo' as const,
                media: new InputFile(buffer, `photo_${index}.jpg`),
                caption: index === 0 ? (caption || undefined) : undefined,
                parse_mode: index === 0 && caption ? 'Markdown' as const : undefined,
            }));
            
            await ctx.replyWithMediaGroup(mediaGroup);
        } else {
            // Other platforms: use URLs directly
            const mediaGroup: InputMediaPhoto[] = bestImages.slice(0, 10).map((img, index) => ({
                type: 'photo' as const,
                media: img.url,
                caption: index === 0 ? (caption || undefined) : undefined,
                parse_mode: index === 0 && caption ? 'Markdown' as const : undefined,
            }));
            
            await ctx.replyWithMediaGroup(mediaGroup);
        }
        
        const keyboard = buildPhotoKeyboard(originalUrl);
        await ctx.reply(t('download_complete', lang), { reply_markup: keyboard });
        
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_ALBUM');
        return await sendSinglePhoto(ctx, result, originalUrl);
    }
}

// ============================================================================
// MAIN SEND FUNCTION
// ============================================================================

/**
 * Update processing message with status
 */
async function updateStatus(ctx: BotContext, msgId: number | null, status: string): Promise<void> {
    if (!msgId) return;
    try {
        await ctx.api.editMessageText(ctx.chat!.id, msgId, status);
    } catch { /* ignore edit errors */ }
}

async function sendMediaByType(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string,
    visitorId: string,
    processingMsgId?: number | null
): Promise<boolean> {
    const contentType = detectContentType(result);
    
    // Check if this is a Facebook story with multiple stories
    const isFacebookStory = result.platform === 'facebook' && (
        originalUrl.includes('/stories/') || 
        result.formats?.some(f => f.storyIndex !== undefined || f.itemId?.startsWith('story-'))
    );
    
    if (isFacebookStory) {
        return await sendFacebookStories(ctx, result, originalUrl, processingMsgId);
    }
    
    switch (contentType) {
        case 'youtube':
            ctx.session.pendingDownload = {
                url: originalUrl,
                visitorId,
                platform: result.platform!,
                result,
                userMsgId: ctx.message?.message_id || 0,
                timestamp: Date.now(),
            };
            // Delete processing message before showing YouTube preview
            if (processingMsgId) {
                await deleteMessage(ctx, processingMsgId);
            }
            return await sendYouTubePreview(ctx, result, originalUrl, visitorId);
            
        case 'video':
            return await sendVideoDirectly(ctx, result, originalUrl, visitorId, processingMsgId);
            
        case 'photo_album': {
            // Show "uploading photo" status under bot name
            await ctx.replyWithChatAction('upload_photo');
            const sent = await sendPhotoAlbum(ctx, result, originalUrl);
            if (sent && processingMsgId) await deleteMessage(ctx, processingMsgId);
            return sent;
        }
            
        case 'photo_single':
        default: {
            // Show "uploading photo" status under bot name
            await ctx.replyWithChatAction('upload_photo');
            const sent = await sendSinglePhoto(ctx, result, originalUrl);
            if (sent && processingMsgId) await deleteMessage(ctx, processingMsgId);
            return sent;
        }
    }
}


// ============================================================================
// HELPERS
// ============================================================================

async function sendProcessingMessage(ctx: BotContext, platform: PlatformId): Promise<number | null> {
    try {
        const lang = detectLanguage(ctx.from?.language_code);
        const name = botUrlGetPlatformName(platform);
        const msg = await ctx.reply(t('processing', lang, { platform: name }), {
            reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
        });
        return msg.message_id;
    } catch {
        return null;
    }
}

async function deleteMessage(ctx: BotContext, messageId: number): Promise<void> {
    try {
        await ctx.api.deleteMessage(ctx.chat!.id, messageId);
    } catch {
        // Ignore
    }
}

async function editToError(ctx: BotContext, messageId: number, error: string, url: string, errorCode?: string, platform?: string): Promise<void> {
    const lang = detectLanguage(ctx.from?.language_code);
    
    // Check if it's a cookie-related error
    const isCookieError = errorCode && ['COOKIE_REQUIRED', 'COOKIE_EXPIRED', 'CHECKPOINT_REQUIRED', 'AGE_RESTRICTED', 'PRIVATE_CONTENT'].includes(errorCode);
    
    let displayError = error;
    let keyboard;
    
    if (isCookieError && platform) {
        // Simpler message for cookie errors
        displayError = lang === 'id'
            ? `⚠️ Konten ini tidak tersedia saat ini.\n\nMungkin memerlukan login atau cookie sedang bermasalah.`
            : `⚠️ This content is currently unavailable.\n\nIt may require login or cookies are having issues.`;
        keyboard = cookieErrorKeyboard(url, platform);
    } else {
        keyboard = errorKeyboard(url);
    }
    
    try {
        await ctx.api.editMessageText(ctx.chat!.id, messageId, `❌ ${displayError}`, {
            reply_markup: keyboard,
        });
    } catch {
        await ctx.reply(`❌ ${displayError}`, { reply_markup: keyboard });
    }
}

function generateVisitorId(): string {
    return Math.random().toString(36).substring(2, 10);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export function registerUrlHandler(bot: Bot<BotContext>): void {
    bot.on('message:text', async (ctx) => {
        const text = ctx.message.text;
        const lang = detectLanguage(ctx.from?.language_code);
        
        // Skip known commands
        if (text.startsWith('/')) {
            const knownCommands = ['/start', '/help', '/mystatus', '/history', '/donate', '/menu', '/privacy', '/status', '/stats', '/broadcast', '/ban', '/unban', '/givevip', '/revokevip', '/maintenance', '/stop', '/unsubscribe', '/forget'];
            const cmd = text.split(' ')[0].toLowerCase();
            
            if (!knownCommands.includes(cmd)) {
                await ctx.reply(t('unknown_command', lang), {
                    reply_parameters: { message_id: ctx.message.message_id },
                });
            }
            return;
        }
        
        // Determine URL limit based on user type (VIP = Donator)
        const isVip = ctx.isVip || false;
        const maxUrlsPerMsg = isVip ? MAX_URLS_DONATOR_PER_MSG : MAX_URLS_FREE_PER_MSG;
        const urls = extractSocialUrls(text, maxUrlsPerMsg);
        
        if (urls.length === 0) {
            await ctx.reply(t('unknown_text', lang), {
                reply_parameters: { message_id: ctx.message.message_id },
            });
            return;
        }
        
        // Check multi-URL daily limit for free users
        const isMultiUrlRequest = urls.length > 1;
        if (isMultiUrlRequest && !isVip) {
            const multiUrlUsage = await getMultiUrlUsage(ctx.from!.id);
            if (multiUrlUsage.remaining <= 0) {
                const { hours, minutes } = getTimeUntilResetFormatted(multiUrlUsage.resetAt);
                const limitMsg = lang === 'id'
                    ? `⚠️ *Batas Multi-Link Tercapai*\n\n` +
                      `Kamu sudah menggunakan ${FREE_MULTI_URL_DAILY_LIMIT}x multi-link hari ini.\n\n` +
                      `⏰ Reset: 00:00 WIB (${hours}j ${minutes}m lagi)\n\n` +
                      `💡 Kirim 1 URL per pesan, atau upgrade ke VIP untuk unlimited multi-link!`
                    : `⚠️ *Multi-Link Limit Reached*\n\n` +
                      `You've used ${FREE_MULTI_URL_DAILY_LIMIT}x multi-link today.\n\n` +
                      `⏰ Resets at: 00:00 WIB (in ${hours}h ${minutes}m)\n\n` +
                      `💡 Send 1 URL per message, or upgrade to VIP for unlimited multi-link!`;
                await ctx.reply(limitMsg, {
                    parse_mode: 'Markdown',
                    reply_parameters: { message_id: ctx.message.message_id },
                });
                return;
            }
        }
        
        // Count total URLs in message for warning
        const allMatches = text.match(URL_REGEX) || [];
        const totalUrls = allMatches.filter(url => {
            try {
                const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
                return SUPPORTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
            } catch { return false; }
        }).length;
        
        // Warn if URLs were ignored
        if (totalUrls > urls.length) {
            const ignored = totalUrls - urls.length;
            const warning = isVip
                ? (lang === 'id' 
                    ? `⚠️ ${ignored} URL diabaikan (max ${MAX_URLS_DONATOR_PER_MSG}/pesan)`
                    : `⚠️ ${ignored} URLs ignored (max ${MAX_URLS_DONATOR_PER_MSG}/message)`)
                : (lang === 'id'
                    ? `⚠️ ${ignored} URL diabaikan (max ${MAX_URLS_FREE_PER_MSG}/pesan)`
                    : `⚠️ ${ignored} URLs ignored (max ${MAX_URLS_FREE_PER_MSG}/message)`);
            
            await ctx.reply(warning, {
                parse_mode: 'Markdown',
                reply_parameters: { message_id: ctx.message.message_id },
            });
        }
        
        // Check global maintenance mode (synced with frontend via Redis)
        const isGlobalMaintenance = await botIsInMaintenance();
        if (isGlobalMaintenance && !ctx.isAdmin) {
            const maintenanceMsg = await botGetMaintenanceMessage(ctx.from?.language_code);
            await ctx.reply(maintenanceMsg, {
                parse_mode: 'Markdown',
                reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
            });
            return;
        }
        
        // Check if platform is enabled (load fresh config)
        await serviceConfigLoad(true);
        const firstUrl = urls[0];
        const detectedPlatform = platformDetect(firstUrl);
        if (detectedPlatform && !serviceConfigIsPlatformEnabled(detectedPlatform) && !ctx.isAdmin) {
            const disabledMsg = serviceConfigGetPlatformDisabledMessage(detectedPlatform);
            const platformName = botUrlGetPlatformName(detectedPlatform);
            const msg = lang === 'id'
                ? `🚫 *${platformName}* sedang tidak tersedia.\n\n${disabledMsg || 'Silakan coba lagi nanti.'}`
                : `🚫 *${platformName}* is currently unavailable.\n\n${disabledMsg || 'Please try again later.'}`;
            await ctx.reply(msg, {
                parse_mode: 'Markdown',
                reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
            });
            return;
        }
        
        // Multi-URL progress tracking
        const isMultiUrl = urls.length > 1;
        let progressMsgId: number | null = null;
        
        // ════════════════════════════════════════════════════════════════════
        // VIP FEATURE: Multi-Link Gallery Mode
        // When all URLs are from the same platform and contain images,
        // merge them into a single gallery (max 10 items)
        // ════════════════════════════════════════════════════════════════════
        if (isMultiUrl && isVip) {
            // Check if all URLs are from the same platform
            const platforms = urls.map(u => platformDetect(u)).filter(Boolean);
            const allSamePlatform = platforms.length === urls.length && 
                platforms.every(p => p === platforms[0]);
            
            if (allSamePlatform) {
                const sharedPlatform = platforms[0]!;
                
                // Show gallery processing message
                const galleryMsg = lang === 'id'
                    ? `🖼️ *Multi-Link Gallery* (VIP)\n\n⏳ Mengambil ${urls.length} link dari ${botUrlGetPlatformName(sharedPlatform)}...`
                    : `🖼️ *Multi-Link Gallery* (VIP)\n\n⏳ Fetching ${urls.length} links from ${botUrlGetPlatformName(sharedPlatform)}...`;
                
                try {
                    const msg = await ctx.reply(galleryMsg, {
                        parse_mode: 'Markdown',
                        reply_parameters: { message_id: ctx.message.message_id },
                    });
                    progressMsgId = msg.message_id;
                } catch { /* ignore */ }
                
                // Scrape all URLs in parallel
                const scrapePromises = urls.map(url => botUrlCallScraper(url, true));
                const results = await Promise.all(scrapePromises);
                
                // Collect all images from successful results
                const allImages: Array<{ url: string; quality: string; type: string; itemId?: string }> = [];
                const authors: string[] = [];
                const successUrls: string[] = [];
                
                for (let i = 0; i < results.length; i++) {
                    const result = results[i];
                    if (result.success && result.formats) {
                        const images = result.formats.filter(f => f.type === 'image');
                        if (images.length > 0) {
                            // Deduplicate and add images
                            const deduped = deduplicateImages(images);
                            allImages.push(...deduped);
                            successUrls.push(urls[i]);
                            if (result.author && !authors.includes(result.author)) {
                                authors.push(result.author);
                            }
                        }
                    }
                }
                
                // If we have images from multiple links, send as merged gallery
                if (allImages.length > 1 && successUrls.length > 1) {
                    try {
                        // Update progress
                        if (progressMsgId) {
                            const updateMsg = lang === 'id'
                                ? `🖼️ *Multi-Link Gallery*\n\n📤 Mengirim ${Math.min(allImages.length, 10)} gambar...`
                                : `🖼️ *Multi-Link Gallery*\n\n📤 Sending ${Math.min(allImages.length, 10)} images...`;
                            await ctx.api.editMessageText(ctx.chat!.id, progressMsgId, updateMsg, {
                                parse_mode: 'Markdown',
                            });
                        }
                        
                        // Build caption with authors
                        let caption = '';
                        if (authors.length > 0) {
                            const needsAt = ['twitter', 'instagram', 'tiktok'].includes(sharedPlatform);
                            caption = authors.map(a => {
                                const prefix = needsAt && !a.startsWith('@') ? '@' : '';
                                return `${prefix}${escapeMarkdown(a)}`;
                            }).join(' • ');
                        }
                        
                        // Check if we need to download first (Facebook/Instagram CDN)
                        const needsDownloadFirst = allImages.some(img => 
                            img.url.includes('fbcdn.net') || img.url.includes('cdninstagram.com')
                        );
                        
                        // Show upload action
                        await ctx.replyWithChatAction('upload_photo');
                        
                        if (needsDownloadFirst) {
                            // Download all images to buffers first
                            const downloadPromises = allImages.slice(0, 10).map(async (img) => {
                                const response = await fetch(img.url, {
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                        'Referer': 'https://www.facebook.com/',
                                    },
                                });
                                if (!response.ok) throw new Error(`Download failed: ${response.status}`);
                                return Buffer.from(await response.arrayBuffer());
                            });
                            
                            const buffers = await Promise.all(downloadPromises);
                            
                            const mediaGroup: InputMediaPhoto[] = buffers.map((buffer, index) => ({
                                type: 'photo' as const,
                                media: new InputFile(buffer, `photo_${index}.jpg`),
                                caption: index === 0 ? (caption || undefined) : undefined,
                                parse_mode: index === 0 && caption ? 'Markdown' as const : undefined,
                            }));
                            
                            await ctx.replyWithMediaGroup(mediaGroup);
                        } else {
                            // Use URLs directly
                            const mediaGroup: InputMediaPhoto[] = allImages.slice(0, 10).map((img, index) => ({
                                type: 'photo' as const,
                                media: img.url,
                                caption: index === 0 ? (caption || undefined) : undefined,
                                parse_mode: index === 0 && caption ? 'Markdown' as const : undefined,
                            }));
                            
                            await ctx.replyWithMediaGroup(mediaGroup);
                        }
                        
                        // Send URLs as separate message (no keyboard buttons as per spec)
                        const urlsText = lang === 'id'
                            ? `🔗 *Original URLs:*\n${successUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`
                            : `🔗 *Original URLs:*\n${successUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;
                        
                        await ctx.reply(urlsText, {
                            parse_mode: 'Markdown',
                            link_preview_options: { is_disabled: true },
                        });
                        
                        // Delete progress message
                        if (progressMsgId) {
                            await deleteMessage(ctx, progressMsgId);
                        }
                        
                        // Delete user message
                        await deleteMessage(ctx, ctx.message.message_id);
                        
                        // Record downloads
                        for (let i = 0; i < successUrls.length; i++) {
                            await botRateLimitRecordDownload(ctx);
                        }
                        
                        // Record multi-URL usage for free users
                        if (!isVip) {
                            await recordMultiUrlUsage(ctx.from!.id);
                        }
                        
                        log.debug(`Sent merged gallery: ${allImages.length} images from ${successUrls.length} URLs`);
                        return; // Exit early - gallery sent successfully
                        
                    } catch (galleryError) {
                        log.error('Failed to send merged gallery', galleryError);
                        // Fall through to sequential processing
                        if (progressMsgId) {
                            const fallbackMsg = lang === 'id'
                                ? `⚠️ Gallery gagal, memproses satu per satu...`
                                : `⚠️ Gallery failed, processing one by one...`;
                            try {
                                await ctx.api.editMessageText(ctx.chat!.id, progressMsgId, fallbackMsg);
                            } catch { /* ignore */ }
                        }
                    }
                }
                // If not enough images for gallery, fall through to sequential processing
            }
        }
        
        // ════════════════════════════════════════════════════════════════════
        // Standard Multi-URL Processing (Sequential)
        // ════════════════════════════════════════════════════════════════════
        
        // Show progress message for multiple URLs
        if (isMultiUrl && !progressMsgId) {
            let multiUrlLabel = '(VIP)';
            if (!isVip) {
                const usage = await getMultiUrlUsage(ctx.from!.id);
                multiUrlLabel = `(${usage.used + 1}/${FREE_MULTI_URL_DAILY_LIMIT} hari ini)`;
            }
            const progressMsg = lang === 'id'
                ? `📥 *Multi-Download* ${multiUrlLabel}\n\n⏳ Memproses ${urls.length} link...`
                : `📥 *Multi-Download* ${isVip ? '(VIP)' : multiUrlLabel}\n\n⏳ Processing ${urls.length} links...`;
            
            try {
                const msg = await ctx.reply(progressMsg, {
                    parse_mode: 'Markdown',
                    reply_parameters: { message_id: ctx.message.message_id },
                });
                progressMsgId = msg.message_id;
            } catch { /* ignore */ }
        }
        
        // Process URLs sequentially
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const platform = platformDetect(url);
            if (!platform) {
                failCount++;
                continue;
            }

            ctx.session.pendingRetryUrl = url;
            ctx.session.lastPlatform = platform;
            
            // Update progress for multi-URL
            if (isMultiUrl && progressMsgId) {
                try {
                    const progressText = lang === 'id'
                        ? `📥 *Multi-Download* (VIP)\n\n⏳ Memproses ${i + 1}/${urls.length}...\n\n` +
                          `✅ Berhasil: ${successCount}\n❌ Gagal: ${failCount}`
                        : `📥 *Multi-Download* (VIP)\n\n⏳ Processing ${i + 1}/${urls.length}...\n\n` +
                          `✅ Success: ${successCount}\n❌ Failed: ${failCount}`;
                    
                    await ctx.api.editMessageText(ctx.chat!.id, progressMsgId, progressText, {
                        parse_mode: 'Markdown',
                    });
                } catch { /* ignore edit errors */ }
            }

            // For single URL, show processing message
            let processingMsgId: number | null = null;
            if (!isMultiUrl) {
                processingMsgId = await sendProcessingMessage(ctx, platform);
                if (!processingMsgId) continue;
            }

            // Queue-based processing (Phase 2) - async, non-blocking
            // Enable with BOT_USE_QUEUE=true environment variable
            if (USE_QUEUE_PROCESSING && isQueueAvailable() && downloadQueue && !isMultiUrl) {
                try {
                    await downloadQueue.add('download', {
                        chatId: ctx.chat!.id,
                        userId: ctx.from!.id,
                        messageId: ctx.message.message_id,
                        processingMsgId: processingMsgId!,
                        url,
                        isPremium: isVip,
                        timestamp: Date.now(),
                        platform: platform, // For history tracking
                        botUserId: ctx.botUser?.id, // Bot user UUID for history
                    }, {
                        priority: isVip ? 1 : 10, // VIP gets higher priority
                    });
                    
                    log.debug(`Job added for user ${ctx.from!.id}`);
                    // Return immediately - worker will handle the rest
                    return;
                } catch (queueError) {
                    log.error('Failed to add job, falling back to sync', queueError);
                    // Fall through to synchronous processing
                }
            }

            // Synchronous processing (default)
            const result = await botUrlCallScraper(url, isVip);
            const processingEndTime = Date.now();

            // Create download record for history tracking
            let downloadId: string | null = null;
            if (ctx.botUser?.id && platform) {
                const { data: downloadRecord } = await botDownloadCreate(
                    ctx.botUser.id,
                    platform as PlatformId,
                    url,
                    result.title || null,
                    result.success ? 'completed' : 'failed',
                    isVip
                );
                downloadId = downloadRecord?.id || null;
            }

            if (result.success) {
                // Pass processingMsgId to sendMediaByType - it will handle status updates and deletion
                const visitorId = generateVisitorId();
                
                // Wrap sendMediaByType with timeout to prevent "Processing Stuck" bug
                let sent = false;
                try {
                    sent = await Promise.race([
                        sendMediaByType(ctx, result, url, visitorId, processingMsgId),
                        new Promise<boolean>((_, reject) => 
                            setTimeout(() => reject(new Error('SEND_TIMEOUT')), SEND_TIMEOUT_MS)
                        )
                    ]);
                } catch (sendError) {
                    const errorMsg = sendError instanceof Error && sendError.message === 'SEND_TIMEOUT'
                        ? (lang === 'id' ? '⏱️ Timeout - server sibuk. Coba lagi nanti.' : '⏱️ Timeout - server busy. Try again later.')
                        : (lang === 'id' ? '❌ Gagal mengirim media.' : '❌ Failed to send media.');
                    
                    if (processingMsgId) {
                        await editToError(ctx, processingMsgId, errorMsg, url);
                    } else {
                        await ctx.reply(errorMsg, { reply_markup: errorKeyboard(url) });
                    }
                    sent = false;
                }
                
                if (sent) {
                    successCount++;
                    // Record metrics
                    recordDownloadSuccess(processingEndTime - Date.now());
                    // Only delete user message on first successful download (single URL mode)
                    if (!isMultiUrl && url === urls[0]) {
                        await deleteMessage(ctx, ctx.message.message_id);
                    }
                    await botRateLimitRecordDownload(ctx);
                } else {
                    failCount++;
                    recordDownloadFailure();
                    if (processingMsgId) await deleteMessage(ctx, processingMsgId);
                    await ctx.reply(t('error_generic', lang), {
                        reply_markup: errorKeyboard(url),
                    });
                }
            } else {
                failCount++;
                recordDownloadFailure();
                if (processingMsgId) {
                    await editToError(ctx, processingMsgId, result.error || t('error_generic', lang), url, result.errorCode, result.platform);
                } else {
                    // Multi-URL mode: send error inline
                    const errorMsg = lang === 'id'
                        ? `❌ Gagal: ${url.substring(0, 50)}...`
                        : `❌ Failed: ${url.substring(0, 50)}...`;
                    await ctx.reply(errorMsg, { reply_markup: errorKeyboard(url) });
                }
            }
            
            // Small delay between URLs to avoid rate limiting
            if (isMultiUrl && i < urls.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Final summary for multi-URL
        if (isMultiUrl && progressMsgId) {
            try {
                const summaryText = lang === 'id'
                    ? `📥 *Multi-Download Selesai*\n\n` +
                      `✅ Berhasil: ${successCount}/${urls.length}\n` +
                      `❌ Gagal: ${failCount}/${urls.length}`
                    : `📥 *Multi-Download Complete*\n\n` +
                      `✅ Success: ${successCount}/${urls.length}\n` +
                      `❌ Failed: ${failCount}/${urls.length}`;
                
                await ctx.api.editMessageText(ctx.chat!.id, progressMsgId, summaryText, {
                    parse_mode: 'Markdown',
                });
                
                // Record multi-URL usage for free users (sequential processing)
                if (!isVip && successCount > 0) {
                    await recordMultiUrlUsage(ctx.from!.id);
                }
                
                // Delete summary after 5 seconds
                setTimeout(async () => {
                    try {
                        await ctx.api.deleteMessage(ctx.chat!.id, progressMsgId!);
                    } catch { /* ignore */ }
                }, 5000);
            } catch { /* ignore */ }
        }
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    botUrlExtract,
    botUrlCallScraper,
    botUrlGetPlatformName,
    sendVideoDirectly,
    sendYouTubePreview,
    sendSinglePhoto,
    sendPhotoAlbum,
    sendFacebookStories,
    buildCaption,
    escapeMarkdown,
};
