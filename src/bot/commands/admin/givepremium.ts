/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT ADMIN COMMAND - /givepremium
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Give premium access to a user with preset or custom duration.
 * Usage: 
 *   /givepremium <user_id> <duration>
 *   Duration: 7d, 30d, 90d, 365d, lifetime, or custom days
 * 
 * @module bot/commands/admin/givepremium
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface BotUserInfo {
    id: number;
    username: string | null;
    first_name: string | null;
    api_key_id: string | null;
    premium_expires_at: string | null;
    created_at: string;
}

// Duration presets in days
const DURATION_PRESETS: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '365d': 365,
    '1w': 7,
    '1m': 30,
    '3m': 90,
    '1y': 365,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse duration string to days
 * @param duration - Duration string (7d, 30d, 90d, 365d, lifetime, or number)
 * @returns Number of days, -1 for lifetime, null for invalid
 */
function parseDuration(duration: string): number | null {
    const lower = duration.toLowerCase().trim();
    
    // Check presets
    if (DURATION_PRESETS[lower]) {
        return DURATION_PRESETS[lower];
    }
    
    // Lifetime
    if (lower === 'lifetime' || lower === 'forever' || lower === 'unlimited') {
        return -1;
    }
    
    // Custom days (e.g., "45" or "45d")
    const match = lower.match(/^(\d+)d?$/);
    if (match) {
        const days = parseInt(match[1], 10);
        if (days > 0 && days <= 3650) { // Max 10 years
            return days;
        }
    }
    
    return null;
}

/**
 * Format duration for display
 */
function formatDuration(days: number): string {
    if (days === -1) return '♾️ Lifetime';
    if (days === 7) return '7 days (1 week)';
    if (days === 30) return '30 days (1 month)';
    if (days === 90) return '90 days (3 months)';
    if (days === 365) return '365 days (1 year)';
    return `${days} days`;
}

/**
 * Get user info from database
 */
async function botAdminGetUserInfo(userId: number): Promise<BotUserInfo | null> {
    const db = supabaseAdmin;
    if (!db) return null;

    try {
        const { data, error } = await db
            .from('bot_users')
            .select('id, username, first_name, api_key_id, premium_expires_at, created_at')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('[botAdminGetUserInfo] Error:', error);
            return null;
        }

        return data as BotUserInfo;
    } catch (error) {
        console.error('[botAdminGetUserInfo] Error:', error);
        return null;
    }
}

/**
 * Give premium to a user
 * @param userId - Telegram user ID
 * @param days - Number of days (-1 for lifetime)
 * @returns Expiry date or null on error
 */
async function botAdminGivePremium(userId: number, days: number): Promise<string | null> {
    const db = supabaseAdmin;
    if (!db) return null;

    try {
        let expiresAt: string | null = null;
        
        if (days !== -1) {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + days);
            expiresAt = expiry.toISOString();
        }

        const { error } = await db
            .from('bot_users')
            .update({
                premium_expires_at: expiresAt,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId);

        if (error) {
            console.error('[botAdminGivePremium] Error:', error);
            return null;
        }

        return expiresAt || 'lifetime';
    } catch (error) {
        console.error('[botAdminGivePremium] Error:', error);
        return null;
    }
}

/**
 * Revoke premium from a user
 */
