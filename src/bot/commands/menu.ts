/**
 * /menu command - Shows main menu with language support
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../types';
import { t, detectLanguage, type BotLanguage } from '../i18n';
import { botIsAdmin } from '../config';

export const menuComposer = new Composer<BotContext>();

/**
 * Get greeting based on current hour (UTC+7 for Indonesia)
 */
function getGreeting(lang: BotLanguage): string {
    const now = new Date();
    // Convert to UTC+7 (Indonesia WIB)
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
}

function buildMenuKeyboard(lang: BotLanguage, isAdmin: boolean): InlineKeyboard {
    const keyboard = new InlineKeyboard()
        .text(t('btn_mystatus', lang), 'cmd:mystatus')
        .text(t('btn_donate', lang), 'cmd:donate')
        .row()
        .text(t('btn_privacy', lang), 'cmd:privacy')
        .text(t('btn_help', lang), 'cmd:help')
        .row()
        .url(t('btn_website', lang), 'https://downaria.vercel.app');
    
    // Add admin button only for admins
    if (isAdmin) {
        keyboard.row().text('🔧 Admin Panel', 'admin:panel');
    }
    
    return keyboard;
}

menuComposer.command('menu', async (ctx) => {
    const lang = detectLanguage(ctx.from?.language_code);
    const userId = ctx.from?.id || 0;
    const isAdmin = botIsAdmin(userId);
    const username = ctx.from?.first_name || ctx.from?.username || 'User';
    const greeting = getGreeting(lang);
    
    const menuText = lang === 'id'
        ? `📋 *Menu DownAria Bot*

${greeting}, ${username}! 👋

────────────────────

Kirim link video dari:
• YouTube • Instagram • TikTok
• Twitter/X • Facebook • Weibo

────────────────────`
        : `📋 *DownAria Bot Menu*

${greeting}, ${username}! 👋

────────────────────

Send a video link from:
• YouTube • Instagram • TikTok
• Twitter/X • Facebook • Weibo

────────────────────`;
    
    await ctx.reply(menuText, {
        parse_mode: 'Markdown',
        reply_markup: buildMenuKeyboard(lang, isAdmin),
    });
});

// Handle admin panel callback
menuComposer.callbackQuery('admin:panel', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id || 0;
    if (!botIsAdmin(userId)) {
        await ctx.answerCallbackQuery('🚫 Admin only');
        return;
    }
    
    const adminMessage = `🔧 *Admin Panel*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Available Commands:*

📊 \`/stats\` - Bot statistics
📢 \`/broadcast <msg>\` - Send to all users
🚫 \`/ban <user_id>\` - Ban user
✅ \`/unban <user_id>\` - Unban user
👑 \`/givevip <user_id> <duration>\` - Give VIP
❌ \`/revokevip <user_id>\` - Revoke VIP
🔧 \`/maintenance on/off\` - Toggle maintenance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*VIP Duration Options:*
\`7d\` \`30d\` \`90d\` \`365d\` \`lifetime\`

*Examples:*
\`/givevip 123456789 30d\`
\`/broadcast 🎉 New update!\`
\`/ban 123456789\``;

    const keyboard = new InlineKeyboard()
        .text('📊 Stats', 'admin:stats')
        .text('🔧 Maintenance', 'admin:maintenance')
        .row()
        .text('« Back to Menu', 'cmd:menu');

    await ctx.editMessageText(adminMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
    });
});

// Quick admin stats callback
menuComposer.callbackQuery('admin:stats', async (ctx) => {
    await ctx.answerCallbackQuery('Loading stats...');
    
    const userId = ctx.from?.id || 0;
    if (!botIsAdmin(userId)) {
        await ctx.answerCallbackQuery('🚫 Admin only');
        return;
    }
    
    // Trigger /stats command behavior
    await ctx.reply('Use /stats command for detailed statistics.');
});

// Quick maintenance toggle callback
menuComposer.callbackQuery('admin:maintenance', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id || 0;
    if (!botIsAdmin(userId)) {
        await ctx.answerCallbackQuery('🚫 Admin only');
        return;
    }
    
    const keyboard = new InlineKeyboard()
        .text('🔴 Turn ON', 'admin:maintenance_on')
        .text('🟢 Turn OFF', 'admin:maintenance_off')
        .row()
        .text('« Back', 'admin:panel');

    await ctx.editMessageText(`🔧 *Maintenance Mode*

Toggle maintenance mode to notify all users.

Current status: Check /maintenance command`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
    });
});

// Maintenance on/off callbacks
menuComposer.callbackQuery('admin:maintenance_on', async (ctx) => {
    const userId = ctx.from?.id || 0;
    if (!botIsAdmin(userId)) {
        await ctx.answerCallbackQuery('🚫 Admin only');
        return;
    }
    await ctx.answerCallbackQuery('Use /maintenance on command');
});

menuComposer.callbackQuery('admin:maintenance_off', async (ctx) => {
    const userId = ctx.from?.id || 0;
    if (!botIsAdmin(userId)) {
        await ctx.answerCallbackQuery('🚫 Admin only');
        return;
    }
    await ctx.answerCallbackQuery('Use /maintenance off command');
});
