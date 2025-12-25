/**
 * Telegram Bot URL Handler
 * Auto-detects social media URLs and processes downloads
 * 
 * Flow:
 * 1. Detect social media URL in message
 * 2. Send "⏳ Processing..." message (save message_id)
 * 3. Call internal scraper
 * 4. On success: DELETE processing message, send media file
 * 5. On fail: EDIT processing message to error with retry button
 */

import { Bot, InputFile } from 'grammy';

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
 */
async function botUrlSendMedia(ctx: BotContext, result: DownloadResult): Promise<boolean> {
    if (!result.success || !result.formats || result.formats.length === 0) {
        return false;
    }

    const platform = result.platform!;
    const emoji = botUrlGetPlatformEmoji(platform);
    
    // Build caption
    let caption = '';
    if (result.title) {
        caption = result.title.substring(0, 200);
        if (result.title.length > 200) caption += '...';
    }
    if (result.author) {
        caption += `\n\n👤 ${result.author}`;
    }
    caption += `\n\n${emoji} via @DownAriaBot`;

    // Find best format (prefer video, then image)
    const videoFormat = result.formats.find(f => f.type === 'video');
    const imageFormat = result.formats.find(f => f.type === 'image');
    const format = videoFormat || imageFormat;

    if (!format) {
        return false;
    }

    try {
        if (format.type === 'video') {
            await ctx.replyWithVideo(new InputFile({ url: format.url }), {
                caption,
                reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
            });
        } else {
            await ctx.replyWithPhoto(new InputFile({ url: format.url }), {
                caption,
                reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
            });
        }
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_MEDIA');
        
        // Fallback: send URL as text
        try {
            await ctx.reply(
                `${emoji} Download link:\n\n${format.url}\n\n${caption}`,
                {
                    reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
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

            // Send media
            const sent = await botUrlSendMedia(ctx, result);
            
            if (sent) {
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
