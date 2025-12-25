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
    { name: 'YouTube', domains: 'youtube.com, youtu.be' },
    { name: 'Instagram', domains: 'instagram.com/p/, /reel/, /stories/' },
    { name: 'TikTok', domains: 'tiktok.com, vm.tiktok.com' },
    { name: 'Twitter/X', domains: 'twitter.com, x.com' },
    { name: 'Facebook', domains: 'facebook.com, fb.watch' },
    { name: 'Weibo', domains: 'weibo.com, weibo.cn' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const helpComposer = new Composer<Context>();

helpComposer.command('help', async (ctx) => {
    // Build platforms list (no emojis)
    const platformsList = SUPPORTED_PLATFORMS
        .map(p => `- ${p.name}: ${p.domains}`)
        .join('\n');

    const message = `DownAria Bot Help

Supported Platforms:
${platformsList}

Commands:
/start - Start the bot
/help - Show this help
/mystatus - Check your status
/history - Download history
/premium - Premium info

Just paste any video URL to download.`;

    await ctx.reply(message);
});

// Handle inline button callback for help
helpComposer.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    // Build platforms list (no emojis)
    const platformsList = SUPPORTED_PLATFORMS
        .map(p => `- ${p.name}: ${p.domains}`)
        .join('\n');

    const message = `DownAria Bot Help

Supported Platforms:
${platformsList}

Commands:
/start - Start the bot
/help - Show this help
/mystatus - Check your status
/history - Download history
/premium - Premium info

Just paste any video URL to download.`;

    await ctx.reply(message);
});

export { helpComposer };
