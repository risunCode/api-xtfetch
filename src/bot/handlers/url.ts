/**
 * Telegram Bot URL Handler
 * Auto-detects social media URLs and processes downloads
 * 
 * Flow:
 * 1. Detect social media URL in message
 * 2. Send "⏳ Processing..." message (save message_id)
 * 3. Call internal scraper
 * 4. On success: DELETE processing message, send media file, delete user message
 * 5. On fail: EDIT processing message to error with retry button
 */

import { Bot, InputFile, InlineKeyboard } from 'grammy';

import { platformDetect, type PlatformId } from '@/core/config';
import { runScraper } from '@/core/scrapers';
import { prepareUrl } from '@/lib/url';
import { cookiePoolGetRotating } from '@/lib/cookies';
import { logger } from '@/lib/services/shared/logger';
import { recordDownloadStat } from '@/lib/database';

import type { BotContext, DownloadResult } from '../types';
import { BOT_MESSAGES } from '../types';
import { botRateLimitRecordDownload } from '../middleware/rateLimit';
import { errorKeyboard } from '../keyboards';

// ============================================================================
// URL DETECTION
// ============================================================================

/** Regex to extract URLs from message text */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

/** Supported platform domains for quick check */
const SUPPORTED_DOMAINS = [
    'youtube.com', 'youtu.be',
    'instagram.com', 'instagr.am',
    'tiktok.com',
    'twitter.com', 'x.com', 't.co',
    'facebook.com', 'fb.com', 'fb.watch',
    'weibo.com', 'weibo.cn',
];

/**
 * Extract first social media URL from message text
 */
