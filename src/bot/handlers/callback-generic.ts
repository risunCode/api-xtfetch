/**
 * Generic Video Callback Handlers
 * Handles: gv:* callbacks for generic platform video downloads
 * 
 * Callback patterns:
 * - gv:{visitorId}:{index} - Download video at specific quality index
 * - gv:{visitorId}:audio - Download audio only
 * 
 * Session data required: ctx.session.pendingDownload
 * 
 * Flow:
 * 1. User sends URL from generic platform (rule34video, pornhub, eporner, etc.)
 * 2. url.ts detects platform, calls scraper
 * 3. url.ts stores result in session.pendingDownload
 * 4. url.ts sends thumbnail with quality buttons (using sendGenericVideoPreview)
 * 5. User clicks quality button
 * 6. This handler processes the callback, downloads video, sends to user
 */

import { Bot, InputFile, InlineKeyboard } from 'grammy';

import { logger } from '@/lib/services/shared/logger';

import type { BotContext, DownloadResult } from '../types';
import { botUrlGetPlatformName } from './url';
import { botRateLimitRecordDownload } from '../middleware';
import { detectLanguage, formatFilesize } from '../i18n';
import { escapeMarkdown } from '../helpers';
import { sanitizeTitle } from '../utils/format';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_TELEGRAM_FILESIZE = 50 * 1024 * 1024; // 50MB Telegram limit
const DOWNLOAD_TIMEOUT_MS = 120000; // 2 minutes timeout for large files

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch video with retry and timeout
 */
