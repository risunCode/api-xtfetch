/**
 * Telegram Bot Callback Handler
 * Handles inline button callbacks
 * 
 * Callback actions:
 * - how_to_use: Show usage instructions
 * - contact_admin: Show admin contact info
 * - have_api_key: Show API key linking instructions
 * - retry_download: Retry last failed download
 * - cancel: Cancel current operation
 * - back_to_menu: Return to main menu
 * 
 * Download quality callbacks:
 * - dl:hd:{visitorId} - Download HD quality
 * - dl:sd:{visitorId} - Download SD quality
 * - dl:audio:{visitorId} - Download audio only
 * - dl:cancel:{visitorId} - Cancel and delete preview message
 * 
 * Menu command callbacks:
 * - cmd:mystatus - Trigger /mystatus
 * - cmd:history - Trigger /history
 * - cmd:donate - Trigger /donate
 * - cmd:privacy - Trigger /privacy
 * - cmd:help - Trigger /help
 * - cmd:menu - Trigger /menu
 */

import { Bot, InputFile, InlineKeyboard } from 'grammy';

import { logger } from '@/lib/services/shared/logger';

import type { BotContext, CallbackAction, DownloadResult } from '../types';
import { botUrlCallScraper, botUrlGetPlatformName } from './url';
import { botRateLimitRecordDownload } from '../middleware/rateLimit';
import { 
    startKeyboard, 
    DONATE,
    backKeyboard,
    errorKeyboard,
} from '../keyboards';
import { ADMIN_CONTACT_USERNAME } from '../config';

// ============================================================================
// CALLBACK DATA PARSING
// ============================================================================

/**
 * Parse callback data string into action and payload
 * Format: "action" or "action:payload"
 */
function botCallbackParse(data: string): { action: string; payload?: string } {
    const [action, ...payloadParts] = data.split(':');
    const payload = payloadParts.length > 0 ? payloadParts.join(':') : undefined;
    return { action, payload };
}

// ============================================================================
// CALLBACK HANDLERS
// ============================================================================

/**
 * Handle "how_to_use" callback
 */
async function botCallbackHowToUse(ctx: BotContext): Promise<void> {
    const message = `📖 *How to Use DownAria Bot*

1️⃣ *Send a Link*
Just paste any social media link and I'll download it automatically.

2️⃣ *Supported Platforms*
• YouTube - Videos & Shorts
• Instagram - Posts, Reels, Stories
• TikTok - Videos
• Twitter/X - Videos & Images
• Facebook - Videos
• Weibo - Videos & Images

3️⃣ *Tips*
• Send one link at a time
• Wait for download to complete before sending another
• Use /start to see this menu again

4️⃣ *Limits*
• Free: 10 downloads/day, 30s cooldown
• Premium: Unlimited downloads, no cooldown

Need help? Contact @${ADMIN_CONTACT_USERNAME}`;

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: backKeyboard('back_to_menu'),
    });
}

/**
 * Handle "contact_admin" callback
 */
async function botCallbackContactAdmin(ctx: BotContext): Promise<void> {
    const message = `📞 *Contact Support*

For help or issues, contact us:

• Telegram: @${ADMIN_CONTACT_USERNAME}

Please include:
• The URL you tried to download
• Any error message you received
• Your Telegram username`;

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: backKeyboard('back_to_menu'),
    });
}

/**
 * Handle "have_api_key" callback
 */
async function botCallbackHaveApiKey(ctx: BotContext): Promise<void> {
    const message = `🔑 *Link Your API Key*

To get unlimited downloads:

1️⃣ Get an API key from @${ADMIN_CONTACT_USERNAME}
2️⃣ Send your key using this command:
   \`/apikey YOUR_API_KEY_HERE\`

*Benefits of VIP:*
• ✅ Unlimited downloads
• ✅ No cooldown between downloads
• ✅ Priority support
• ✅ Higher quality options

Don't have a key? Contact @${ADMIN_CONTACT_USERNAME}`;

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: DONATE.info(),
    });
}

/**
 * Handle "retry_download" callback
 */