function botUrlExtract(text: string): string | null {
    const matches = text.match(URL_REGEX);
    if (!matches) return null;

    // Find first URL that matches a supported platform
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
 * Get platform emoji for display
 */
function botUrlGetPlatformEmoji(platform: PlatformId): string {
    const emojis: Record<PlatformId, string> = {
        youtube: '▶️',
        instagram: '📸',
        tiktok: '🎵',
        twitter: '𝕏',
        facebook: '📘',
        weibo: '🔴',
    };
    return emojis[platform] || '📥';
}

/**
 * Get platform display name
 */
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
// INTERNAL SCRAPER CALL
// ============================================================================

/**
 * Call internal scraper (same logic as /api/v1/publicservices)
 * Uses private cookie tier for premium users, public for free users
 */
async function botUrlCallScraper(url: string, isPremium: boolean = false): Promise<DownloadResult> {
    const startTime = Date.now();

    try {
        // Prepare URL (resolve short URLs, detect platform)
        const urlResult = await prepareUrl(url);
        
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return {
                success: false,
                error: urlResult.assessment.errorMessage || 'Invalid URL or unsupported platform',
                errorCode: 'INVALID_URL',
            };
        }

        const platform = urlResult.platform;
        logger.request(platform, 'telegram' as 'web');

        // Get cookie from pool - premium users get private tier with fallback to public
        const tier = isPremium ? 'private' : 'public';
        const poolCookie = await cookiePoolGetRotating(platform, tier);

        // Run scraper
        const result = await runScraper(platform, urlResult.resolvedUrl, {
            cookie: poolCookie || undefined,
        });

        const responseTime = Date.now() - startTime;

        // Record stats (async, don't wait)
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
// MESSAGE HANDLERS
// ============================================================================

/**
 * Send processing message
 */
async function botUrlSendProcessing(ctx: BotContext, platform: PlatformId): Promise<number | null> {
    try {
        const emoji = botUrlGetPlatformEmoji(platform);
        const name = botUrlGetPlatformName(platform);
        
        const message = await ctx.reply(`${emoji} Processing ${name} link...`, {
            reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
        });
        
        return message.message_id;
    } catch {
        return null;
    }
}

/**
 * Delete processing message
 */
async function botUrlDeleteProcessing(ctx: BotContext, messageId: number): Promise<void> {
    try {
        await ctx.api.deleteMessage(ctx.chat!.id, messageId);
    } catch {
        // Ignore deletion errors
    }
}

/**
 * Delete user's original message (clean chat feature)
 * Called after successfully sending media
 */
async function deleteUserMessage(ctx: BotContext): Promise<void> {
    try {
        if (ctx.message?.message_id && ctx.chat?.id) {
            await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
        }
    } catch {
        // Ignore - message may already be deleted or bot lacks permission
    }
}

// ============================================================================
// CAPTION & KEYBOARD BUILDERS
// ============================================================================

/**
 * Build minimal caption for media
 * Format: Author (first line) + Title truncated to 20 chars (second line)
 */
function buildMinimalCaption(result: DownloadResult): string {
    let caption = '';
    
    // Author first
    if (result.author) {
        caption = result.author;
    }
    
    // Title second (max 20 chars)
    if (result.title) {
        const shortTitle = result.title.substring(0, 20);
        caption += caption ? `\n${shortTitle}${result.title.length > 20 ? '...' : ''}` : shortTitle;
    }
    
    return caption;
}

/**
 * Build inline keyboard for media with Origin URL and optional HD button
 */
function buildMediaKeyboard(originalUrl: string, hdUrl?: string): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    
    // HD Quality - only if file >40MB (hdUrl is passed when SD was sent instead)
    if (hdUrl) {
        keyboard.url('🎬 HD Quality', hdUrl);
    }
    
    // Origin URL - always show
    keyboard.url('🔗 Origin URL', originalUrl);
    
    return keyboard;
}

/**
 * Edit processing message to show error
 */
async function botUrlEditToError(
    ctx: BotContext, 
    messageId: number, 
    error: string,
    url: string
): Promise<void> {
    try {
        await ctx.api.editMessageText(
            ctx.chat!.id,
            messageId,
            `❌ ${error}`,
            {
                reply_markup: errorKeyboard(url),
            }
        );
    } catch {
        // If edit fails, try sending new message
        await ctx.reply(`❌ ${error}`, {
            reply_markup: errorKeyboard(url),
        });
    }
}

/**
 * Send media result to user
 * Features:
 * - Minimal caption (author + truncated title)
 * - Origin URL button (always)
 * - HD button (if video >40MB and SD available)
 * - Large file handling (>40MB sends SD or direct link)
 */
async function botUrlSendMedia(ctx: BotContext, result: DownloadResult, originalUrl: string): Promise<boolean> {
    if (!result.success || !result.formats || result.formats.length === 0) {
        return false;
    }

    const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40MB Telegram limit
    
    // Build minimal caption
    const caption = buildMinimalCaption(result);

    // Find video and image formats
    const videoFormats = result.formats.filter(f => f.type === 'video');
    const imageFormats = result.formats.filter(f => f.type === 'image');
    
    // Sort video formats by quality (HD first, then SD)
    const hdVideo = videoFormats.find(f => 
        f.quality.toLowerCase().includes('hd') || 
        f.quality.includes('1080') || 
        f.quality.includes('720')
    ) || videoFormats[0];
    
    const sdVideo = videoFormats.find(f => 
        f.quality.toLowerCase().includes('sd') || 
        f.quality.includes('480') || 
        f.quality.includes('360')
    ) || (videoFormats.length > 1 ? videoFormats[videoFormats.length - 1] : null);

    const imageFormat = imageFormats[0];

    // Determine which format to send
    let formatToSend = hdVideo || imageFormat;
    let hdUrl: string | undefined;

    // Check if video is too large (>40MB)
    if (formatToSend?.type === 'video' && formatToSend.filesize && formatToSend.filesize > MAX_FILE_SIZE) {
        // Try to find SD format
        if (sdVideo && sdVideo !== hdVideo && (!sdVideo.filesize || sdVideo.filesize <= MAX_FILE_SIZE)) {
            // Send SD, provide HD link
            hdUrl = formatToSend.url;
            formatToSend = sdVideo;
        } else {
            // No suitable SD, send direct link instead
            const keyboard = buildMediaKeyboard(originalUrl, formatToSend.url);
            try {
                await ctx.reply(
                    `📥 *Video too large for Telegram*\n\n${caption}\n\nUse the buttons below to download:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard,
                        link_preview_options: { is_disabled: true },
                    }
                );
                return true;
            } catch {
                return false;
            }
        }
    }

    if (!formatToSend) {
        return false;
    }

    // Build keyboard with Origin URL (and HD if we're sending SD)
    const keyboard = buildMediaKeyboard(originalUrl, hdUrl);

    try {
        if (formatToSend.type === 'video') {
            await ctx.replyWithVideo(new InputFile({ url: formatToSend.url }), {
                caption,
                reply_markup: keyboard,
            });
        } else {
            await ctx.replyWithPhoto(new InputFile({ url: formatToSend.url }), {
                caption,
                reply_markup: keyboard,
            });
        }
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_MEDIA');
        
        // Fallback: send URL as text with keyboard
        try {
            await ctx.reply(
                `📥 Download link:\n\n${caption}\n\n${formatToSend.url}`,
                {
                    reply_markup: keyboard,
                    link_preview_options: { is_disabled: true },
                }
            );
            return true;
        } catch {
            return false;
        }
    }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * URL handler - processes social media URLs in messages
 * 
 * Usage:
 * ```typescript
 * import { registerUrlHandler } from '@/bot/handlers/url';
 * registerUrlHandler(bot);
 * ```
 */
export function registerUrlHandler(bot: Bot<BotContext>): void {
    // Listen for text messages
    bot.on('message:text', async (ctx) => {
        const text = ctx.message.text;
        
        // Extract URL from message
        const url = botUrlExtract(text);
        if (!url) {
            // No social media URL found - ignore silently
            return;
        }

        // Detect platform
        const platform = platformDetect(url);
        if (!platform) {
            // Unsupported platform
            await ctx.reply(BOT_MESSAGES.ERROR_UNSUPPORTED, {
                reply_parameters: { message_id: ctx.message.message_id },
            });
            return;
        }

        // Store URL in session for retry
        ctx.session.pendingRetryUrl = url;
        ctx.session.lastPlatform = platform;

        // Send processing message
        const processingMsgId = await botUrlSendProcessing(ctx, platform);

        // Call scraper (pass premium status for cookie tier)
        const result = await botUrlCallScraper(url, ctx.isPremium || false);

        if (result.success) {
            // Delete processing message
            if (processingMsgId) {
                await botUrlDeleteProcessing(ctx, processingMsgId);
            }

            // Send media with minimal caption and Origin URL button
            const sent = await botUrlSendMedia(ctx, result, url);
            
            if (sent) {
                // Delete user's original message (clean chat)
                await deleteUserMessage(ctx);
                
                // Record successful download for rate limiting
                await botRateLimitRecordDownload(ctx);
            } else {
                // Failed to send media
                await ctx.reply(BOT_MESSAGES.ERROR_GENERIC, {
                    reply_parameters: { message_id: ctx.message.message_id },
                    reply_markup: errorKeyboard(url),
                });
            }
        } else {
            // Edit processing message to show error
            if (processingMsgId) {
                await botUrlEditToError(ctx, processingMsgId, result.error || BOT_MESSAGES.ERROR_GENERIC, url);
            } else {
                await ctx.reply(`❌ ${result.error || BOT_MESSAGES.ERROR_GENERIC}`, {
                    reply_parameters: { message_id: ctx.message.message_id },
                    reply_markup: errorKeyboard(url),
                });
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
    botUrlGetPlatformEmoji,
    botUrlGetPlatformName,
};