async function botAdminRevokePremium(userId: number): Promise<boolean> {
    const db = supabaseAdmin;
    if (!db) return false;

    try {
        const { error } = await db
            .from('bot_users')
            .update({
                premium_expires_at: null,
                api_key_id: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId);

        if (error) {
            console.error('[botAdminRevokePremium] Error:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[botAdminRevokePremium] Error:', error);
        return false;
    }
}

/**
 * Parse command arguments
 */
function parseArgs(text: string, command: string): { userId: number | null; duration: string | null } {
    const args = text.replace(new RegExp(`^/${command}\\s*`, 'i'), '').trim();
    const parts = args.split(/\s+/);
    
    const userIdStr = parts[0];
    const duration = parts[1] || null;
    
    if (!userIdStr) return { userId: null, duration: null };
    
    const userId = parseInt(userIdStr, 10);
    if (isNaN(userId) || userId <= 0) return { userId: null, duration: null };
    
    return { userId, duration };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const givepremiumComposer = new Composer<Context>();

// /givepremium command
givepremiumComposer.command('givepremium', async (ctx) => {
    const messageText = ctx.message?.text || '';
    const { userId, duration } = parseArgs(messageText, 'givepremium');

    // Show usage if no args
    if (!userId) {
        const keyboard = new InlineKeyboard()
            .text('7 Days', 'gp_preset_7')
            .text('30 Days', 'gp_preset_30')
            .row()
            .text('90 Days', 'gp_preset_90')
            .text('365 Days', 'gp_preset_365')
            .row()
            .text('♾️ Lifetime', 'gp_preset_lifetime');

        await ctx.reply(
            `👑 *Give Premium Command*

Usage: \`/givepremium <user_id> <duration>\`

*Duration Presets:*
• \`7d\` - 7 days (1 week)
• \`30d\` - 30 days (1 month)
• \`90d\` - 90 days (3 months)
• \`365d\` - 365 days (1 year)
• \`lifetime\` - Forever

*Custom Duration:*
• \`45\` or \`45d\` - 45 days

*Examples:*
\`/givepremium 123456789 30d\`
\`/givepremium 123456789 lifetime\`
\`/givepremium 123456789 45\``,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
        return;
    }

    // Get user info
    const userInfo = await botAdminGetUserInfo(userId);

    if (!userInfo) {
        await ctx.reply(
            `❌ User \`${userId}\` not found in database.

The user may not have started the bot yet.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // If no duration, show preset buttons for this user
    if (!duration) {
        const keyboard = new InlineKeyboard()
            .text('7 Days', `gp_give_${userId}_7`)
            .text('30 Days', `gp_give_${userId}_30`)
            .row()
            .text('90 Days', `gp_give_${userId}_90`)
            .text('365 Days', `gp_give_${userId}_365`)
            .row()
            .text('♾️ Lifetime', `gp_give_${userId}_-1`);

        // Check current premium status
        let currentStatus = '❌ No premium';
        if (userInfo.premium_expires_at) {
            const expiry = new Date(userInfo.premium_expires_at);
            if (expiry.getFullYear() > 2100) {
                currentStatus = '♾️ Lifetime';
            } else {
                const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                if (daysLeft > 0) {
                    currentStatus = `✅ Active (${daysLeft} days left)`;
                } else {
                    currentStatus = '❌ Expired';
                }
            }
        }

        await ctx.reply(
            `👑 *Give Premium to User*

👤 *User Info:*
• ID: \`${userInfo.id}\`
• Username: ${userInfo.username ? `@${userInfo.username}` : 'N/A'}
• Name: ${userInfo.first_name || 'N/A'}
• Current Premium: ${currentStatus}

Select duration:`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
        return;
    }

    // Parse and validate duration
    const days = parseDuration(duration);
    if (days === null) {
        await ctx.reply(
            `❌ Invalid duration: \`${duration}\`

Valid formats: \`7d\`, \`30d\`, \`90d\`, \`365d\`, \`lifetime\`, or custom days (e.g., \`45\`)`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Give premium
    const result = await botAdminGivePremium(userId, days);

    if (result) {
        let expiryText = '♾️ Never (Lifetime)';
        if (result !== 'lifetime') {
            const expiry = new Date(result);
            expiryText = expiry.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        }

        await ctx.reply(
            `✅ *Premium Granted!*

👤 *User:*
• ID: \`${userInfo.id}\`
• Username: ${userInfo.username ? `@${userInfo.username}` : 'N/A'}
• Name: ${userInfo.first_name || 'N/A'}

👑 *Premium:*
• Duration: ${formatDuration(days)}
• Expires: ${expiryText}

User now has unlimited downloads! 🎉`,
            { parse_mode: 'Markdown' }
        );

        // Try to notify the user
        try {
            await ctx.api.sendMessage(
                userId,
                `🎉 *Congratulations!*

You've been granted *Premium Access*!

👑 *Duration:* ${formatDuration(days)}
📅 *Expires:* ${expiryText}

Enjoy unlimited downloads! 🚀`,
                { parse_mode: 'Markdown' }
            );
        } catch {
            // User may have blocked the bot
        }
    } else {
        await ctx.reply('❌ Failed to grant premium. Please try again.');
    }
});

// /revokepremium command
givepremiumComposer.command('revokepremium', async (ctx) => {
    const messageText = ctx.message?.text || '';
    const { userId } = parseArgs(messageText, 'revokepremium');

    if (!userId) {
        await ctx.reply(
            `🚫 *Revoke Premium Command*

Usage: \`/revokepremium <user_id>\`

Example: \`/revokepremium 123456789\`

This will remove premium access from the user.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Get user info
    const userInfo = await botAdminGetUserInfo(userId);

    if (!userInfo) {
        await ctx.reply(
            `❌ User \`${userId}\` not found in database.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (!userInfo.premium_expires_at && !userInfo.api_key_id) {
        await ctx.reply(
            `⚠️ User doesn't have premium access.

👤 *User Info:*
• ID: \`${userInfo.id}\`
• Username: ${userInfo.username ? `@${userInfo.username}` : 'N/A'}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Revoke premium
    const success = await botAdminRevokePremium(userId);

    if (success) {
        await ctx.reply(
            `✅ *Premium Revoked*

👤 *User:*
• ID: \`${userInfo.id}\`
• Username: ${userInfo.username ? `@${userInfo.username}` : 'N/A'}

User is now on free tier (10 downloads/day).`,
            { parse_mode: 'Markdown' }
        );

        // Try to notify the user
        try {
            await ctx.api.sendMessage(
                userId,
                `ℹ️ *Premium Status Update*

Your premium access has been revoked.
You're now on the free tier with 10 downloads/day.

Contact admin if you think this is a mistake.`,
                { parse_mode: 'Markdown' }
            );
        } catch {
            // User may have blocked the bot
        }
    } else {
        await ctx.reply('❌ Failed to revoke premium. Please try again.');
    }
});

// Handle preset button callbacks
givepremiumComposer.callbackQuery(/^gp_give_(\d+)_(-?\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const match = ctx.callbackQuery.data.match(/^gp_give_(\d+)_(-?\d+)$/);
    if (!match) return;

    const userId = parseInt(match[1], 10);
    const days = parseInt(match[2], 10);

    // Get user info
    const userInfo = await botAdminGetUserInfo(userId);
    if (!userInfo) {
        await ctx.editMessageText('❌ User not found.');
        return;
    }

    // Give premium
    const result = await botAdminGivePremium(userId, days);

    if (result) {
        let expiryText = '♾️ Never (Lifetime)';
        if (result !== 'lifetime') {
            const expiry = new Date(result);
            expiryText = expiry.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        }

        await ctx.editMessageText(
            `✅ *Premium Granted!*

👤 *User:*
• ID: \`${userInfo.id}\`
• Username: ${userInfo.username ? `@${userInfo.username}` : 'N/A'}
• Name: ${userInfo.first_name || 'N/A'}

👑 *Premium:*
• Duration: ${formatDuration(days)}
• Expires: ${expiryText}

User now has unlimited downloads! 🎉`,
            { parse_mode: 'Markdown' }
        );

        // Notify user
        try {
            await ctx.api.sendMessage(
                userId,
                `🎉 *Congratulations!*

You've been granted *Premium Access*!

👑 *Duration:* ${formatDuration(days)}
📅 *Expires:* ${expiryText}

Enjoy unlimited downloads! 🚀`,
                { parse_mode: 'Markdown' }
            );
        } catch {
            // User may have blocked the bot
        }
    } else {
        await ctx.editMessageText('❌ Failed to grant premium. Please try again.');
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { botAdminGivePremium, botAdminRevokePremium };
