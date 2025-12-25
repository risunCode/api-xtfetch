/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT COMMAND - /help
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Shows supported platforms list and brief usage instructions.
 * 
 * @module bot/commands/help
 */

import { Composer } from 'grammy';
import type { Context } from 'grammy';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SUPPORTED_PLATFORMS = [
    { icon: '▶️', name: 'YouTube', domains: 'youtube.com, youtu.be' },
    { icon: '📸', name: 'Instagram', domains: 'instagram.com/p/, /reel/, /stories/' },
    { icon: '🎵', name: 'TikTok', domains: 'tiktok.com, vm.tiktok.com' },
    { icon: '𝕏', name: 'Twitter/X', domains: 'twitter.com, x.com' },
    { icon: '📘', name: 'Facebook', domains: 'facebook.com, fb.watch' },
    { icon: '🔴', name: 'Weibo', domains: 'weibo.com, weibo.cn' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const helpComposer = new Composer<Context>();

helpComposer.command('help', async (ctx) => {
    // Build platforms list
    const platformsList = SUPPORTED_PLATFORMS
        .map(p => `${p.icon} *${p.name}*\n   └ ${p.domains}`)
        .join('\n\n');

    const message = `❓ *XTFetch Bot Help*

*Supported Platforms:*

${platformsList}

━━━━━━━━━━━━━━━━━━━━━━

*Commands:*
/start - Start the bot & see stats
/help - Show this help message
/status - Check platform availability
/history - View your download history
/premium - Get unlimited downloads
/mystatus - Check your premium status

━━━━━━━━━━━━━━━━━━━━━━

*How to Download:*
Just paste any video URL directly in the chat!

*Tips:*
• Make sure videos are public
• Short URLs are supported
• Free tier: 10 downloads/day
• Premium: Unlimited downloads

Need more help? Contact @risunCode`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
});

// Handle inline button callback for help
helpComposer.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    // Build platforms list
    const platformsList = SUPPORTED_PLATFORMS
        .map(p => `${p.icon} *${p.name}*\n   └ ${p.domains}`)
        .join('\n\n');

    const message = `❓ *XTFetch Bot Help*

*Supported Platforms:*

${platformsList}

━━━━━━━━━━━━━━━━━━━━━━

*Commands:*
/start - Start the bot & see stats
/help - Show this help message
/status - Check platform availability
/history - View your download history
/premium - Get unlimited downloads
/mystatus - Check your premium status

━━━━━━━━━━━━━━━━━━━━━━

*How to Download:*
Just paste any video URL directly in the chat!

Need more help? Contact @risunCode`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
});

export { helpComposer };
