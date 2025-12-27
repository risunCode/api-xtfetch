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
import { runScraper } from '@/core/scrapers';
import { prepareUrl } from '@/lib/url';
import { cookiePoolGetRotating } from '@/lib/cookies';
import { logger } from '@/lib/services/shared/logger';
import { recordDownloadStat } from '@/lib/database';

import type { BotContext, DownloadResult } from '../types';
import { detectContentType } from '../types';
import { botRateLimitRecordDownload } from '../middleware/rateLimit';
import { botIsInMaintenance, botGetMaintenanceMessage } from '../middleware/maintenance';
import { errorKeyboard, cookieErrorKeyboard, buildVideoKeyboard, buildPhotoKeyboard, buildYouTubeKeyboard, buildVideoSuccessKeyboard, buildVideoFallbackKeyboard, detectDetailedQualities, MAX_TELEGRAM_FILESIZE } from '../keyboards';
import { t, detectLanguage, formatFilesize, type BotLanguage } from '../i18n';
import { sanitizeTitle } from '../utils/format';

// ============================================================================
// URL DETECTION
// ============================================================================

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

const SUPPORTED_DOMAINS = [
    'youtube.com', 'youtu.be',
    'instagram.com', 'instagr.am',
    'tiktok.com',
    'twitter.com', 'x.com', 't.co',
    'facebook.com', 'fb.com', 'fb.watch',
    'weibo.com', 'weibo.cn',
];

// Multi-URL limits
const MAX_URLS_FREE = 1;
const MAX_URLS_DONATOR = 5;

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
    };
    return names[platform] || platform;
}

// ============================================================================
// SCRAPER
// ============================================================================

async function botUrlCallScraper(url: string, isPremium: boolean = false): Promise<DownloadResult> {
    const startTime = Date.now();

    try {
        // Get cookie first for URL resolution (Facebook share links need cookie to resolve)
        const platform = platformDetect(url);
        const tier = isPremium ? 'private' : 'public';
        const poolCookie = platform ? await cookiePoolGetRotating(platform, tier) : null;
        
        // Pass cookie to prepareUrl for proper URL resolution
        const urlResult = await prepareUrl(url, { cookie: poolCookie || undefined });
        
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return {
                success: false,
                error: urlResult.assessment.errorMessage || 'Invalid URL',
                errorCode: 'INVALID_URL',
            };
        }

        const resolvedPlatform = urlResult.platform;
        logger.request(resolvedPlatform, 'telegram' as 'web');

        // Get cookie for resolved platform if different from original
        const scraperCookie = resolvedPlatform !== platform 
            ? await cookiePoolGetRotating(resolvedPlatform, tier) 
            : poolCookie;

        const result = await runScraper(resolvedPlatform, urlResult.resolvedUrl, {
            cookie: scraperCookie || undefined,
        });

        const responseTime = Date.now() - startTime;
        recordDownloadStat(resolvedPlatform, result.success, responseTime, undefined, 'telegram').catch(() => {});

        if (result.success && result.data) {
            logger.complete(resolvedPlatform, responseTime);
            return {
                success: true,
                platform: resolvedPlatform,
                title: result.data.title,
                thumbnail: result.data.thumbnail,
                author: result.data.author,
                formats: result.data.formats,
                usedCookie: !!scraperCookie,  // Track whether cookie was used
            };
        }

        logger.scrapeError(resolvedPlatform, result.errorCode || 'UNKNOWN', result.error);
        return {
            success: false,
            platform: resolvedPlatform,
            error: result.error || 'Failed to download',
            errorCode: result.errorCode,
        };

    } catch (error) {
        logger.error('telegram', error, 'SCRAPER_CALL');
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

/**
 * Escape Markdown special characters
 */
function escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
}

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

/**
 * Build simple caption - just username/author
 * Used for non-YouTube platforms (cleaner embed)
 */
function buildSimpleCaption(result: DownloadResult, originalUrl: string): string {
    const platform = result.platform;
    
    // Just author/username
    if (result.author) {
        // Add @ for Twitter/Instagram/TikTok if not already present
        const needsAt = ['twitter', 'instagram', 'tiktok'].includes(platform || '');
        const authorPrefix = needsAt && !result.author.startsWith('@') ? '@' : '';
        return `${authorPrefix}${escapeMarkdown(result.author)}`;
    }
    
    return '';
}


// ============================================================================
// SEND FUNCTIONS BY CONTENT TYPE
// ============================================================================

/**
 * Send video directly (non-YouTube)
 * 
 * Downloads video to buffer first, then uploads to Telegram.
 * This bypasses Telegram's inability to fetch Facebook/Instagram CDN URLs.
 * 
 * Smart quality logic:
 * - If HD filesize ≤ 40MB → Send HD directly, show only [🔗 Original]
 * - If HD filesize > 40MB → Send SD as fallback, show [🎬 HD (link)] [🔗 Original]
 */