async function botCallbackRetryDownload(ctx: BotContext, payload?: string): Promise<void> {
    // Get URL from payload or session
    const url = payload || ctx.session.pendingRetryUrl;
    
    if (!url) {
        await ctx.answerCallbackQuery({ text: '❌ No URL to retry. Please send a new link.' });
        return;
    }

    await ctx.answerCallbackQuery({ text: '🔄 Retrying...' });

    // Edit message to show processing
    try {
        await ctx.editMessageText('⏳ Retrying download...');
    } catch {
        // Message might be deleted
    }

    // Call scraper
    const result = await botUrlCallScraper(url);

    if (result.success && result.formats && result.formats.length > 0) {
        // Delete processing message
        try {
            await ctx.deleteMessage();
        } catch {
            // Ignore
        }

        // Build caption
        const platformName = result.platform ? botUrlGetPlatformName(result.platform) : 'Download';
        let caption = `*${platformName}*\n\n`;
        if (result.title) {
            caption += result.title.substring(0, 200);
            if (result.title.length > 200) caption += '...';
        }
        if (result.author) {
            caption += `\n${result.author}`;
        }

        // Send media
        const format = result.formats?.find(f => f.type === 'video') || result.formats?.[0];
        
        if (!format) {
            await ctx.reply('❌ No media found');
            return;
        }
        
        const mediaUrl = format.url;
        const thumbUrl = result.thumbnail;
        const needsDownloadFirst = mediaUrl.includes('fbcdn.net') || mediaUrl.includes('cdninstagram.com');
        
        // Helper: fetch with retry for CDN URLs
        const fetchWithRetry = async (url: string, maxRetries = 3): Promise<Buffer> => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[Bot.Callback] Attempt ${attempt}/${maxRetries}`);
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 25000);
                    
                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://www.facebook.com/',
                        },
                        signal: controller.signal,
                    });
                    
                    clearTimeout(timeoutId);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    
                    const buffer = Buffer.from(await response.arrayBuffer());
                    console.log(`[Bot.Callback] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
                    return buffer;
                } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Unknown error';
                    console.log(`[Bot.Callback] Attempt ${attempt} failed: ${msg}`);
                    
                    if (attempt < maxRetries) {
                        const delay = 2000 * attempt;
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
                // Download to buffer first for Facebook/Instagram with retry
                const buffer = await fetchWithRetry(mediaUrl);
                
                if (format.type === 'video') {
                    await ctx.replyWithVideo(new InputFile(buffer, 'video.mp4'), { caption, parse_mode: 'Markdown' });
                } else {
                    await ctx.replyWithPhoto(new InputFile(buffer, 'photo.jpg'), { caption, parse_mode: 'Markdown' });
                }
            } else {
                if (format.type === 'video') {
                    await ctx.replyWithVideo(new InputFile({ url: mediaUrl }), { caption, parse_mode: 'Markdown' });
                } else {
                    await ctx.replyWithPhoto(new InputFile({ url: mediaUrl }), { caption, parse_mode: 'Markdown' });
                }
            }
            
            // Record successful download
            await botRateLimitRecordDownload(ctx);
        } catch (error) {
            logger.error('telegram', error, 'RETRY_SEND_MEDIA');
            
            // Fallback: Send thumbnail with download buttons instead of raw link
            const lang = ctx.from?.language_code?.startsWith('id') ? 'id' : 'en';
            const fallbackCaption = lang === 'id'
                ? `📥 *${platformName}*\n\n` +
                  `${result.title ? result.title.substring(0, 200) + '\n' : ''}` +
                  `${result.author ? result.author + '\n' : ''}\n` +
                  `⚠️ Gagal mengirim video.`
                : `📥 *${platformName}*\n\n` +
                  `${result.title ? result.title.substring(0, 200) + '\n' : ''}` +
                  `${result.author ? result.author + '\n' : ''}\n` +
                  `⚠️ Failed to send video.`;
            
            const fallbackKeyboard = new InlineKeyboard()
                .url('▶️ ' + (lang === 'id' ? 'Tonton' : 'Watch'), format.url)
                .url('🔗 Original', url);
            
            // Try to send thumbnail with buttons
            if (thumbUrl) {
                const thumbNeedsDownload = thumbUrl.includes('fbcdn.net') || thumbUrl.includes('cdninstagram.com');
                if (thumbNeedsDownload) {
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
                        } else {
                            throw new Error('Thumb download failed');
                        }
                    } catch {
                        // Thumbnail failed, send text
                        await ctx.reply(fallbackCaption, {
                            parse_mode: 'Markdown',
                            reply_markup: fallbackKeyboard,
                            link_preview_options: { is_disabled: true },
                        });
                    }
                } else {
                    await ctx.replyWithPhoto(new InputFile({ url: thumbUrl }), {
                        caption: fallbackCaption,
                        parse_mode: 'Markdown',
                        reply_markup: fallbackKeyboard,
                    });
                }
            } else {
                // No thumbnail, send text message with buttons
                await ctx.reply(fallbackCaption, {
                    parse_mode: 'Markdown',
                    reply_markup: fallbackKeyboard,
                    link_preview_options: { is_disabled: true },
                });
            }
        }
    } else {
        // Edit to show error
        try {
            await ctx.editMessageText(`❌ ${result.error || 'Failed to download. Please try again later.'}`, {
                reply_markup: errorKeyboard(url),
            });
        } catch {
            await ctx.reply(`❌ ${result.error || 'Failed to download. Please try again later.'}`);
        }
    }
}

/**
 * Handle "cancel" callback
 */
async function botCallbackCancel(ctx: BotContext): Promise<void> {
    await ctx.answerCallbackQuery({ text: 'Cancelled' });
    try {
        await ctx.deleteMessage();
    } catch {
        // Ignore deletion errors
    }
}

/**
 * Handle "back_to_menu" callback
 */
async function botCallbackBackToMenu(ctx: BotContext): Promise<void> {
    const message = `👋 *Welcome to DownAria Bot!*

Send me any social media link and I'll download it for you.

*Supported Platforms:*
• YouTube • Instagram • TikTok
• Twitter/X • Facebook • Weibo`;

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: startKeyboard(),
    });
}

// ============================================================================
// DOWNLOAD QUALITY CALLBACKS
// ============================================================================

/**
 * Find format by quality preference
 */
