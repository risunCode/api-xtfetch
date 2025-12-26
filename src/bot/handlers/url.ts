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
import { botIsInMaintenance } from '../middleware/maintenance';
import { errorKeyboard, cookieErrorKeyboard, buildVideoKeyboard, buildPhotoKeyboard, buildYouTubeKeyboard, buildVideoSuccessKeyboard, buildVideoFallbackKeyboard, detectDetailedQualities, MAX_TELEGRAM_FILESIZE } from '../keyboards';
import { t, detectLanguage, formatFilesize, type BotLanguage } from '../i18n';

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
        const urlResult = await prepareUrl(url);
        
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return {
                success: false,
                error: urlResult.assessment.errorMessage || 'Invalid URL',
                errorCode: 'INVALID_URL',
            };
        }

        const platform = urlResult.platform;
        logger.request(platform, 'telegram' as 'web');

        const tier = isPremium ? 'private' : 'public';
        const poolCookie = await cookiePoolGetRotating(platform, tier);

        const result = await runScraper(platform, urlResult.resolvedUrl, {
            cookie: poolCookie || undefined,
        });

        const responseTime = Date.now() - startTime;
        recordDownloadStat(platform, result.success, responseTime, undefined, 'telegram').catch(() => {});

        if (result.success && result.data) {
            logger.complete(platform, responseTime);
            return {
                success: true,
                platform,
                title: result.data.title,
                thumbnail: result.data.thumbnail,
                author: result.data.author,
                formats: result.data.formats,
                usedCookie: !!poolCookie,  // Track whether cookie was used
            };
        }

        logger.scrapeError(platform, result.errorCode || 'UNKNOWN', result.error);
        return {
            success: false,
            platform,
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
 * Get premium expiry days from context
 * Returns undefined if not premium, or days until expiry
 */
function getPremiumExpiryDays(ctx: BotContext): number | undefined {
    if (!ctx.isPremium || !ctx.botUser?.premium_expires_at) {
        return undefined;
    }
    
    const expiryDate = new Date(ctx.botUser.premium_expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysLeft > 0 ? daysLeft : undefined;
}

/**
 * Build caption with bold platform name, full title, filesize, and optional expiry warning
 */
function buildCaption(result: DownloadResult, lang: BotLanguage = 'en', premiumExpiryDays?: number): string {
    const platformName = botUrlGetPlatformName(result.platform!);
    
    let caption = `*${platformName}*\n\n`;
    
    // Full title - NO TRUNCATION, escape special chars
    if (result.title) {
        caption += `${escapeMarkdown(result.title)}\n`;
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
    
    // Premium expiry warning (< 7 days)
    if (premiumExpiryDays !== undefined && premiumExpiryDays > 0 && premiumExpiryDays < 7) {
        caption += `\n\n⚠️ Premium expires in ${premiumExpiryDays} day${premiumExpiryDays === 1 ? '' : 's'}`;
    }
    
    return caption.trim();
}


// ============================================================================
// SEND FUNCTIONS BY CONTENT TYPE
// ============================================================================

/**
 * Send video directly (non-YouTube)
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

    // Get premium expiry days if user is premium
    const premiumExpiryDays = getPremiumExpiryDays(ctx);
    let caption = buildCaption(result, lang, premiumExpiryDays);
    
    // Build appropriate keyboard based on whether we're using fallback
    let keyboard;
    if (hdExceedsLimit && hdVideo) {
        // HD exceeds limit - sent SD as fallback, show HD as external link
        keyboard = buildVideoFallbackKeyboard(hdVideo.url, originalUrl);
        caption += '\n\n⚠️ HD exceeds 40MB limit';
    } else {
        // HD sent successfully (or no HD available) - show only Original link
        keyboard = buildVideoSuccessKeyboard(originalUrl);
    }

    try {
        await ctx.replyWithVideo(new InputFile({ url: videoToSend.url }), {
            caption,
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_VIDEO');
        
        // Fallback: Send thumbnail with download buttons instead of raw link
        try {
            const fallbackCaption = lang === 'id'
                ? `📥 *${botUrlGetPlatformName(result.platform!)}*\n\n` +
                  `${result.title ? escapeMarkdown(result.title) + '\n' : ''}` +
                  `${result.author ? escapeMarkdown(result.author) + '\n' : ''}\n` +
                  `⚠️ Video terlalu besar untuk dikirim langsung.`
                : `📥 *${botUrlGetPlatformName(result.platform!)}*\n\n` +
                  `${result.title ? escapeMarkdown(result.title) + '\n' : ''}` +
                  `${result.author ? escapeMarkdown(result.author) + '\n' : ''}\n` +
                  `⚠️ Video too large to send directly.`;
            
            const fallbackKeyboard = new InlineKeyboard()
                .url('▶️ ' + (lang === 'id' ? 'Tonton' : 'Watch'), videoToSend.url)
                .url('🔗 Original', originalUrl);
            
            // Try to send thumbnail with buttons
            if (result.thumbnail) {
                await ctx.replyWithPhoto(new InputFile({ url: result.thumbnail }), {
                    caption: fallbackCaption,
                    parse_mode: 'Markdown',
                    reply_markup: fallbackKeyboard,
                });
            } else {
                // No thumbnail, send text message with buttons
                await ctx.reply(fallbackCaption, {
                    parse_mode: 'Markdown',
                    reply_markup: fallbackKeyboard,
                    link_preview_options: { is_disabled: true },
                });
            }
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
    const premiumExpiryDays = getPremiumExpiryDays(ctx);
    const caption = buildCaption(result, lang, premiumExpiryDays);
    const qualities = detectDetailedQualities(result);
    const keyboard = buildYouTubeKeyboard(originalUrl, visitorId, qualities);

    try {
        if (result.thumbnail) {
            await ctx.replyWithPhoto(new InputFile({ url: result.thumbnail }), {
                caption: `${caption}\n\n${t('select_quality', lang)}`,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        } else {
            await ctx.reply(`${caption}\n\n${t('select_quality', lang)}`, {
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
    
    const premiumExpiryDays = getPremiumExpiryDays(ctx);
    const caption = buildCaption(result, lang, premiumExpiryDays);
    const keyboard = buildPhotoKeyboard(originalUrl);

    try {
        await ctx.replyWithPhoto(new InputFile({ url: bestImages[0].url }), {
            caption,
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });
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
    
    const premiumExpiryDays = getPremiumExpiryDays(ctx);
    const caption = buildCaption(result, lang, premiumExpiryDays);

    const mediaGroup: InputMediaPhoto[] = bestImages.slice(0, 10).map((img, index) => ({
        type: 'photo' as const,
        media: img.url,
        caption: index === 0 ? caption : undefined,
        parse_mode: index === 0 ? 'Markdown' as const : undefined,
    }));

    try {
        await ctx.replyWithMediaGroup(mediaGroup);
        
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
        
        // Determine URL limit based on user type
        const maxUrls = ctx.isPremium ? MAX_URLS_DONATOR : MAX_URLS_FREE;
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
        
        // Warn if URLs were ignored
        if (totalUrls > urls.length) {
            const ignored = totalUrls - urls.length;
            const warning = ctx.isPremium
                ? (lang === 'id' 
                    ? `⚠️ ${ignored} URL diabaikan (max ${MAX_URLS_DONATOR}/pesan)`
                    : `⚠️ ${ignored} URLs ignored (max ${MAX_URLS_DONATOR}/message)`)
                : (lang === 'id'
                    ? `⚠️ ${ignored} URL diabaikan. Free user: 1 URL/pesan. Gunakan /donate untuk multi-URL!`
                    : `⚠️ ${ignored} URLs ignored. Free users: 1 URL/message. Use /donate for multi-URL!`);
            
            await ctx.reply(warning, {
                reply_parameters: { message_id: ctx.message.message_id },
            });
        }
        
        // Process URLs sequentially
        for (const url of urls) {
            // Check global maintenance mode (synced with frontend via Redis)
            const isGlobalMaintenance = await botIsInMaintenance();
            if (isGlobalMaintenance && !ctx.isAdmin) {
                await ctx.reply('🚧 Service is under maintenance. Please try again later.', {
                    reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
                });
                return;
            }

            const platform = platformDetect(url);
            if (!platform) continue;

            ctx.session.pendingRetryUrl = url;
            ctx.session.lastPlatform = platform;

            const processingMsgId = await sendProcessingMessage(ctx, platform);
            if (!processingMsgId) continue;

            const result = await botUrlCallScraper(url, ctx.isPremium || false);

            if (result.success) {
                await deleteMessage(ctx, processingMsgId);
                
                const visitorId = generateVisitorId();
                const sent = await sendMediaByType(ctx, result, url, visitorId);
                
                if (sent) {
                    // Only delete user message on first successful download
                    if (url === urls[0]) {
                        await deleteMessage(ctx, ctx.message.message_id);
                    }
                    await botRateLimitRecordDownload(ctx);
                } else {
                    await ctx.reply(t('error_generic', lang), {
                        reply_markup: errorKeyboard(url),
                    });
                }
            } else {
                await editToError(ctx, processingMsgId, result.error || t('error_generic', lang), url, result.errorCode, result.platform);
            }
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
