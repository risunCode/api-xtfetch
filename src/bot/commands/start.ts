/**
 * /start command - Professional welcome message with language support
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';
import { redis } from '@/lib/database';
import { t, detectLanguage, type BotLanguage } from '../i18n';

// ============================================================================
// TYPES
// ============================================================================

interface BotUser {
    id: number;
    username: string | null;
    first_name: string | null;
    language_code: string;
    is_banned: boolean;
    is_admin: boolean;
    api_key_id: string | null;
    daily_downloads: number;
    total_downloads: number;
    last_download_reset: string | null;
    created_at: string;
    updated_at: string;
}

interface PersistedRateLimit {
    daily_downloads: number;
    daily_reset_at: string;
}

const FREE_DAILY_LIMIT = 10;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get persisted rate limit data from Redis (survives /stop)
 */
async function getPersistedRateLimit(telegramId: number): Promise<PersistedRateLimit | null> {
    if (!redis) return null;
    
    try {
        const key = `bot:ratelimit:persist:${telegramId}`;
        const data = await redis.get(key);
        if (!data) return null;
        
        const parsed = JSON.parse(data as string) as PersistedRateLimit;
        
        // Check if reset time has passed
        const resetTime = new Date(parsed.daily_reset_at);
        if (Date.now() > resetTime.getTime()) {
            // Rate limit has reset, delete the key
            await redis.del(key);
            return null;
        }
        
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Clear persisted rate limit after restoring to DB
 */
async function clearPersistedRateLimit(telegramId: number): Promise<void> {
    if (!redis) return;
    try {
        await redis.del(`bot:ratelimit:persist:${telegramId}`);
    } catch {
        // Ignore
    }
}

/**
 * Register or update bot user in database
 * Restores rate limit data if user previously used /stop
 */
async function botUserRegister(ctx: Context): Promise<BotUser | null> {
    const db = supabaseAdmin;
    if (!db || !ctx.from) return null;

    const userId = ctx.from.id;
    const username = ctx.from.username || null;
    const firstName = ctx.from.first_name || null;
    const languageCode = ctx.from.language_code || 'en';

    try {
        const { data: existingUser } = await db
            .from('bot_users')
            .select('*')
            .eq('id', userId)
            .single();

        if (existingUser) {
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

        // New user - check for persisted rate limit (from previous /stop)
        const persistedLimit = await getPersistedRateLimit(userId);
        
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
                // Restore rate limit if exists, otherwise start fresh
                daily_downloads: persistedLimit?.daily_downloads || 0,
                total_downloads: 0,
                last_download_reset: persistedLimit?.daily_reset_at || new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('[botUserRegister] Insert error:', error);
            return null;
        }
        
        // Clear persisted data after successful restore
        if (persistedLimit) {
            await clearPersistedRateLimit(userId);
            console.log(`[botUserRegister] Restored rate limit for user ${userId}: ${persistedLimit.daily_downloads} downloads`);
        }
        
        return newUser as BotUser;
    } catch (error) {
        console.error('[botUserRegister] Error:', error);
        return null;
    }
}

/**
 * Get user's download stats
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

        const lastReset = user.last_download_reset ? new Date(user.last_download_reset) : new Date(0);
        const now = new Date();
        const isNewDay = lastReset.toDateString() !== now.toDateString();

        if (isNewDay) {
            await db
                .from('bot_users')
                .update({
                    daily_downloads: 0,
                    last_download_reset: now.toISOString()
                })
                .eq('id', userId);
            return { downloadsToday: 0, remaining: FREE_DAILY_LIMIT };
        }

        if (user.api_key_id) {
            return { downloadsToday: user.daily_downloads || 0, remaining: -1 };
        }

        const downloadsToday = user.daily_downloads || 0;
        const remaining = Math.max(0, FREE_DAILY_LIMIT - downloadsToday);
        return { downloadsToday, remaining };
    } catch (error) {
        console.error('[botUserGetTodayStats] Error:', error);
        return { downloadsToday: 0, remaining: FREE_DAILY_LIMIT };
    }
}

/**
 * Build start keyboard with language-aware buttons
 */
function buildStartKeyboard(lang: BotLanguage): InlineKeyboard {
    return new InlineKeyboard()
        .text(t('btn_menu', lang), 'cmd:menu')
        .text(t('btn_help', lang), 'cmd:help')
        .row()
        .text(t('btn_mystatus', lang), 'cmd:mystatus')
        .text(t('btn_donate', lang), 'cmd:donate')
        .row()
        .url(t('btn_website', lang), 'https://downaria.vercel.app');
}

// ============================================================================
// COMMAND HANDLER
// ============================================================================

const startComposer = new Composer<Context>();

startComposer.command('start', async (ctx) => {
    try {
        const user = await botUserRegister(ctx);
        const lang = detectLanguage(ctx.from?.language_code);
        
        // Check if returning user (has downloads)
        const isReturning = user && (user.total_downloads > 0 || user.daily_downloads > 0);
        
        const messageKey = isReturning ? 'start_welcome_back' : 'start_welcome';
        const message = t(messageKey, lang);
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: buildStartKeyboard(lang),
        });
    } catch (error) {
        console.error('[/start] Error:', error);
        await ctx.reply('👋 Welcome! Send me a video link to download.');
    }
});

export { startComposer, botUserRegister, botUserGetTodayStats };
