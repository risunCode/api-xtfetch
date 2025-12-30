/**
 * YouTube Quality Selection Callback Handlers
 * Handles: yt:* callbacks for YouTube quality selection with thumbnail preview
 * 
 * Callback patterns:
 * - yt:{visitorId}:{quality} - Select specific quality (1080p, 720p, 480p, 360p, m4a, mp3)
 * - yt:{visitorId}:cancel - Cancel the operation
 * 
 * Session data required: ctx.session.pendingYouTube
 * 
 * Flow:
 * 1. User sends YouTube URL
 * 2. url.ts detects YouTube, calls scraper
 * 3. url.ts stores result in session.pendingYouTube
 * 4. url.ts sends thumbnail with quality buttons (using buildYouTubeQualityKeyboard)
 * 5. User clicks quality button
 * 6. This handler processes the callback, calls merge API, sends merged video
 */

import { Bot, InputFile, InlineKeyboard } from 'grammy';

import { logger } from '@/lib/services/shared/logger';

import type { BotContext, PendingYouTube } from '../types';
import { getQualityLabel } from '../keyboards';
import { botRateLimitRecordDownload } from '../middleware';

// ============================================================================
// CONSTANTS
// ============================================================================

const MERGE_API_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002';
const MAX_DURATION_SECONDS = 300; // 5 minutes max for YouTube merge

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

import { escapeMarkdown } from '../helpers';

/**
 * Build YouTube caption with video info
 */
function buildYouTubeCaption(
    pending: PendingYouTube,
    quality: string,
    lang: 'en' | 'id'
): string {
    let caption = `🎬 *YouTube*\n\n`;
    
    if (pending.title) {
        const cleanTitle = pending.title.substring(0, 200);
        caption += `${escapeMarkdown(cleanTitle)}\n`;
    }
    
    if (pending.author) {
        caption += `👤 ${escapeMarkdown(pending.author)}\n`;
    }
    
    if (pending.duration) {
        caption += `⏱️ ${pending.duration}`;
        if (pending.views) {
            caption += ` • 👁️ ${pending.views}`;
        }
        caption += '\n';
    }
    
    caption += `\n📥 ${getQualityLabel(quality)}`;
    caption += '\n\n📥 via @DownAriaBot';
    
    return caption;
}

/**
 * Call YouTube merge API to combine video+audio streams
 */
