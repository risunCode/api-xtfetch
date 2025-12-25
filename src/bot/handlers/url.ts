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

import type { BotContext, DownloadResult, ContentType } from '../types';
import { BOT_MESSAGES, detectContentType } from '../types';
import { botRateLimitRecordDownload } from '../middleware/rateLimit';
import { errorKeyboard, buildVideoKeyboard, buildPhotoKeyboard, buildYouTubeKeyboard, detectQualities } from '../keyboards';

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
 * Build caption with bold platform name and full title (no truncation)
 */
function buildCaption(result: DownloadResult): string {
    const platformName = botUrlGetPlatformName(result.platform!);
    
    let caption = `*${platformName}*\n\n`;
    
    // Full title - NO TRUNCATION
    if (result.title) {
        caption += `${result.title}\n`;
    }
    
    // Author
    if (result.author) {
        caption += `${result.author}`;
    }
    
    return caption.trim();
}

// ============================================================================
// SEND FUNCTIONS BY CONTENT TYPE
// ============================================================================

/**
 * Send video directly (non-YouTube)
 * Video is sent immediately with quality buttons for re-download options
 */
async function sendVideoDirectly(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string,
    visitorId: string
): Promise<boolean> {
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    if (videos.length === 0) return false;

    // Get best quality video (prefer HD)
    const hdVideo = videos.find(f => 
        f.quality.includes('1080') || f.quality.includes('720') || f.quality.toLowerCase().includes('hd')
    );
    const videoToSend = hdVideo || videos[0];

    const caption = buildCaption(result);
    const qualities = detectQualities(result);
    const keyboard = buildVideoKeyboard(originalUrl, visitorId, qualities);

    try {
        await ctx.replyWithVideo(new InputFile({ url: videoToSend.url }), {
            caption,
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_VIDEO');
        
        // Fallback: send as link
        try {
            await ctx.reply(`📥 Download:\n\n${caption}\n\n${videoToSend.url}`, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                link_preview_options: { is_disabled: true },
            });
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Send YouTube preview with thumbnail
 * User must select quality before download (needs conversion)
 */
async function sendYouTubePreview(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string,
    visitorId: string
): Promise<boolean> {
    const caption = buildCaption(result);
    const qualities = detectQualities(result);
    const keyboard = buildYouTubeKeyboard(originalUrl, visitorId, qualities);

    try {
        if (result.thumbnail) {
            // Send thumbnail with quality selection
            await ctx.replyWithPhoto(new InputFile({ url: result.thumbnail }), {
                caption: `${caption}\n\n📥 Select quality:`,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        } else {
            // No thumbnail - send text message
            await ctx.reply(`${caption}\n\n📥 Select quality:`, {
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
    const images = result.formats?.filter(f => f.type === 'image') || [];
    if (images.length === 0) return false;

    const caption = buildCaption(result);
    const keyboard = buildPhotoKeyboard(originalUrl);

    try {
        await ctx.replyWithPhoto(new InputFile({ url: images[0].url }), {
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
 * Send multiple photos as album (media group)
 * All photos sent at once, not as slider
 */
async function sendPhotoAlbum(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string
): Promise<boolean> {
    const images = result.formats?.filter(f => f.type === 'image') || [];
    if (images.length === 0) return false;

    const caption = buildCaption(result);

    // Build media group (max 10 photos)
    const mediaGroup: InputMediaPhoto[] = images.slice(0, 10).map((img, index) => ({
        type: 'photo' as const,
        media: img.url,
        caption: index === 0 ? caption : undefined,
        parse_mode: index === 0 ? 'Markdown' as const : undefined,
    }));

    try {
        // Send album
        await ctx.replyWithMediaGroup(mediaGroup);
        
        // Send keyboard separately (can't attach to media group)
        const keyboard = buildPhotoKeyboard(originalUrl);
        await ctx.reply('📥 Download complete!', { reply_markup: keyboard });
        
        return true;
    } catch (error) {
        logger.error('telegram', error, 'SEND_ALBUM');
        
        // Fallback: send first photo only
        return await sendSinglePhoto(ctx, result, originalUrl);
    }
}

// ============================================================================
// MAIN SEND FUNCTION
// ============================================================================

/**
 * Send media based on content type
 */
async function sendMediaByType(
    ctx: BotContext,
    result: DownloadResult,
    originalUrl: string,
    visitorId: string
): Promise<boolean> {
    const contentType = detectContentType(result);
    
    switch (contentType) {
        case 'youtube':
            // Store result for callback (user needs to select quality)
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
        const name = botUrlGetPlatformName(platform);
        const msg = await ctx.reply(`⏳ Processing ${name}...`, {
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

async function editToError(ctx: BotContext, messageId: number, error: string, url: string): Promise<void> {
    try {
        await ctx.api.editMessageText(ctx.chat!.id, messageId, `❌ ${error}`, {
            reply_markup: errorKeyboard(url),
        });
    } catch {
        await ctx.reply(`❌ ${error}`, { reply_markup: errorKeyboard(url) });
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
        
        // Skip commands
        if (text.startsWith('/')) return;
        
        const url = botUrlExtract(text);
        if (!url) return;

        const platform = platformDetect(url);
        if (!platform) {
            await ctx.reply(BOT_MESSAGES.ERROR_UNSUPPORTED, {
                reply_parameters: { message_id: ctx.message.message_id },
            });
            return;
        }

        // Store for retry
        ctx.session.pendingRetryUrl = url;
        ctx.session.lastPlatform = platform;

        const processingMsgId = await sendProcessingMessage(ctx, platform);
        if (!processingMsgId) return;

        const result = await botUrlCallScraper(url, ctx.isPremium || false);

        if (result.success) {
            await deleteMessage(ctx, processingMsgId);
            
            const visitorId = generateVisitorId();
            const sent = await sendMediaByType(ctx, result, url, visitorId);
            
            if (sent) {
                // Delete user message (clean chat)
                await deleteMessage(ctx, ctx.message.message_id);
                await botRateLimitRecordDownload(ctx);
            } else {
                await ctx.reply(BOT_MESSAGES.ERROR_GENERIC, {
                    reply_markup: errorKeyboard(url),
                });
            }
        } else {
            await editToError(ctx, processingMsgId, result.error || BOT_MESSAGES.ERROR_GENERIC, url);
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
};
