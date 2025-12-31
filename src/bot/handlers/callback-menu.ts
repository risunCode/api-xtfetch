/**
 * Menu Navigation Callback Handlers
 * Handles: how_to_use, contact_admin, have_api_key, back_to_menu, cmd:* callbacks
 * 
 * Callback actions:
 * - how_to_use: Show usage instructions
 * - contact_admin: Show admin contact info
 * - have_api_key: Show API key linking instructions
 * - back_to_menu: Return to main menu
 * - cancel: Cancel current operation
 * - noop: Disabled buttons (no operation)
 * 
 * Menu command callbacks:
 * - cmd:mystatus - Trigger /mystatus
 * - cmd:history - Trigger /history
 * - cmd:donate - Trigger /donate
 * - cmd:privacy - Trigger /privacy
 * - cmd:help - Trigger /help
 * - cmd:menu - Trigger /menu
 */

import { Bot, InlineKeyboard } from 'grammy';

import { logger } from '@/lib/services/shared/logger';

import type { BotContext } from '../types';
import { 
    startKeyboard, 
    DONATE,
    backKeyboard,
    menuKeyboard,
} from '../keyboards';
import { ADMIN_CONTACT_USERNAME } from '../config';

// ============================================================================
// CALLBACK HANDLERS
// ============================================================================

/**
 * Handle "how_to_use" callback
 */
export async function botCallbackHowToUse(ctx: BotContext): Promise<void> {
    const message = `📖 *How to Use DownAria Bot*

1️⃣ *Send a Link*
Just paste any social media link and I'll download it automatically.

2️⃣ *Supported Platforms*
• YouTube, Instagram, TikTok, Twitter/X
• Facebook, Weibo, BiliBili, Reddit
• SoundCloud, Threads, Pixiv
• Erome, Eporner, PornHub, Rule34Video

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
export async function botCallbackContactAdmin(ctx: BotContext): Promise<void> {
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
export async function botCallbackHaveApiKey(ctx: BotContext): Promise<void> {
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
 * Handle "cancel" callback
 */
export async function botCallbackCancel(ctx: BotContext): Promise<void> {
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
export async function botCallbackBackToMenu(ctx: BotContext): Promise<void> {
    const message = `👋 *Welcome to DownAria Bot!*

Send me any social media link and I'll download it for you.

*Supported Platforms:*
• YouTube • Instagram • TikTok • Twitter/X
• Facebook • Weibo • BiliBili • Reddit
• SoundCloud • Pixiv
• Erome • Eporner • PornHub • Rule34Video`;

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: startKeyboard(),
    });
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
export async function botCallbackMenuCommand(ctx: BotContext, command: string): Promise<void> {
    await ctx.answerCallbackQuery();
    
    const lang = ctx.from?.language_code?.startsWith('id') ? 'id' : 'en';

    switch (command) {
        case 'mystatus': {
            // Import from status.ts (merged from mystatus)
            const { botUserGetPremiumStatus, botUserGetTotalDownloads } = await import('../commands/status');
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
                  `• Limit sesuai API key\n` +
                  `• Tanpa cooldown\n` +
                  `• Multi-URL unlimited\n\n` +
                  `💰 *Harga:*\n` +
                  `• VIP: Rp5.000/bulan\n` +
                  `• VVIP: Rp15.000/bulan (+ API Access)`
                : `💝 *DownAria Donation Plan*\n\n` +
                  `By donating, you support bot development!\n\n` +
                  `✨ *Donator Benefits:*\n` +
                  `• Limit based on API key\n` +
                  `• No cooldown\n` +
                  `• Unlimited multi-URL\n\n` +
                  `💰 *Price:*\n` +
                  `• VIP: Rp5,000/month\n` +
                  `• VVIP: Rp15,000/month (+ API Access)`;
            
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
 * Register menu callback handlers
 * 
 * Usage:
 * ```typescript
 * import { registerMenuCallbacks } from '@/bot/handlers/callback-menu';
 * registerMenuCallbacks(bot);
 * ```
 */
export function registerMenuCallbacks(bot: Bot<BotContext>): void {
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

    // cancel callback
    bot.callbackQuery('cancel', async (ctx) => {
        await ctx.answerCallbackQuery({ text: 'Cancelled' });
        try { await ctx.deleteMessage(); } catch {}
    });

    // noop callback (disabled buttons)
    bot.callbackQuery('noop', async (ctx) => {
        await ctx.answerCallbackQuery();
    });

    // how_to_use callback
    bot.callbackQuery('how_to_use', async (ctx) => {
        try {
            await botCallbackHowToUse(ctx);
        } catch (error) {
            logger.error('telegram', error, 'HOW_TO_USE_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });

    // contact_admin callback
    bot.callbackQuery('contact_admin', async (ctx) => {
        try {
            await botCallbackContactAdmin(ctx);
        } catch (error) {
            logger.error('telegram', error, 'CONTACT_ADMIN_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });

    // have_api_key callback
    bot.callbackQuery('have_api_key', async (ctx) => {
        try {
            await botCallbackHaveApiKey(ctx);
        } catch (error) {
            logger.error('telegram', error, 'HAVE_API_KEY_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });

    // back_to_menu callback
    bot.callbackQuery('back_to_menu', async (ctx) => {
        try {
            await botCallbackBackToMenu(ctx);
        } catch (error) {
            logger.error('telegram', error, 'BACK_TO_MENU_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });
}