async function fetchVideoWithRetry(url: string, maxRetries = 3): Promise<Buffer> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.debug('telegram', `Download attempt ${attempt}/${maxRetries}: ${url.substring(0, 80)}...`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS / maxRetries);
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Referer': url, // Use same URL as referer
                },
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const buffer = Buffer.from(await response.arrayBuffer());
            logger.debug('telegram', `Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
            return buffer;
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            logger.debug('telegram', `Attempt ${attempt} failed: ${msg}`);
            
            if (attempt < maxRetries) {
                const delay = 2000 * attempt;
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw new Error(`All ${maxRetries} attempts failed: ${msg}`);
            }
        }
    }
    throw new Error('Retry logic error');
}

/**
 * Build caption for generic video
 */
function buildGenericCaption(
    result: DownloadResult,
    quality: string,
    lang: 'en' | 'id'
): string {
    const platformName = result.platform ? botUrlGetPlatformName(result.platform) : 'Download';
    
    let caption = `*${platformName}*\n\n`;
    
    if (result.title) {
        const cleanTitle = sanitizeTitle(result.title, 200);
        if (cleanTitle) caption += `${escapeMarkdown(cleanTitle)}\n`;
    }
    
    if (result.author && result.author !== 'Unknown') {
        caption += `👤 ${escapeMarkdown(result.author)}\n`;
    }
    
    caption += `\n📥 ${quality}`;
    caption += '\n\n📥 via @DownAriaBot';
    
    return caption;
}

// ============================================================================
// CALLBACK HANDLER
// ============================================================================

/**
 * Handle generic video quality callback
 * Pattern: gv:{visitorId}:{index|audio}
 */
export async function botCallbackGenericVideo(
    ctx: BotContext,
    visitorId: string,
    qualityParam: string
): Promise<void> {
    const lang = detectLanguage(ctx.from?.language_code);
    
    // Get pending download from session
    const pending = ctx.session.pendingDownload;
    
    if (!pending || pending.visitorId !== visitorId) {
        await ctx.answerCallbackQuery({
            text: lang === 'id'
                ? '⏰ Sesi kadaluarsa. Kirim URL baru.'
                : '⏰ Session expired. Send a new URL.',
            show_alert: true,
        });
        return;
    }
    
    // Check session timeout (5 minutes)
    if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
        ctx.session.pendingDownload = undefined;
        await ctx.answerCallbackQuery({
            text: lang === 'id'
                ? '⏰ Sesi kadaluarsa. Kirim URL baru.'
                : '⏰ Session expired. Send a new URL.',
            show_alert: true,
        });
        return;
    }
    
    const { result, url: originalUrl } = pending;
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    const audios = result.formats?.filter(f => f.type === 'audio') || [];
    
    // Determine which format to download
    let formatToSend: typeof videos[0] | undefined;
    let isAudio = false;
    
    if (qualityParam === 'audio') {
        formatToSend = audios[0];
        isAudio = true;
    } else {
        const index = parseInt(qualityParam, 10);
        if (!isNaN(index) && index >= 0 && index < videos.length) {
            formatToSend = videos[index];
        }
    }
    
    if (!formatToSend) {
        await ctx.answerCallbackQuery({
            text: lang === 'id' ? '❌ Format tidak tersedia' : '❌ Format not available',
            show_alert: true,
        });
        return;
    }
    
    // Check filesize before downloading
    if (formatToSend.filesize && formatToSend.filesize > MAX_TELEGRAM_FILESIZE) {
        // File too large - send direct link instead
        await ctx.answerCallbackQuery({
            text: lang === 'id' 
                ? '⚠️ File terlalu besar untuk Telegram' 
                : '⚠️ File too large for Telegram',
        });
        
        const filesizeMB = (formatToSend.filesize / 1024 / 1024).toFixed(0);
        const caption = lang === 'id'
            ? `⚠️ Video terlalu besar (${filesizeMB}MB) untuk Telegram.\nKlik tombol untuk download langsung.`
            : `⚠️ Video too large (${filesizeMB}MB) for Telegram.\nTap button to download directly.`;
        
        const keyboard = new InlineKeyboard()
            .url('▶️ Download', formatToSend.url)
            .url('🔗 Original', originalUrl);
        
        try {
            await ctx.editMessageCaption({
                caption,
                reply_markup: keyboard,
            });
        } catch {
            await ctx.reply(caption, {
                reply_markup: keyboard,
                link_preview_options: { is_disabled: true },
            });
        }
        return;
    }
    
    // Answer callback with processing message
    const qualityLabel = isAudio ? 'Audio' : formatToSend.quality;
    await ctx.answerCallbackQuery({
        text: lang === 'id'
            ? `⏳ Mengunduh ${qualityLabel}...`
            : `⏳ Downloading ${qualityLabel}...`,
    });
    
    // Update message to show processing
    const processingMsg = lang === 'id'
        ? `⏳ Mengunduh ${qualityLabel}...\n\n💡 Mohon tunggu, sedang memproses video.`
        : `⏳ Downloading ${qualityLabel}...\n\n💡 Please wait, processing video.`;
    
    try {
        await ctx.editMessageCaption({ caption: processingMsg });
    } catch {
        try { await ctx.editMessageText(processingMsg); } catch {}
    }
    
    // Show upload action
    await ctx.replyWithChatAction(isAudio ? 'upload_voice' : 'upload_video');
    
    try {
        // Download the video/audio
        logger.debug('telegram', `Generic download: ${formatToSend.url.substring(0, 80)}...`);
        const buffer = await fetchVideoWithRetry(formatToSend.url);
        
        // Build caption
        const caption = buildGenericCaption(result, qualityLabel, lang);
        const keyboard = new InlineKeyboard().url('🔗 Original', originalUrl);
        
        // Delete preview message
        try { await ctx.deleteMessage(); } catch {}
        
        // Send the media
        if (isAudio) {
            await ctx.replyWithAudio(new InputFile(buffer, 'audio.mp3'), {
                caption,
                parse_mode: 'Markdown',
                title: result.title?.substring(0, 64),
                reply_markup: keyboard,
            });
        } else {
            await ctx.replyWithVideo(new InputFile(buffer, 'video.mp4'), {
                caption,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                supports_streaming: true,
            });
        }
        
        // Record successful download
        await botRateLimitRecordDownload(ctx);
        
        // Clear session
        ctx.session.pendingDownload = undefined;
        
        logger.debug('telegram', `Generic download sent: ${qualityLabel}`);
        
    } catch (error) {
        logger.error('telegram', error, 'GENERIC_VIDEO_DOWNLOAD');
        
        // Fallback: send direct link
        const errorMsg = lang === 'id'
            ? `❌ Gagal mengunduh video.\n\n🔗 Download manual:`
            : `❌ Failed to download video.\n\n🔗 Manual download:`;
        
        const fallbackKeyboard = new InlineKeyboard()
            .url('▶️ Download', formatToSend.url)
            .url('🔗 Original', originalUrl);
        
        try {
            await ctx.editMessageCaption({
                caption: errorMsg,
                reply_markup: fallbackKeyboard,
            });
        } catch {
            await ctx.reply(errorMsg, {
                reply_markup: fallbackKeyboard,
                link_preview_options: { is_disabled: true },
            });
        }
    }
}

// ============================================================================
// MAIN HANDLER REGISTRATION
// ============================================================================

/**
 * Register generic video callback handlers
 * 
 * Usage:
 * ```typescript
 * import { registerGenericCallbacks } from '@/bot/handlers/callback-generic';
 * registerGenericCallbacks(bot);
 * ```
 */
export function registerGenericCallbacks(bot: Bot<BotContext>): void {
    // Generic video callbacks: gv:{visitorId}:{index|audio}
    bot.callbackQuery(/^gv:([^:]+):(.+)$/, async (ctx) => {
        const match = ctx.match;
        if (!match) return;

        const visitorId = match[1];
        const qualityParam = match[2];

        logger.debug('telegram', `Generic video callback: ${qualityParam} for ${visitorId}`);

        try {
            await botCallbackGenericVideo(ctx, visitorId, qualityParam);
        } catch (error) {
            logger.error('telegram', error, 'GENERIC_VIDEO_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    buildGenericCaption,
    fetchVideoWithRetry,
};