function findFormatByQuality(
    formats: DownloadResult['formats'],
    quality: 'hd' | 'sd' | 'audio'
): { quality: string; type: 'video' | 'audio' | 'image'; url: string; filesize?: number } | undefined {
    if (!formats || formats.length === 0) return undefined;

    if (quality === 'audio') {
        return formats.find(f => f.type === 'audio') || formats[0];
    }

    if (quality === 'hd') {
        return formats.find(f => 
            f.type === 'video' && (
                f.quality.includes('1080') || 
                f.quality.includes('720') || 
                f.quality.toLowerCase().includes('hd')
            )
        ) || formats.find(f => f.type === 'video');
    }

    // SD quality
    return formats.find(f => 
        f.type === 'video' && (
            f.quality.includes('480') || 
            f.quality.includes('360') || 
            f.quality.toLowerCase().includes('sd')
        )
    ) || formats.find(f => f.type === 'video');
}

/**
 * Handle download quality callback
 * Pattern: dl:(hd|sd|audio|cancel):{visitorId}
 * 
 * For YouTube: calls merge API to combine video+audio streams
 * For other platforms: sends URL directly
 */
async function botCallbackDownloadQuality(
    ctx: BotContext,
    quality: 'hd' | 'sd' | 'audio' | 'cancel',
    visitorId: string
): Promise<void> {
    // Cancel - just delete the message
    if (quality === 'cancel') {
        await ctx.deleteMessage();
        await ctx.answerCallbackQuery('Cancelled');
        ctx.session.pendingDownload = undefined;
        return;
    }

    // Get pending download from session
    const pending = ctx.session.pendingDownload;
    
    // Session expired - try to extract URL from keyboard
    if (!pending || pending.visitorId !== visitorId) {
        // Try to get Original URL from inline keyboard
        const keyboard = ctx.callbackQuery?.message?.reply_markup?.inline_keyboard;
        let originalUrl: string | null = null;
        
        if (keyboard) {
            for (const row of keyboard) {
                for (const btn of row) {
                    // Check if button has url property (URL button type)
                    if ('url' in btn && btn.url && (btn.text?.includes('Original') || btn.text?.includes('🔗'))) {
                        originalUrl = btn.url;
                        break;
                    }
                }
                if (originalUrl) break;
            }
        }
        
        if (originalUrl) {
            // Re-scrape and send
            await ctx.answerCallbackQuery({ text: '⏳ Re-fetching...' });
            
            try {
                await ctx.editMessageCaption({ caption: '⏳ Re-fetching media...' });
            } catch {
                try { await ctx.editMessageText('⏳ Re-fetching media...'); } catch {}
            }
            
            const result = await botUrlCallScraper(originalUrl, ctx.isVip || false);
            
            if (result.success && result.formats) {
                const formatToSend = findFormatByQuality(result.formats, quality);
                
                if (formatToSend) {
                    try {
                        await ctx.deleteMessage();
                        
                        let caption = result.title || '';
                        if (result.author) caption += `\n\n👤 ${result.author}`;
                        caption += '\n\n📥 via @DownAriaBot';
                        
                        if (quality === 'audio') {
                            await ctx.replyWithAudio(new InputFile({ url: formatToSend.url }), {
                                caption,
                                title: result.title?.substring(0, 64),
                            });
                        } else {
                            await ctx.replyWithVideo(new InputFile({ url: formatToSend.url }), { caption });
                        }
                        
                        await botRateLimitRecordDownload(ctx);
                        return;
                    } catch (error) {
                        logger.error('telegram', error, 'REFETCH_SEND');
                        await ctx.reply(`🔗 Download link:\n${formatToSend.url}`, {
                            link_preview_options: { is_disabled: true },
                        });
                        return;
                    }
                }
            }
            
            await ctx.answerCallbackQuery({ text: '❌ Failed to fetch. Try again.', show_alert: true });
            return;
        }
        
        await ctx.answerCallbackQuery({ 
            text: '⏰ Sesi kadaluarsa. Kirim URL baru untuk download.',
            show_alert: true 
        });
        return;
    }

    const lang = ctx.from?.language_code?.startsWith('id') ? 'id' : 'en';
    const isYouTube = pending.platform === 'youtube';
    
    // Answer callback immediately
    const qualityLabel = quality === 'audio' ? 'audio' : quality.toUpperCase();
    await ctx.answerCallbackQuery(`⏳ ${isYouTube ? 'Processing' : 'Downloading'} ${qualityLabel}...`);

    // Edit message to show processing status
    const processingMsg = isYouTube
        ? (lang === 'id' 
            ? `⏳ Memproses ${qualityLabel}...\n\n💡 YouTube memerlukan merge video+audio, mohon tunggu 30-60 detik.`
            : `⏳ Processing ${qualityLabel}...\n\n💡 YouTube requires video+audio merge, please wait 30-60 seconds.`)
        : `⏳ Downloading ${qualityLabel} quality...`;
    
    try {
        await ctx.editMessageCaption({ caption: processingMsg });
    } catch {
        try {
            await ctx.editMessageText(processingMsg);
        } catch {
            // Ignore edit errors
        }
    }

    // Find the right format
    const formats = pending.result.formats || [];
    const formatToSend = findFormatByQuality(formats, quality);

    if (!formatToSend) {
        const errorMsg = lang === 'id' ? '❌ Format tidak tersedia' : '❌ Format not available';
        try {
            await ctx.editMessageCaption({ caption: errorMsg });
        } catch {
            try { await ctx.editMessageText(errorMsg); } catch { await ctx.reply(errorMsg); }
        }
        return;
    }

    try {
        // Build caption
        let caption = '';
        if (pending.result.title) {
            caption = pending.result.title.substring(0, 200);
            if (pending.result.title.length > 200) caption += '...';
        }
        if (pending.result.author) {
            caption += `\n\n👤 ${pending.result.author}`;
        }
        caption += '\n\n📥 via @DownAriaBot';

        // Create simple keyboard with only Original URL button
        const simpleKeyboard = new InlineKeyboard().url('🔗 Original', pending.url);

        // ========================================
        // YouTube: Call merge API
        // ========================================
        if (isYouTube) {
            // Determine quality parameter for merge API
            let mergeQuality: string;
            if (quality === 'audio') {
                mergeQuality = 'mp3';
            } else if (quality === 'hd') {
                // Find HD format height
                const hdFormat = formats.find(f => 
                    f.type === 'video' && (
                        f.quality.includes('1080') || 
                        f.quality.includes('720') || 
                        f.quality.toLowerCase().includes('hd')
                    )
                );
                mergeQuality = hdFormat?.quality.match(/\d+/)?.[0] + 'p' || '720p';
            } else {
                // SD quality
                const sdFormat = formats.find(f => 
                    f.type === 'video' && (
                        f.quality.includes('480') || 
                        f.quality.includes('360') || 
                        f.quality.toLowerCase().includes('sd')
                    )
                );
                mergeQuality = sdFormat?.quality.match(/\d+/)?.[0] + 'p' || '360p';
            }
            
            logger.debug('telegram', `YouTube merge: ${pending.url} @ ${mergeQuality}`);
            
            try {
                // Call merge API internally
                const mergeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002'}/api/v1/youtube/merge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: pending.url,
                        quality: mergeQuality,
                        filename: pending.result.title?.substring(0, 100) || 'video',
                    }),
                });
                
                if (!mergeResponse.ok) {
                    const errorData = await mergeResponse.json().catch(() => ({}));
                    throw new Error(errorData.error || `Merge failed: ${mergeResponse.status}`);
                }
                
                // Get the merged file as buffer
                const mergedBuffer = Buffer.from(await mergeResponse.arrayBuffer());
                const contentType = mergeResponse.headers.get('content-type') || 'video/mp4';
                const isAudioFile = contentType.includes('audio');
                
                // Generate filename
                const ext = isAudioFile ? '.mp3' : '.mp4';
                const safeTitle = (pending.result.title || 'video')
                    .replace(/[^\w\s.-]/g, '_')
                    .replace(/\s+/g, '_')
                    .substring(0, 50);
                const filename = `${safeTitle}${ext}`;
                
                logger.debug('telegram', `YouTube merge complete: ${mergedBuffer.length} bytes, sending as ${filename}`);
                
                // Delete preview message
                try { await ctx.deleteMessage(); } catch {}
                
                // Send merged file
                if (isAudioFile) {
                    await ctx.replyWithAudio(new InputFile(mergedBuffer, filename), {
                        caption,
                        title: pending.result.title?.substring(0, 64),
                        reply_markup: simpleKeyboard,
                    });
                } else {
                    await ctx.replyWithVideo(new InputFile(mergedBuffer, filename), {
                        caption,
                        reply_markup: simpleKeyboard,
                        supports_streaming: true,
                    });
                }
                
                // Record successful download
                await botRateLimitRecordDownload(ctx);
                ctx.session.pendingDownload = undefined;
                
                logger.debug('telegram', `YouTube download sent: ${quality} quality`);
                return;
                
            } catch (mergeError) {
                logger.error('telegram', mergeError, 'YOUTUBE_MERGE');
                
                // Extract error message
                const errorMsg = mergeError instanceof Error ? mergeError.message : 'Unknown error';
                const isDurationError = errorMsg.includes('too long') || errorMsg.includes('duration');
                
                // Show specific error for duration limit
                const fallbackMsg = isDurationError
                    ? (lang === 'id'
                        ? `❌ Video terlalu panjang.\n\n⏱️ Maksimal 5 menit untuk YouTube.\n\n🔗 Download manual:`
                        : `❌ Video too long.\n\n⏱️ Maximum 5 minutes for YouTube.\n\n🔗 Manual download:`)
                    : (lang === 'id'
                        ? `❌ Gagal memproses video.\n\n🔗 Coba download manual:`
                        : `❌ Failed to process video.\n\n🔗 Try manual download:`);
                
                await ctx.reply(fallbackMsg, {
                    reply_markup: new InlineKeyboard()
                        .url('📥 Download', pending.url)
                        .url('🔗 Original', pending.url),
                    link_preview_options: { is_disabled: true },
                });
                return;
            }
        }

        // ========================================
        // Non-YouTube: Send URL directly
        // ========================================
        
        // Delete the preview message (thumbnail with quality buttons)
        try { await ctx.deleteMessage(); } catch {}

        // Send the media with only Original URL button
        if (quality === 'audio') {
            await ctx.replyWithAudio(new InputFile({ url: formatToSend.url }), {
                caption,
                title: pending.result.title?.substring(0, 64),
                reply_markup: simpleKeyboard,
            });
        } else {
            await ctx.replyWithVideo(new InputFile({ url: formatToSend.url }), {
                caption,
                reply_markup: simpleKeyboard,
            });
        }

        // Record successful download
        await botRateLimitRecordDownload(ctx);

        // Clear session after successful download
        ctx.session.pendingDownload = undefined;

        logger.debug('telegram', `Download sent: ${quality} quality for ${pending.platform}`);
    } catch (error) {
        logger.error('telegram', error, 'DOWNLOAD_QUALITY_SEND');
        
        // Try to send URL as fallback
        try {
            await ctx.reply(
                `❌ Failed to send media directly.\n\n🔗 Download link:\n${formatToSend.url}`,
                { link_preview_options: { is_disabled: true } }
            );
        } catch {
            await ctx.reply('❌ Failed to download. Please try again.');
        }
    }
}

