/**
 * /menu command - Shows main menu with platform list
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';

export const menuComposer = new Composer<BotContext>();

const MENU_MESSAGE = `📋 *Menu DownAria Bot*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Kirim link video dari platform berikut:

• *YouTube* \\- Video & Shorts
• *Instagram* \\- Reels, Posts, Stories
• *TikTok* \\- Video
• *Twitter/X* \\- Video tweets
• *Facebook* \\- Video & Reels
• *Weibo* \\- Video

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const menuKeyboard = new InlineKeyboard()
    .text('📊 My Status', 'cmd:mystatus')
    .text('📜 History', 'cmd:history')
    .row()
    .text('💎 Premium', 'cmd:premium')
    .text('🔒 Privacy', 'cmd:privacy')
    .row()
    .url('🌐 Website', 'https://downaria.vercel.app')
    .text('❓ Help', 'cmd:help');

menuComposer.command('menu', async (ctx) => {
    await ctx.reply(MENU_MESSAGE, {
        parse_mode: 'MarkdownV2',
        reply_markup: menuKeyboard,
    });
});
