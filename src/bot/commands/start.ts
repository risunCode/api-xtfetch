/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT COMMAND - /start
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Welcome message with inline keyboard buttons.
 * Auto-registers user to database and shows stats.
 * 
 * @module bot/commands/start
 */

import { Composer } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface BotUser {
    id: number;
    username: string | null;
    first_name: string | null;
    language_code: string;
    is_banned: boolean;
    is_admin: boolean;
    api_key_id: string | null;
    daily_downloads: number;
    last_download_reset: string | null;
    created_at: string;
    updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const FREE_DAILY_LIMIT = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register or update bot user in database
 */
async function botUserRegister(ctx: Context): Promise<BotUser | null> {
    const db = supabaseAdmin;
    if (!db || !ctx.from) return null;

    const userId = ctx.from.id;
    const username = ctx.from.username || null;
    const firstName = ctx.from.first_name || null;
    const languageCode = ctx.from.language_code || 'en';

    try {
        // Check if user exists
        const { data: existingUser } = await db
            .from('bot_users')
            .select('*')
            .eq('id', userId)
            .single();

        if (existingUser) {
            // Update existing user
            const { data: updatedUser, error } = await db
                .from('bot_users')
                .update({
                    username,
                    first_name: firstName,
                    language_code: languageCode,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select()
                .single();

            if (error) {
                console.error('[botUserRegister] Update error:', error);
                return existingUser as BotUser;
            }
            return updatedUser as BotUser;
        }

        // Create new user
        const { data: newUser, error } = await db
            .from('bot_users')
            .insert({
                id: userId,
                username,
                first_name: firstName,
                language_code: languageCode,
                is_banned: false,
                is_admin: false,
                api_key_id: null,
                daily_downloads: 0,
                last_download_reset: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('[botUserRegister] Insert error:', error);
            return null;
        }
        return newUser as BotUser;
    } catch (error) {
        console.error('[botUserRegister] Error:', error);
        return null;
    }
}

/**
 * Get user's download stats for today
 */
async function botUserGetTodayStats(userId: number): Promise<{ downloadsToday: number; remaining: number }> {
    const db = supabaseAdmin;
    if (!db) return { downloadsToday: 0, remaining: FREE_DAILY_LIMIT };

    try {
        const { data: user } = await db
            .from('bot_users')
            .select('daily_downloads, last_download_reset, api_key_id')
            .eq('id', userId)
            .single();

        if (!user) return { downloadsToday: 0, remaining: FREE_DAILY_LIMIT };

        // Check if we need to reset daily counter
        const lastReset = user.last_download_reset ? new Date(user.last_download_reset) : new Date(0);
        const now = new Date();
        const isNewDay = lastReset.toDateString() !== now.toDateString();

        if (isNewDay) {
            // Reset counter for new day
            await db
                .from('bot_users')
                .update({
                    daily_downloads: 0,
                    last_download_reset: now.toISOString()
                })
                .eq('id', userId);
            return { downloadsToday: 0, remaining: FREE_DAILY_LIMIT };
        }

        // Premium users have unlimited
        if (user.api_key_id) {
            return { downloadsToday: user.daily_downloads || 0, remaining: -1 }; // -1 = unlimited
        }

        const downloadsToday = user.daily_downloads || 0;
        const remaining = Math.max(0, FREE_DAILY_LIMIT - downloadsToday);
        return { downloadsToday, remaining };
    } catch (error) {
        console.error('[botUserGetTodayStats] Error:', error);
        return { downloadsToday: 0, remaining: FREE_DAILY_LIMIT };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const startComposer = new Composer<Context>();

startComposer.command('start', async (ctx) => {
    // Register/update user
    await botUserRegister(ctx);

    // Simple welcome message (no emojis)
    const message = `DownAria Bot

Paste any video link.

Supported: YouTube, Instagram, TikTok, X, Facebook, Weibo`;

    await ctx.reply(message);
});

export { startComposer, botUserRegister, botUserGetTodayStats };