// ============================================================================
// SEND STRATEGY CALLBACKS (Multi-Item Content)
// ============================================================================

/**
 * Handle send strategy callback for multi-item content
 * Pattern: strategy:{visitorId}:(group|single|links)
 * 
 * Strategies:
 * - group: Send all items as a Telegram media group (album)
 * - single: Send items one by one as separate messages
 * - links: Send only download links without media
 * 
 * Integration: This handler requires pendingMultiItem to be set in session.
 * See SEND_STRATEGY keyboard documentation in keyboards/index.ts for integration points.
 */
async function botCallbackSendStrategy(
    ctx: BotContext,
    visitorId: string,
    strategy: 'group' | 'single' | 'links'
): Promise<void> {
    const lang = ctx.from?.language_code?.startsWith('id') ? 'id' : 'en';
    
    // Get pending multi-item download from session
    const pending = ctx.session.pendingMultiItem;
    
    if (!pending || pending.visitorId !== visitorId) {
        await ctx.answerCallbackQuery({ 
            text: lang === 'id' 
                ? '⏰ Sesi kadaluarsa. Kirim URL baru.'
                : '⏰ Session expired. Send a new URL.',
            show_alert: true 
        });
        return;
    }
    
    const { result, originalUrl, itemCount } = pending;
    
    // Answer callback with strategy confirmation
    const strategyLabels = {
        group: lang === 'id' ? '📦 Mengirim sebagai album...' : '📦 Sending as album...',
        single: lang === 'id' ? '📤 Mengirim satu per satu...' : '📤 Sending one by one...',
        links: lang === 'id' ? '🔗 Menyiapkan link...' : '🔗 Preparing links...',
    };
    
    await ctx.answerCallbackQuery({ text: strategyLabels[strategy] });
    
    // Update message to show processing
    try {
        await ctx.editMessageText(strategyLabels[strategy]);
    } catch {
        // Ignore edit errors
    }
    
    const images = result.formats?.filter(f => f.type === 'image') || [];
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    const allMedia = [...images, ...videos];
    
    try {
        switch (strategy) {
            case 'group': {
                // Send as media group (album) - max 10 items per group
                // This is the default behavior, delegate to existing sendPhotoAlbum logic
                // For now, just acknowledge - full implementation requires importing send functions
                logger.debug('telegram', `Strategy: group - ${itemCount} items`);
                
                // TODO: Integrate with sendPhotoAlbum from url.ts
                // For now, send a message indicating the feature is being processed
                await ctx.reply(
                    lang === 'id'
                        ? `📦 Mengirim ${itemCount} item sebagai album...`
                        : `📦 Sending ${itemCount} items as album...`
                );
                
                // Clear session
                ctx.session.pendingMultiItem = undefined;
                break;
            }
            
            case 'single': {
                // Send items one by one
                logger.debug('telegram', `Strategy: single - ${itemCount} items`);
                
                await ctx.reply(
                    lang === 'id'
                        ? `📤 Mengirim ${itemCount} item satu per satu...`
                        : `📤 Sending ${itemCount} items one by one...`
                );
                
                // TODO: Implement single-item sending loop
                // for (const media of allMedia.slice(0, 10)) {
                //     if (media.type === 'image') {
                //         await ctx.replyWithPhoto(new InputFile({ url: media.url }));
                //     } else if (media.type === 'video') {
                //         await ctx.replyWithVideo(new InputFile({ url: media.url }));
                //     }
                //     await new Promise(r => setTimeout(r, 500)); // Rate limit
                // }
                
                ctx.session.pendingMultiItem = undefined;
                break;
            }
            
            case 'links': {
                // Send only download links
                logger.debug('telegram', `Strategy: links - ${itemCount} items`);
                
                let linksMessage = lang === 'id'
                    ? `🔗 *Download Links* (${itemCount} items)\n\n`
                    : `🔗 *Download Links* (${itemCount} items)\n\n`;
                
                allMedia.slice(0, 10).forEach((media, index) => {
                    const typeEmoji = media.type === 'video' ? '🎬' : '🖼️';
                    linksMessage += `${index + 1}. ${typeEmoji} [${media.type === 'video' ? 'Video' : 'Photo'} ${index + 1}](${media.url})\n`;
                });
                
                if (allMedia.length > 10) {
                    linksMessage += lang === 'id'
                        ? `\n_...dan ${allMedia.length - 10} item lainnya_`
                        : `\n_...and ${allMedia.length - 10} more items_`;
                }
                
                const keyboard = new InlineKeyboard().url('🔗 Original', originalUrl);
                
                await ctx.reply(linksMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                    link_preview_options: { is_disabled: true },
                });
                
                ctx.session.pendingMultiItem = undefined;
                break;
            }
        }
        
        // Delete the strategy selection message
        try {
            await ctx.deleteMessage();
        } catch {
            // Ignore deletion errors
        }
        
    } catch (error) {
        logger.error('telegram', error, 'SEND_STRATEGY');
        await ctx.reply(
            lang === 'id' 
                ? '❌ Gagal mengirim media. Coba lagi.'
                : '❌ Failed to send media. Try again.'
        );
    }
}

