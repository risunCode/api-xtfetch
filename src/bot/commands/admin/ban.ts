/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT ADMIN COMMANDS - /ban and /unban
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Ban/unban users from using the bot.
 * Usage: 
 *   /ban <user_id> [reason] - Ban a user
 *   /unban <user_id> - Unban a user
 * 
 * @module bot/commands/admin/ban
 */

import { Composer } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface BotUserInfo {
    id: number;
    username: string | null;
    first_name: string | null;
    is_banned: boolean;
    daily_downloads: number;
    created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get user info from database
 */
async function botAdminGetUserInfo(userId: number): Promise<BotUserInfo | null> {
    const db = supabaseAdmin;
    if (!db) return null;

    try {
        const { data, error } = await db
            .from('bot_users')
            .select('id, username, first_name, is_banned, daily_downloads, created_at')
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
 * Ban a user
 * @param userId - Telegram user ID to ban
 * @returns Success status
 */
async function botAdminBanUser(userId: number): Promise<boolean> {
    const db = supabaseAdmin;
    if (!db) return false;

    try {
        const { error } = await db
            .from('bot_users')
            .update({
                is_banned: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId);

        if (error) {
            console.error('[botAdminBanUser] Error:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[botAdminBanUser] Error:', error);
        return false;
    }
}

/**
 * Unban a user
 * @param userId - Telegram user ID to unban
 * @returns Success status
 */
async function botAdminUnbanUser(userId: number): Promise<boolean> {
    const db = supabaseAdmin;
    if (!db) return false;

    try {
        const { error } = await db
            .from('bot_users')
            .update({
                is_banned: false,
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId);

        if (error) {
            console.error('[botAdminUnbanUser] Error:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[botAdminUnbanUser] Error:', error);
        return false;
    }
}

/**
 * Parse user ID from command arguments
 */
function parseUserId(text: string, command: string): number | null {
    const args = text.replace(new RegExp(`^/${command}\\s*`, 'i'), '').trim();
    const userIdStr = args.split(/\s+/)[0];
    
    if (!userIdStr) return null;
    
    const userId = parseInt(userIdStr, 10);
    if (isNaN(userId) || userId <= 0) return null;
    
    return userId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const banComposer = new Composer<Context>();

// /ban command
banComposer.command('ban', async (ctx) => {
    const messageText = ctx.message?.text || '';
    const userId = parseUserId(messageText, 'ban');

    if (!userId) {
        await ctx.reply(
            `🚫 *Ban User Command*

Usage: \`/ban <user_id>\`

Example: \`/ban 123456789\`

This will prevent the user from using the bot.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Get user info first
    const userInfo = await botAdminGetUserInfo(userId);

    if (!userInfo) {
        await ctx.reply(
            `❌ User \`${userId}\` not found in database.

The user may not have started the bot yet.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (userInfo.is_banned) {
        await ctx.reply(
            `⚠️ User is already banned.

👤 *User Info*
• ID: \`${userInfo.id}\`
• Username: ${userInfo.username ? `@${userInfo.username}` : 'N/A'}
• Name: ${userInfo.first_name || 'N/A'}
• Status: 🚫 Banned`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Ban the user
    const success = await botAdminBanUser(userId);

    if (success) {
        await ctx.reply(
            `✅ *User Banned Successfully*

👤 *User Info*
• ID: \`${userInfo.id}\`
• Username: ${userInfo.username ? `@${userInfo.username}` : 'N/A'}
• Name: ${userInfo.first_name || 'N/A'}
• Downloads: ${userInfo.daily_downloads}
• Joined: ${new Date(userInfo.created_at).toLocaleDateString()}

🚫 User can no longer use the bot.

To unban: \`/unban ${userId}\``,
            { parse_mode: 'Markdown' }
        );
    } else {
        await ctx.reply('❌ Failed to ban user. Please try again.');
    }
});

// /unban command
banComposer.command('unban', async (ctx) => {
    const messageText = ctx.message?.text || '';
    const userId = parseUserId(messageText, 'unban');

    if (!userId) {
        await ctx.reply(
            `✅ *Unban User Command*

Usage: \`/unban <user_id>\`

Example: \`/unban 123456789\`

This will restore the user's access to the bot.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Get user info first
    const userInfo = await botAdminGetUserInfo(userId);

    if (!userInfo) {
        await ctx.reply(
            `❌ User \`${userId}\` not found in database.

The user may not have started the bot yet.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (!userInfo.is_banned) {
        await ctx.reply(
            `⚠️ User is not banned.

👤 *User Info*
• ID: \`${userInfo.id}\`
• Username: ${userInfo.username ? `@${userInfo.username}` : 'N/A'}
• Name: ${userInfo.first_name || 'N/A'}
• Status: ✅ Active`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Unban the user
    const success = await botAdminUnbanUser(userId);

    if (success) {
        await ctx.reply(
            `✅ *User Unbanned Successfully*

👤 *User Info*
• ID: \`${userInfo.id}\`
• Username: ${userInfo.username ? `@${userInfo.username}` : 'N/A'}
• Name: ${userInfo.first_name || 'N/A'}
• Downloads: ${userInfo.daily_downloads}
• Joined: ${new Date(userInfo.created_at).toLocaleDateString()}

✅ User can now use the bot again.`,
            { parse_mode: 'Markdown' }
        );
    } else {
        await ctx.reply('❌ Failed to unban user. Please try again.');
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { botAdminBanUser, botAdminUnbanUser, botAdminGetUserInfo };