async function callMergeApi(
    url: string,
    quality: string,
    title?: string
): Promise<{ buffer: Buffer; isAudio: boolean; filename: string } | { error: string }> {
    try {
        const response = await fetch(`${MERGE_API_URL}/api/v1/youtube/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                quality,
                filename: title?.substring(0, 100) || 'video',
            }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return { error: errorData.error || `Merge failed: ${response.status}` };
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'video/mp4';
        const isAudio = contentType.includes('audio');
        
        // Generate filename
        const ext = isAudio ? '.mp3' : '.mp4';
        const safeTitle = (title || 'video')
            .replace(/[^\w\s.-]/g, '_')
            .replace(/\s+/g, '_')
            .substring(0, 50);
        const filename = `${safeTitle}${ext}`;
        
        return { buffer, isAudio, filename };
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return { error: msg };
    }
}

// ============================================================================
// CALLBACK HANDLERS
// ============================================================================

/**
 * Handle YouTube quality callback
 * Pattern: yt:{visitorId}:{quality}
 */
export async function botCallbackYouTube(
    ctx: BotContext,
    visitorId: string,
    quality: string
): Promise<void> {
    const lang = ctx.from?.language_code?.startsWith('id') ? 'id' : 'en';
    
    // Handle cancel
    if (quality === 'cancel') {
        await ctx.answerCallbackQuery({ text: 'Cancelled' });
        try { await ctx.deleteMessage(); } catch {}
        ctx.session.pendingYouTube = undefined;
        return;
    }
    
    // Get pending YouTube from session
    const pending = ctx.session.pendingYouTube;
    
    if (!pending || pending.visitorId !== visitorId) {
        // Try to get URL from pendingDownload (backward compatibility)
        const pendingDownload = ctx.session.pendingDownload;
        if (pendingDownload && pendingDownload.platform === 'youtube') {
            // Redirect to callback-download handler
            const { botCallbackDownloadQuality } = await import('./callback-download');
            
            // Map quality to hd/sd/audio
            let mappedQuality: 'hd' | 'sd' | 'audio';
            if (['m4a', 'mp3'].includes(quality.toLowerCase())) {
                mappedQuality = 'audio';
            } else if (['1080p', '1440p', '2160p', '720p'].includes(quality)) {
                mappedQuality = 'hd';
            } else {
                mappedQuality = 'sd';
            }
            
            await botCallbackDownloadQuality(ctx, mappedQuality, pendingDownload.visitorId);
            return;
        }
        
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
        ctx.session.pendingYouTube = undefined;
        await ctx.answerCallbackQuery({
            text: lang === 'id'
                ? '⏰ Sesi kadaluarsa. Kirim URL baru.'
                : '⏰ Session expired. Send a new URL.',
            show_alert: true,
        });
        return;
    }
    
    // Answer callback with processing message
    const qualityLabel = getQualityLabel(quality);
    await ctx.answerCallbackQuery({
        text: lang === 'id'
            ? `⏳ Memproses ${qualityLabel}...`
            : `⏳ Processing ${qualityLabel}...`,
    });
    
    // Update message to show processing
    const processingMsg = lang === 'id'
        ? `⏳ Memproses ${qualityLabel}...\n\n💡 YouTube memerlukan merge video+audio, mohon tunggu 30-60 detik.`
        : `⏳ Processing ${qualityLabel}...\n\n💡 YouTube requires video+audio merge, please wait 30-60 seconds.`;
    
    try {
        await ctx.editMessageCaption({ caption: processingMsg });
    } catch {
        try { await ctx.editMessageText(processingMsg); } catch {}
    }
    
    // Build YouTube URL from videoId
    const youtubeUrl = `https://www.youtube.com/watch?v=${pending.videoId}`;
    
    // Call merge API
    logger.debug('telegram', `YouTube merge: ${youtubeUrl} @ ${quality}`);
    
    const result = await callMergeApi(youtubeUrl, quality, pending.title);
    
    if ('error' in result) {
        logger.error('telegram', result.error, 'YOUTUBE_MERGE');
        
        // Check for specific errors
        const isDurationError = result.error.includes('too long') || result.error.includes('duration');
        
        const errorMsg = isDurationError
            ? (lang === 'id'
                ? `❌ Video terlalu panjang.\n\n⏱️ Maksimal 5 menit untuk YouTube.\n\n🔗 Download manual:`
                : `❌ Video too long.\n\n⏱️ Maximum 5 minutes for YouTube.\n\n🔗 Manual download:`)
            : (lang === 'id'
                ? `❌ Gagal memproses video.\n\n🔗 Coba download manual:`
                : `❌ Failed to process video.\n\n🔗 Try manual download:`);
        
        const fallbackKeyboard = new InlineKeyboard()
            .url('📥 Download', youtubeUrl)
            .url('🔗 Original', youtubeUrl);
        
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
        return;
    }
    
    // Success - send merged file
    const { buffer, isAudio, filename } = result;
    const caption = buildYouTubeCaption(pending, quality, lang);
    const keyboard = new InlineKeyboard().url('🔗 Original', youtubeUrl);
    
    logger.debug('telegram', `YouTube merge complete: ${buffer.length} bytes, sending as ${filename}`);
    
    try {
        // Delete preview message
        try { await ctx.deleteMessage(); } catch {}
        
        if (isAudio) {
            await ctx.replyWithAudio(new InputFile(buffer, filename), {
                caption,
                parse_mode: 'Markdown',
                title: pending.title?.substring(0, 64),
                reply_markup: keyboard,
            });
        } else {
            await ctx.replyWithVideo(new InputFile(buffer, filename), {
                caption,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                supports_streaming: true,
            });
        }
        
        // Record successful download
        await botRateLimitRecordDownload(ctx);
        
        // Clear session
        ctx.session.pendingYouTube = undefined;
        
        logger.debug('telegram', `YouTube download sent: ${quality}`);
    } catch (sendError) {
        logger.error('telegram', sendError, 'YOUTUBE_SEND');
        
        // Fallback: send download link
        const fallbackMsg = lang === 'id'
            ? `❌ Gagal mengirim video.\n\n🔗 Download manual:`
            : `❌ Failed to send video.\n\n🔗 Manual download:`;
        
        await ctx.reply(fallbackMsg, {
            reply_markup: new InlineKeyboard()
                .url('📥 Download', youtubeUrl)
                .url('🔗 Original', youtubeUrl),
            link_preview_options: { is_disabled: true },
        });
    }
}

// ============================================================================
// MAIN HANDLER REGISTRATION
// ============================================================================

/**
 * Register YouTube callback handlers
 * 
 * Usage:
 * ```typescript
 * import { registerYouTubeCallbacks } from '@/bot/handlers/callback-youtube';
 * registerYouTubeCallbacks(bot);
 * ```
 */
export function registerYouTubeCallbacks(bot: Bot<BotContext>): void {
    // YouTube quality callbacks: yt:{visitorId}:{quality}
    bot.callbackQuery(/^yt:([^:]+):(.+)$/, async (ctx) => {
        const match = ctx.match;
        if (!match) return;

        const visitorId = match[1];
        const quality = match[2];

        logger.debug('telegram', `YouTube callback: ${quality} for ${visitorId}`);

        try {
            await botCallbackYouTube(ctx, visitorId, quality);
        } catch (error) {
            logger.error('telegram', error, 'YOUTUBE_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    buildYouTubeCaption,
    callMergeApi,
};
