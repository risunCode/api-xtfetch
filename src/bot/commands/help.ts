/**
 * /help command - Shows help with privacy section
 * Merged from /privacy
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';
import { getUserLanguage } from '../helpers';

const helpComposer = new Composer<BotContext>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build help message based on language
 */
function buildHelpMessage(lang: 'id' | 'en'): string {
  return lang === 'id'
    ? `❓ *Bantuan*

*Cara pakai:*
1. Copy link video
2. Paste di sini
3. Tunggu proses
4. Video dikirim! 🎉

*Platform:* YouTube, TikTok, Instagram, Twitter/X, Facebook, Weibo

*Commands:*
/start - Mulai bot
/status - Status kamu
/donate - Info donasi
/help - Bantuan ini
/stop - Hapus data saya`
    : `❓ *Help*

*How to use:*
1. Copy video link
2. Paste here
3. Wait for processing
4. Video sent! 🎉

*Platforms:* YouTube, TikTok, Instagram, Twitter/X, Facebook, Weibo

*Commands:*
/start - Start bot
/status - Your status
/donate - Donation info
/help - This help
/stop - Delete my data`;
}

/**
 * Build help keyboard
 */
function buildHelpKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔒 Privacy', 'help_privacy')
    .text('📡 Status', 'help_platform_status')
    .row()
    .text('« Menu', 'cmd:menu');
}

// ============================================================================
// COMMAND HANDLER
// ============================================================================

helpComposer.command('help', async (ctx) => {
  const lang = getUserLanguage(ctx);
  const message = buildHelpMessage(lang);
  const keyboard = buildHelpKeyboard();

  await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// ============================================================================
// CALLBACK HANDLERS
// ============================================================================

// Handle cmd:help callback (from menu)
helpComposer.callbackQuery('cmd:help', async (ctx) => {
  await ctx.answerCallbackQuery();
  const lang = getUserLanguage(ctx);
  const message = buildHelpMessage(lang);
  const keyboard = buildHelpKeyboard();

  await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// Legacy callback support for help
helpComposer.callbackQuery('help', async (ctx) => {
  await ctx.answerCallbackQuery();
  const lang = getUserLanguage(ctx);
  const message = buildHelpMessage(lang);
  const keyboard = buildHelpKeyboard();

  await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// Privacy callback (merged from /privacy)
helpComposer.callbackQuery('help_privacy', async (ctx) => {
  await ctx.answerCallbackQuery();
  const lang = getUserLanguage(ctx);
  
  const message = lang === 'id'
    ? `🔒 *Kebijakan Privasi*

• Kami hanya menyimpan ID Telegram untuk tracking download
• URL yang kamu kirim tidak disimpan permanen
• Data download dihapus setelah 24 jam
• Kami tidak membagikan data ke pihak ketiga

💡 Gunakan /stop untuk menghapus semua data kamu.`
    : `🔒 *Privacy Policy*

• We only store Telegram ID for download tracking
• URLs you send are not permanently stored
• Download data is deleted after 24 hours
• We don't share data with third parties

💡 Use /stop to delete all your data.`;

  const keyboard = new InlineKeyboard()
    .text('« Back', 'cmd:help');

  await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// Legacy callback support for privacy command
helpComposer.callbackQuery('cmd:privacy', async (ctx) => {
  await ctx.answerCallbackQuery();
  const lang = getUserLanguage(ctx);
  
  const message = lang === 'id'
    ? `🔒 *Kebijakan Privasi*

• Kami hanya menyimpan ID Telegram untuk tracking download
• URL yang kamu kirim tidak disimpan permanen
• Data download dihapus setelah 24 jam
• Kami tidak membagikan data ke pihak ketiga

� Gunoakan /stop untuk menghapus semua data kamu.`
    : `🔒 *Privacy Policy*

• We only store Telegram ID for download tracking
• URLs you send are not permanently stored
• Download data is deleted after 24 hours
• We don't share data with third parties

💡 Use /stop to delete all your data.`;

  const keyboard = new InlineKeyboard()
    .text('« Back', 'cmd:help');

  await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// Platform status callback (moved from old /status)
helpComposer.callbackQuery('help_platform_status', async (ctx) => {
  await ctx.answerCallbackQuery();
  
  // Simple platform status (can be enhanced later)
  const message = `📡 *Platform Status*

🟢 YouTube - Online
🟢 TikTok - Online
🟢 Instagram - Online
🟢 Twitter/X - Online
🟢 Facebook - Online
🟢 Weibo - Online

Updated: ${new Date().toLocaleTimeString()}`;

  const keyboard = new InlineKeyboard()
    .text('🔄 Refresh', 'help_platform_status')
    .row()
    .text('« Back', 'cmd:help');

  await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

export { helpComposer };