async function sendVideoDirectly(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string,
    visitorId: string
): Promise<boolean> {
    const lang = detectLanguage(ctx.from?.language_code);
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

    // Determine if HD exceeds Telegram's filesize limit
    const hdExceedsLimit = hdVideo?.filesize && hdVideo.filesize > MAX_TELEGRAM_FILESIZE;
    
    // Select video to send: SD fallback if HD exceeds limit, otherwise HD (or first available)
    const videoToSend = hdExceedsLimit && sdVideo ? sdVideo : (hdVideo || videos[0]);

    // Use simple caption (just username) for non-YouTube
    let caption = buildSimpleCaption(result, originalUrl);
    
    // Build appropriate keyboard based on whether we're using fallback
    let keyboard;
    if (hdExceedsLimit && hdVideo) {
        // HD exceeds limit - sent SD as fallback, show HD as external link
        keyboard = buildVideoFallbackKeyboard(hdVideo.url, originalUrl);
        if (caption) caption += '\n';
        caption += '⚠️ HD > 40MB';
    } else {
        // HD sent successfully (or no HD available) - show only Original link
        keyboard = buildVideoSuccessKeyboard(originalUrl);
    }

    const platform = result.platform || 'facebook';
    const videoUrl = videoToSend.url;

    // For Facebook/Instagram CDN: download first then upload as buffer
    // Telegram servers can't fetch these URLs directly
    const needsDownloadFirst = videoUrl.includes('fbcdn.net') || videoUrl.includes('cdninstagram.com');

    // Helper: fetch with retry for CDN URLs (handles transient network failures)
    const fetchWithRetry = async (url: string, maxRetries = 3): Promise<Buffer> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[Bot.Video] Attempt ${attempt}/${maxRetries}: ${url.substring(0, 60)}...`);
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
                console.log(`[Bot.Video] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
                return buffer;
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Unknown error';
                console.log(`[Bot.Video] Attempt ${attempt} failed: ${msg}`);
                
                if (attempt < maxRetries) {
                    // Exponential backoff: 2s, 4s
                    const delay = 2000 * attempt;
                    console.log(`[Bot.Video] Retrying in ${delay}ms...`);
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
            // Download video to buffer with retry logic
            console.log(`[Bot.Video] Downloading from CDN: ${videoUrl.substring(0, 80)}...`);
            const buffer = await fetchWithRetry(videoUrl);
            console.log(`[Bot.Video] Uploading to Telegram...`);
            
            await ctx.replyWithVideo(new InputFile(buffer, 'video.mp4'), {
                caption: caption || undefined,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        } else {
            // Other platforms: use URL directly
            await ctx.replyWithVideo(new InputFile({ url: videoUrl }), {
                caption: caption || undefined,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
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

async function sendMediaByType(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string,
    visitorId: string
): Promise<boolean> {
    const contentType = detectContentType(result);
    
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
            return await sendYouTubePreview(ctx, result, originalUrl, visitorId);
            
        case 'video':
            return await sendVideoDirectly(ctx, result, originalUrl, visitorId);
            
        case 'photo_album':
            return await sendPhotoAlbum(ctx, result, originalUrl);
            
        case 'photo_single':
        default:
            return await sendSinglePhoto(ctx, result, originalUrl);
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
            const knownCommands = ['/start', '/help', '/mystatus', '/history', '/donate', '/menu', '/privacy', '/status', '/stats', '/broadcast', '/ban', '/unban', '/givevip', '/revokevip', '/maintenance'];
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
        const maxUrls = isVip ? MAX_URLS_DONATOR : MAX_URLS_FREE;
        const urls = extractSocialUrls(text, maxUrls);
        
        if (urls.length === 0) {
            await ctx.reply(t('unknown_text', lang), {
                reply_parameters: { message_id: ctx.message.message_id },
            });
            return;
        }
        
        // Count total URLs in message for warning
        const allMatches = text.match(URL_REGEX) || [];
        const totalUrls = allMatches.filter(url => {
            try {
                const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
                return SUPPORTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
            } catch { return false; }
        }).length;
        
        // Warn if URLs were ignored (only for non-VIP users)
        if (totalUrls > urls.length) {
            const ignored = totalUrls - urls.length;
            const warning = isVip
                ? (lang === 'id' 
                    ? `⚠️ ${ignored} URL diabaikan (max ${MAX_URLS_DONATOR}/pesan)`
                    : `⚠️ ${ignored} URLs ignored (max ${MAX_URLS_DONATOR}/message)`)
                : (lang === 'id'
                    ? `⚠️ ${ignored} URL diabaikan.\n\n💡 *Free user:* 1 URL/pesan\n💎 *VIP:* 5 URL/pesan\n\nGunakan /donate untuk info VIP!`
                    : `⚠️ ${ignored} URLs ignored.\n\n💡 *Free users:* 1 URL/message\n💎 *VIP:* 5 URLs/message\n\nUse /donate for VIP info!`);
            
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
        
        // Multi-URL progress tracking
        const isMultiUrl = urls.length > 1;
        let progressMsgId: number | null = null;
        
        // Show progress message for multiple URLs (VIP feature)
        if (isMultiUrl) {
            const progressMsg = lang === 'id'
                ? `📥 *Multi-Download* (VIP)\n\n⏳ Memproses ${urls.length} link...`
                : `📥 *Multi-Download* (VIP)\n\n⏳ Processing ${urls.length} links...`;
            
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

            const result = await botUrlCallScraper(url, isVip);

            if (result.success) {
                if (processingMsgId) {
                    await deleteMessage(ctx, processingMsgId);
                }
                
                const visitorId = generateVisitorId();
                const sent = await sendMediaByType(ctx, result, url, visitorId);
                
                if (sent) {
                    successCount++;
                    // Only delete user message on first successful download (single URL mode)
                    if (!isMultiUrl && url === urls[0]) {
                        await deleteMessage(ctx, ctx.message.message_id);
                    }
                    await botRateLimitRecordDownload(ctx);
                } else {
                    failCount++;
                    await ctx.reply(t('error_generic', lang), {
                        reply_markup: errorKeyboard(url),
                    });
                }
            } else {
                failCount++;
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
    buildCaption,
    escapeMarkdown,
};