// ============================================================================
// MENU COMMAND CALLBACKS
// ============================================================================

/**
 * Handle menu command callback
 * Pattern: cmd:(mystatus|history|premium|privacy|help|menu)
 * 
 * Directly executes the command content instead of telling user to type it
 */
async function botCallbackMenuCommand(ctx: BotContext, command: string): Promise<void> {
    await ctx.answerCallbackQuery();
    
    const lang = ctx.from?.language_code?.startsWith('id') ? 'id' : 'en';

    switch (command) {
        case 'mystatus': {
            // Import and execute mystatus logic
            const { botUserGetPremiumStatus, botUserGetTotalDownloads } = await import('../commands/mystatus');
            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.reply('❌ User not found');
                return;
            }
            
            const [statusResult, totalDownloads] = await Promise.all([
                botUserGetPremiumStatus(userId),
                botUserGetTotalDownloads(userId),
            ]);
            
            const user = statusResult?.user;
            const apiKey = statusResult?.apiKey;
            const isVip = !!apiKey;
            
            if (!isVip) {
                // Free user
                const dailyUsed = user?.daily_downloads || 0;
                const dailyLimit = 10;
                const memberSince = user?.created_at 
                    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Unknown';
                
                const message = lang === 'id'
                    ? `📊 *Status Anda*\n\n` +
                      `*Akun:* Free Tier\n` +
                      `*Username:* ${user?.username ? '@' + user.username : 'Tidak diset'}\n` +
                      `*Member sejak:* ${memberSince}\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `*Download:*\n` +
                      `• Hari ini: ${dailyUsed} / ${dailyLimit}\n` +
                      `• Total: ${totalDownloads}\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `💡 Upgrade ke VIP untuk download tanpa batas!`
                    : `📊 *Your Status*\n\n` +
                      `*Account:* Free Tier\n` +
                      `*Username:* ${user?.username ? '@' + user.username : 'Not set'}\n` +
                      `*Member since:* ${memberSince}\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `*Downloads:*\n` +
                      `• Today: ${dailyUsed} / ${dailyLimit}\n` +
                      `• Total: ${totalDownloads}\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `💡 Upgrade to Premium for unlimited downloads!`;
                
                await ctx.reply(message, { parse_mode: 'Markdown' });
            } else {
                // Premium user - show full details
                let expiryText = '♾️ Never';
                let statusEmoji = '✅';
                
                if (apiKey.expires_at) {
                    const expiryDate = new Date(apiKey.expires_at);
                    const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    
                    if (daysLeft <= 0) {
                        expiryText = lang === 'id' ? '❌ Kadaluarsa' : '❌ Expired';
                        statusEmoji = '❌';
                    } else if (daysLeft <= 7) {
                        const dateStr = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        expiryText = lang === 'id' 
                            ? `⚠️ ${dateStr} (${daysLeft} hari lagi)`
                            : `⚠️ ${dateStr} (${daysLeft} days left)`;
                        statusEmoji = '⚠️';
                    } else {
                        const dateStr = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        expiryText = lang === 'id'
                            ? `${dateStr} (${daysLeft} hari lagi)`
                            : `${dateStr} (${daysLeft} days left)`;
                    }
                }
                
                const keyStatus = apiKey.enabled 
                    ? `${statusEmoji} ${lang === 'id' ? 'Aktif' : 'Active'}`
                    : `❌ ${lang === 'id' ? 'Nonaktif' : 'Disabled'}`;
                
                const successRate = apiKey.total_requests > 0 
                    ? Math.round((apiKey.success_count / apiKey.total_requests) * 100) 
                    : 100;
                
                const message = lang === 'id'
                    ? `👑 *Status Premium*\n\n` +
                      `*API Key:* \`${apiKey.key_preview}\`\n` +
                      `*Terdaftar:* ${apiKey.name || 'N/A'}\n` +
                      `*Status:* ${keyStatus}\n` +
                      `*Masa Aktif:* ${expiryText}\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `*Download:*\n` +
                      `• Hari ini: ${user?.daily_downloads || 0} (Unlimited)\n` +
                      `• Total: ${totalDownloads}\n` +
                      `• API Requests: ${apiKey.total_requests}\n\n` +
                      `*Success Rate:* ${successRate}%`
                    : `👑 *Premium Status*\n\n` +
                      `*API Key:* \`${apiKey.key_preview}\`\n` +
                      `*Registered to:* ${apiKey.name || 'N/A'}\n` +
                      `*Status:* ${keyStatus}\n` +
                      `*Expires:* ${expiryText}\n\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                      `*Downloads:*\n` +
                      `• Today: ${user?.daily_downloads || 0} (Unlimited)\n` +
                      `• Total: ${totalDownloads}\n` +
                      `• API Requests: ${apiKey.total_requests}\n\n` +
                      `*Success Rate:* ${successRate}%`;
                
                await ctx.reply(message, { parse_mode: 'Markdown' });
            }
            break;
        }
        
        case 'history': {
            // History feature disabled - too complex for Telegram
            const msg = lang === 'id' 
                ? '📜 Fitur riwayat belum tersedia di Telegram.\n\nGunakan website untuk melihat riwayat download.'
                : '📜 History feature not yet available on Telegram.\n\nUse the website to view download history.';
            await ctx.reply(msg);
            break;
        }
        
        case 'donate': {
            // Show donation info with action keyboard
            const keyboard = new InlineKeyboard()
                .text('🛒 Donasi Sekarang', 'donate_contact')
                .row()
                .text('🔑 Saya Punya API Key', 'donate_enter_key');
            
            const message = lang === 'id'
                ? `💝 *Paket Donasi DownAria*\n\n` +
                  `Dengan berdonasi, kamu mendukung pengembangan bot!\n\n` +
                  `✨ *Keuntungan Donatur:*\n` +
                  `• Download sesuai limit API key\n` +
                  `• Tanpa cooldown\n` +
                  `• Multi-URL (max 5/pesan)\n` +
                  `• Prioritas support\n\n` +
                  `💰 *Harga:*\n` +
                  `• Rp5.000 / 30 hari (PROMO!)\n\n` +
                  `📱 Hubungi @${ADMIN_CONTACT_USERNAME} untuk donasi`
                : `💝 *DownAria Donation Plan*\n\n` +
                  `By donating, you support bot development!\n\n` +
                  `✨ *Donator Benefits:*\n` +
                  `• Downloads based on API key limit\n` +
                  `• No cooldown\n` +
                  `• Multi-URL (max 5/message)\n` +
                  `• Priority support\n\n` +
                  `💰 *Price:*\n` +
                  `• Rp5,000 / 30 days (PROMO!)\n\n` +
                  `📱 Contact @${ADMIN_CONTACT_USERNAME} to donate`;
            
            await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
            break;
        }
        
        case 'privacy': {
            const { t, detectLanguage } = await import('../i18n');
            const detectedLang = detectLanguage(ctx.from?.language_code);
            await ctx.reply(t('privacy_title', detectedLang), { parse_mode: 'Markdown' });
            break;
        }
        
        case 'help': {
            const { t, detectLanguage } = await import('../i18n');
            const detectedLang = detectLanguage(ctx.from?.language_code);
            await ctx.reply(t('help_title', detectedLang), { parse_mode: 'Markdown' });
            break;
        }
        
        case 'menu': {
            const { detectLanguage } = await import('../i18n');
            const detectedLang = detectLanguage(ctx.from?.language_code);
            const { menuKeyboard } = await import('../keyboards');
            
            // Get greeting based on time (UTC+7 for Indonesia)
            const getGreeting = (lang: 'en' | 'id'): string => {
                const now = new Date();
                const hour = (now.getUTCHours() + 7) % 24;
                
                if (lang === 'id') {
                    if (hour >= 5 && hour < 11) return 'Selamat pagi';
                    if (hour >= 11 && hour < 15) return 'Selamat siang';
                    if (hour >= 15 && hour < 18) return 'Selamat sore';
                    return 'Selamat malam';
                } else {
                    if (hour >= 5 && hour < 12) return 'Good morning';
                    if (hour >= 12 && hour < 17) return 'Good afternoon';
                    if (hour >= 17 && hour < 21) return 'Good evening';
                    return 'Good night';
                }
            };
            
            const username = ctx.from?.first_name || ctx.from?.username || 'User';
            const greeting = getGreeting(detectedLang);
            
            const menuText = detectedLang === 'id'
                ? `📋 *Menu DownAria Bot*\n\n${greeting}, ${username}! 👋\n\n────────────────────\n\nKirim link video dari:\n• YouTube • Instagram • TikTok\n• Twitter/X • Facebook • Weibo\n\n────────────────────`
                : `📋 *DownAria Bot Menu*\n\n${greeting}, ${username}! 👋\n\n────────────────────\n\nSend a video link from:\n• YouTube • Instagram • TikTok\n• Twitter/X • Facebook • Weibo\n\n────────────────────`;
            
            await ctx.reply(menuText, { 
                parse_mode: 'Markdown',
                reply_markup: menuKeyboard(),
            });
            break;
        }
        
        default:
            await ctx.reply(`❓ Unknown command: ${command}`);
    }
}

// ============================================================================
// MAIN HANDLER REGISTRATION
// ============================================================================

/**
 * Register callback query handler
 * 
 * Usage:
 * ```typescript
 * import { registerCallbackHandler } from '@/bot/handlers/callback';
 * registerCallbackHandler(bot);
 * ```
 */
export function registerCallbackHandler(bot: Bot<BotContext>): void {
    // Download quality callbacks: dl:(hd|sd|audio|cancel):{visitorId}
    bot.callbackQuery(/^dl:(hd|sd|audio|cancel):(.+)$/, async (ctx) => {
        const match = ctx.match;
        if (!match) return;

        const quality = match[1] as 'hd' | 'sd' | 'audio' | 'cancel';
        const visitorId = match[2];

        logger.debug('telegram', `Download callback: ${quality} for ${visitorId}`);

        try {
            await botCallbackDownloadQuality(ctx, quality, visitorId);
        } catch (error) {
            logger.error('telegram', error, 'DOWNLOAD_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });

    // Send strategy callbacks for multi-item content: strategy:{visitorId}:(group|single|links)
    // Used for Instagram carousels, Facebook albums, Twitter multi-image posts
    bot.callbackQuery(/^strategy:([^:]+):(group|single|links)$/, async (ctx) => {
        const match = ctx.match;
        if (!match) return;

        const visitorId = match[1];
        const strategy = match[2] as 'group' | 'single' | 'links';

        logger.debug('telegram', `Strategy callback: ${strategy} for ${visitorId}`);

        try {
            await botCallbackSendStrategy(ctx, visitorId, strategy);
        } catch (error) {
            logger.error('telegram', error, 'STRATEGY_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });

    // Report cookie issue to admin: report_cookie:{platform}
    bot.callbackQuery(/^report_cookie:(.+)$/, async (ctx) => {
        const platform = ctx.match?.[1];
        if (!platform) return;

        await ctx.answerCallbackQuery({ text: '📢 Reporting to admin...' });

        try {
            // Get admin IDs from config
            const { TELEGRAM_ADMIN_IDS } = await import('../config');
            const userId = ctx.from?.id;
            const username = ctx.from?.username;
            
            const reportMessage = `🚨 *Cookie Issue Report*

*Platform:* ${platform.toUpperCase()}
*Reported by:* ${username ? `@${username}` : `User ${userId}`}
*User ID:* \`${userId}\`
*Time:* ${new Date().toISOString()}

A user reported that ${platform} downloads are failing due to cookie issues.`;

            // Send to all admins
            for (const adminId of TELEGRAM_ADMIN_IDS) {
                try {
                    await ctx.api.sendMessage(adminId, reportMessage, { parse_mode: 'Markdown' });
                } catch {
                    // Admin might have blocked the bot
                }
            }

            await ctx.reply('✅ Report sent to admin. Thank you for reporting!');
        } catch (error) {
            logger.error('telegram', error, 'REPORT_COOKIE');
            await ctx.reply('❌ Failed to send report. Please try again later.');
        }
    });

    // Menu command callbacks: cmd:(mystatus|history|premium|privacy|help|menu)
    bot.callbackQuery(/^cmd:(.+)$/, async (ctx) => {
        const command = ctx.match?.[1];
        if (!command) return;

        logger.debug('telegram', `Menu command callback: ${command}`);

        try {
            await botCallbackMenuCommand(ctx, command);
        } catch (error) {
            logger.error('telegram', error, 'MENU_COMMAND_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });

    // General callback handler for other actions
    bot.on('callback_query:data', async (ctx) => {
        const { action, payload } = botCallbackParse(ctx.callbackQuery.data);

        // Skip if already handled by specific handlers above
        if (ctx.callbackQuery.data.startsWith('dl:') || ctx.callbackQuery.data.startsWith('cmd:')) {
            return;
        }

        logger.debug('telegram', `Callback: ${action}${payload ? ` (${payload})` : ''}`);

        try {
            switch (action as CallbackAction | 'retry') {
                case 'how_to_use':
                    await botCallbackHowToUse(ctx);
                    break;

                case 'contact_admin':
                    await botCallbackContactAdmin(ctx);
                    break;

                case 'have_api_key':
                    await botCallbackHaveApiKey(ctx);
                    break;

                case 'retry_download':
                case 'retry':
                    await botCallbackRetryDownload(ctx, payload);
                    break;

                case 'cancel':
                    await botCallbackCancel(ctx);
                    break;

                case 'back_to_menu':
                    await botCallbackBackToMenu(ctx);
                    break;

                default:
                    logger.warn('telegram', `Unknown callback action: ${action}`);
                    await ctx.answerCallbackQuery({ text: '❌ Unknown action' });
            }
        } catch (error) {
            logger.error('telegram', error, 'CALLBACK_HANDLER');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    botCallbackParse,
    botCallbackHowToUse,
    botCallbackContactAdmin,
    botCallbackHaveApiKey,
    botCallbackRetryDownload,
    botCallbackCancel,
    botCallbackBackToMenu,
    botCallbackDownloadQuality,
    botCallbackMenuCommand,
    botCallbackSendStrategy,
    findFormatByQuality,
};
