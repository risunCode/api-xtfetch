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
 * - cmd:premium - Trigger /premium
 * - cmd:privacy - Trigger /privacy
 * - cmd:help - Trigger /help
 * - cmd:menu - Trigger /menu
 */

import { Bot, InputFile } from 'grammy';

import { logger } from '@/lib/services/shared/logger';

import type { BotContext, CallbackAction, DownloadResult } from '../types';
import { botUrlCallScraper, botUrlGetPlatformName } from './url';
import { botRateLimitRecordDownload } from '../middleware/rateLimit';
import { 
    startKeyboard, 
    premiumKeyboard,
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

1️⃣ Get an API key at downaria.com/api
2️⃣ Send your key using this command:
   \`/apikey YOUR_API_KEY_HERE\`

*Benefits of Premium:*
• ✅ Unlimited downloads
• ✅ No cooldown between downloads
• ✅ Priority support
• ✅ Higher quality options

Don't have a key? Get one at downaria.com/api`;

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: premiumKeyboard(),
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
        
        try {
            if (format.type === 'video') {
                await ctx.replyWithVideo(new InputFile({ url: format.url }), { caption, parse_mode: 'Markdown' });
            } else {
                await ctx.replyWithPhoto(new InputFile({ url: format.url }), { caption, parse_mode: 'Markdown' });
            }
            
            // Record successful download
            await botRateLimitRecordDownload(ctx);
        } catch (error) {
            logger.error('telegram', error, 'RETRY_SEND_MEDIA');
            
            // Fallback: send URL
            await ctx.reply(`📥 Download link:\n\n${format.url}\n\n${caption}`, {
                link_preview_options: { is_disabled: true },
            });
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
            
            const result = await botUrlCallScraper(originalUrl, ctx.isPremium || false);
            
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
            text: '⏰ Session expired. Please send the URL again.',
            show_alert: true 
        });
        return;
    }

    // Answer callback immediately
    const qualityLabel = quality === 'audio' ? 'audio' : quality.toUpperCase();
    await ctx.answerCallbackQuery(`⏳ Downloading ${qualityLabel}...`);

    // Edit message to show downloading status
    try {
        await ctx.editMessageCaption({
            caption: `⏳ Downloading ${qualityLabel} quality...`,
        });
    } catch {
        // Message might not have caption (e.g., text message)
        try {
            await ctx.editMessageText(`⏳ Downloading ${qualityLabel} quality...`);
        } catch {
            // Ignore edit errors
        }
    }

    // Find the right format
    const formats = pending.result.formats || [];
    const formatToSend = findFormatByQuality(formats, quality);

    if (!formatToSend) {
        try {
            await ctx.editMessageCaption({ caption: '❌ Format not available' });
        } catch {
            try {
                await ctx.editMessageText('❌ Format not available');
            } catch {
                await ctx.reply('❌ Format not available');
            }
        }
        return;
    }

    try {
        // Build caption (don't delete preview message - user might want other qualities)
        let caption = '';
        if (pending.result.title) {
            caption = pending.result.title.substring(0, 200);
            if (pending.result.title.length > 200) caption += '...';
        }
        if (pending.result.author) {
            caption += `\n\n👤 ${pending.result.author}`;
        }
        caption += '\n\n📥 via @DownAriaBot';

        // Send the media (don't delete preview - user might want other qualities)
        if (quality === 'audio') {
            await ctx.replyWithAudio(new InputFile({ url: formatToSend.url }), {
                caption,
                title: pending.result.title?.substring(0, 64),
            });
        } else {
            await ctx.replyWithVideo(new InputFile({ url: formatToSend.url }), {
                caption,
            });
        }

        // Record successful download
        await botRateLimitRecordDownload(ctx);

        // Update preview message to show success (don't delete - user might want other qualities)
        try {
            const successCaption = `✅ ${qualityLabel} downloaded!\n\nSelect another quality or cancel:`;
            await ctx.editMessageCaption({ caption: successCaption });
        } catch {
            // If can't edit, just leave it
        }

        // DON'T clear session - user might want to download other qualities
        // ctx.session.pendingDownload = undefined;

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
            const isPremium = !!apiKey;
            const dailyUsed = user?.daily_downloads || 0;
            const dailyLimit = 10;
            const remaining = isPremium ? '∞' : String(Math.max(0, dailyLimit - dailyUsed));
            
            const message = lang === 'id' 
                ? `📊 *Status Anda*\n\n` +
                  `👤 User ID: \`${userId}\`\n` +
                  `💎 Status: ${isPremium ? 'Premium ✓' : 'Free'}\n` +
                  `📥 Download hari ini: ${dailyUsed}${isPremium ? '' : `/${dailyLimit}`}\n` +
                  `📊 Total download: ${totalDownloads}\n` +
                  `⏳ Sisa: ${remaining}`
                : `📊 *Your Status*\n\n` +
                  `👤 User ID: \`${userId}\`\n` +
                  `💎 Status: ${isPremium ? 'Premium ✓' : 'Free'}\n` +
                  `📥 Downloads today: ${dailyUsed}${isPremium ? '' : `/${dailyLimit}`}\n` +
                  `📊 Total downloads: ${totalDownloads}\n` +
                  `⏳ Remaining: ${remaining}`;
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
            break;
        }
        
        case 'history': {
            const { botDownloadGetHistory } = await import('../commands/history');
            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.reply('❌ User not found');
                return;
            }
            
            const history = await botDownloadGetHistory(userId, 5);
            
            if (!history || history.length === 0) {
                const msg = lang === 'id' ? '📜 Belum ada riwayat download.' : '📜 No download history yet.';
                await ctx.reply(msg);
                return;
            }
            
            const header = lang === 'id' ? '📜 *Riwayat Download Terakhir*\n\n' : '📜 *Recent Downloads*\n\n';
            const items = history.map((h, i) => {
                const date = new Date(h.created_at).toLocaleDateString();
                return `${i + 1}. ${h.platform} - ${date}`;
            }).join('\n');
            
            await ctx.reply(header + items, { parse_mode: 'Markdown' });
            break;
        }
        
        case 'premium': {
            const message = lang === 'id'
                ? `💎 *Premium DownAria*\n\n` +
                  `Keuntungan Premium:\n` +
                  `• Download tanpa batas\n` +
                  `• Tanpa cooldown\n` +
                  `• Prioritas support\n` +
                  `• Kualitas lebih tinggi\n\n` +
                  `Hubungi @suntaw untuk info lebih lanjut.`
                : `💎 *DownAria Premium*\n\n` +
                  `Premium benefits:\n` +
                  `• Unlimited downloads\n` +
                  `• No cooldown\n` +
                  `• Priority support\n` +
                  `• Higher quality options\n\n` +
                  `Contact @suntaw for more info.`;
            
            await ctx.reply(message, { parse_mode: 'Markdown' });
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
            const { t, detectLanguage } = await import('../i18n');
            const detectedLang = detectLanguage(ctx.from?.language_code);
            const { menuKeyboard } = await import('../keyboards');
            await ctx.reply(t('menu_title', detectedLang), { 
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
    findFormatByQuality,
};
