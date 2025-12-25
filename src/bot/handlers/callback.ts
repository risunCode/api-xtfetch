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
 */

import { Bot, InputFile } from 'grammy';

import { logger } from '@/lib/services/shared/logger';

import type { BotContext, CallbackAction } from '../types';
import { botUrlCallScraper, botUrlGetPlatformEmoji } from './url';
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
        const emoji = result.platform ? botUrlGetPlatformEmoji(result.platform) : '📥';
        let caption = '';
        if (result.title) {
            caption = result.title.substring(0, 200);
            if (result.title.length > 200) caption += '...';
        }
        if (result.author) {
            caption += `\n\n👤 ${result.author}`;
        }
        caption += `\n\n${emoji} via @DownAriaBot`;

        // Send media
        const format = result.formats.find(f => f.type === 'video') || result.formats[0];
        
        try {
            if (format.type === 'video') {
                await ctx.replyWithVideo(new InputFile({ url: format.url }), { caption });
            } else {
                await ctx.replyWithPhoto(new InputFile({ url: format.url }), { caption });
            }
            
            // Record successful download
            await botRateLimitRecordDownload(ctx);
        } catch (error) {
            logger.error('telegram', error, 'RETRY_SEND_MEDIA');
            
            // Fallback: send URL
            await ctx.reply(`${emoji} Download link:\n\n${format.url}\n\n${caption}`, {
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
    bot.on('callback_query:data', async (ctx) => {
        const { action, payload } = botCallbackParse(ctx.callbackQuery.data);

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
};
