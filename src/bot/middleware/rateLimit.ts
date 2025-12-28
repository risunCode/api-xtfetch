/**
 * Telegram Bot Rate Limiting Middleware
 * Checks download limits (daily reset at midnight WIB) and cooldown periods
 * 
 * Grammy middleware pattern - blocks requests that exceed limits
 */

import { MiddlewareFn } from 'grammy';
import { redis } from '@/lib/database';
import { logger } from '@/lib/services/shared/logger';
import type { BotContext, BotUser } from '../types';
import { 
    botUserCheckDailyReset,
    botUserIncrementDownloads,
} from '../services/userService';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Free tier daily download limit */
const FREE_DAILY_LIMIT = 8;

/** Free tier cooldown between downloads (milliseconds) */
const FREE_COOLDOWN_MS = 4000;

/** VIP cooldown (no cooldown) */
const VIP_COOLDOWN_MS = 0;

/** Free tier cooldown in seconds (for display) */
const FREE_COOLDOWN_SECONDS = FREE_COOLDOWN_MS / 1000;

/** Deduplication TTL in seconds */
const DEDUP_TTL_SECONDS = 30;

// ============================================================================
// WIB TIMEZONE HELPERS
// ============================================================================

/**
 * Get the next midnight reset time in WIB (UTC+7)
 * Returns a Date object representing the next 00:00 WIB
 */
export function botRateLimitGetResetTime(): Date {
    const now = new Date();
    
    // WIB is UTC+7, so midnight WIB = 17:00 UTC previous day
    // Calculate next midnight WIB
    const nextMidnight = new Date(now);
    
    // Midnight WIB = 17:00 UTC
    if (now.getUTCHours() >= 17) {
        // Already past 17:00 UTC (midnight WIB), so next reset is tomorrow
        nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
    }
    
    // Set to 17:00 UTC (00:00 WIB)
    nextMidnight.setUTCHours(17, 0, 0, 0);
    
    return nextMidnight;
}

/**
 * Check if daily downloads should be reset (midnight WIB has passed since last reset)
 */
function shouldResetDaily(lastResetAt: string | null): boolean {
    if (!lastResetAt) return true;
    
    const lastReset = new Date(lastResetAt);
    const now = new Date();
    
    // Get the most recent midnight WIB before now
    const currentMidnightWIB = new Date(now);
    if (now.getUTCHours() < 17) {
        // Before 17:00 UTC, so current WIB day started yesterday at 17:00 UTC
        currentMidnightWIB.setUTCDate(currentMidnightWIB.getUTCDate() - 1);
    }
    currentMidnightWIB.setUTCHours(17, 0, 0, 0);
    
    // If last reset was before the most recent midnight WIB, we need to reset
    return lastReset < currentMidnightWIB;
}

/**
 * Get time remaining until reset in hours and minutes
 */
function getTimeUntilReset(): { hours: number; minutes: number } {
    const resetTime = botRateLimitGetResetTime();
    const now = Date.now();
    const diffMs = resetTime.getTime() - now;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return { hours: Math.max(0, hours), minutes: Math.max(0, minutes) };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if downloads need to be reset (midnight WIB passed)
 */
function botRateLimitNeedsReset(user: BotUser): boolean {
    const lastResetAt = user.last_download_reset;
    
    if (!lastResetAt) {
        console.log(`[RateLimit] User ${user.id}: No last reset timestamp, needs reset`);
        return true;
    }

    const needsReset = shouldResetDaily(lastResetAt);
    console.log(`[RateLimit] User ${user.id}: last_reset=${lastResetAt}, needsReset=${needsReset}`);

    return needsReset;
}

/**
 * Reset download count for user (uses userService)
 */
async function botRateLimitResetDaily(telegramId: number): Promise<void> {
    const { error } = await botUserCheckDailyReset(telegramId);
    if (error) {
        logger.error('telegram', error, 'RATE_LIMIT_RESET');
    } else {
        logger.debug('telegram', `Reset downloads for user: ${telegramId}`);
    }
}

/**
 * Atomic check and reset daily downloads using Redis lock
 * Prevents race condition when multiple requests arrive simultaneously at midnight
 */
async function atomicCheckAndReset(telegramId: number, user: BotUser): Promise<void> {
    if (!redis) {
        // Fallback to non-atomic if no Redis
        if (botRateLimitNeedsReset(user)) {
            await botRateLimitResetDaily(telegramId);
            user.daily_downloads = 0;
        }
        return;
    }

    const lockKey = `bot:reset_lock:${telegramId}`;
    
    // Try to acquire lock (expires in 5 seconds)
    const acquired = await redis.set(lockKey, '1', { nx: true, ex: 5 });
    
    if (!acquired) {
        // Another request is handling reset, wait briefly and refresh user data
        await new Promise(r => setTimeout(r, 100));
        return;
    }
    
    try {
        if (botRateLimitNeedsReset(user)) {
            await botRateLimitResetDaily(telegramId);
            user.daily_downloads = 0;
        }
    } finally {
        await redis.del(lockKey).catch(() => {});
    }
}

/**
 * Get cooldown remaining (seconds) for user
 * Returns 0 if no cooldown active
 */
async function botRateLimitGetCooldown(telegramId: number): Promise<number> {
    if (!redis) return 0;

    try {
        const key = `bot:cooldown:${telegramId}`;
        const ttl = await redis.ttl(key);
        return ttl > 0 ? ttl : 0;
    } catch {
        return 0;
    }
}

/**
 * Set cooldown for user
 */
async function botRateLimitSetCooldown(telegramId: number, seconds: number): Promise<void> {
    if (!redis || seconds <= 0) return;

    try {
        const key = `bot:cooldown:${telegramId}`;
        await redis.set(key, '1', { ex: seconds });
    } catch (error) {
        logger.error('telegram', error, 'COOLDOWN_SET');
    }
}

/**
 * Increment download count for user (uses userService)
 */
async function botRateLimitIncrementDownloads(telegramId: number): Promise<void> {
    const { error } = await botUserIncrementDownloads(telegramId);
    if (error) {
        logger.error('telegram', error, 'INCREMENT_DOWNLOADS');
    }
}

// ============================================================================
// REQUEST DEDUPLICATION
// ============================================================================

/**
 * Check if this is a duplicate request (same user + URL within TTL)
 * Returns true if duplicate, false if new request
 */
export async function isDuplicateRequest(userId: number, url: string): Promise<boolean> {
    if (!redis) return false;
    
    // Create hash of URL for shorter key
    const urlHash = url.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0).toString(36);
    
    const key = `bot:dedup:${userId}:${urlHash}`;
    
    try {
        const exists = await redis.get(key);
        if (exists) return true;
        
        await redis.set(key, '1', { ex: DEDUP_TTL_SECONDS });
        return false;
    } catch {
        return false;
    }
}

/**
 * Clear duplicate request marker (call on failure to allow retry)
 */
export async function clearDuplicateRequest(userId: number, url: string): Promise<void> {
    if (!redis) return;
    
    const urlHash = url.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0).toString(36);
    
    const key = `bot:dedup:${userId}:${urlHash}`;
    await redis.del(key).catch(() => {});
}

/**
 * Detect user language from context
 */
function getUserLanguage(ctx: BotContext): 'id' | 'en' {
    const langCode = ctx.from?.language_code || ctx.botUser?.language_code || 'en';
    return langCode === 'id' ? 'id' : 'en';
}

/**
 * Generate limit exceeded message with reset time
 */
function getLimitExceededMessage(used: number, lang: 'id' | 'en'): string {
    const { hours, minutes } = getTimeUntilReset();
    
    if (lang === 'id') {
        return `❌ Batas harian tercapai (${used}/${FREE_DAILY_LIMIT})\n\n` +
            `⏰ Reset: 00:00 WIB (${hours}j ${minutes}m lagi)\n\n` +
            `💝 Upgrade ke Paket Donasi mulai Rp5.000\n` +
            `🌐 Atau akses via website tanpa batas!`;
    }
    
    return `❌ Daily limit reached (${used}/${FREE_DAILY_LIMIT})\n\n` +
        `⏰ Resets at: 00:00 WIB (in ${hours}h ${minutes}m)\n\n` +
        `💝 Upgrade to Donation Plan from Rp5,000\n` +
        `🌐 Or access via website with no limits!`;
}

/**
 * Generate cooldown message
 */
function getCooldownMessage(seconds: number, lang: 'id' | 'en'): string {
    if (lang === 'id') {
        return `⏳ Tunggu ${seconds} detik sebelum download berikutnya.`;
    }
    return `⏳ Wait ${seconds} seconds before next download.`;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Rate limit middleware - checks daily limits and cooldown
 * 
 * IMPORTANT: This middleware should run AFTER authMiddleware
 * It requires ctx.botUser and ctx.isVip to be set
 * 
 * Usage:
 * ```typescript
 * bot.use(authMiddleware);
 * bot.use(rateLimitMiddleware);
 * ```
 */
export const rateLimitMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
    // Skip if no user context (auth middleware didn't run or failed)
    if (!ctx.botUser) {
        return next();
    }

    // Skip rate limit for callback queries (quality selection, menu buttons, etc.)
    if (ctx.callbackQuery) {
        return next();
    }

    // Skip rate limit for commands (only apply to URL messages)
    if (ctx.message?.text?.startsWith('/')) {
        return next();
    }

    // Skip rate limit for API key input (dwa_live_*, dwa_test_*, xtf_*)
    // This allows users to link API key even when rate limited
    const messageText = ctx.message?.text?.trim() || '';
    if (messageText.startsWith('dwa_live_') || messageText.startsWith('dwa_test_') || messageText.startsWith('xtf_')) {
        return next();
    }

    const user = ctx.botUser;
    const telegramId = user.id;
    const lang = getUserLanguage(ctx);

    // VIP users bypass all limits
    if (ctx.isVip) {
        ctx.rateLimit = {
            remaining: Infinity,
            cooldownSeconds: VIP_COOLDOWN_MS / 1000,
        };
        return next();
    }

    // Check if count needs reset (midnight WIB passed) - using atomic operation
    await atomicCheckAndReset(telegramId, user);

    // Check download limit
    if (user.daily_downloads >= FREE_DAILY_LIMIT) {
        const message = getLimitExceededMessage(user.daily_downloads, lang);
        
        await ctx.reply(message, {
            reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🌐 Website', url: 'https://downaria.vercel.app' },
                        { text: lang === 'id' ? '💝 Paket Donasi' : '💝 Donation Plan', callback_data: 'cmd:donate' },
                    ],
                ],
            },
        });
        return; // Stop processing
    }

    // Check cooldown
    const cooldownRemaining = await botRateLimitGetCooldown(telegramId);
    if (cooldownRemaining > 0) {
        const message = getCooldownMessage(cooldownRemaining, lang);
        
        await ctx.reply(message, {
            reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
        });
        return; // Stop processing
    }

    // Attach rate limit info to context
    ctx.rateLimit = {
        remaining: FREE_DAILY_LIMIT - user.daily_downloads,
        resetAt: botRateLimitGetResetTime(),
        cooldownSeconds: FREE_COOLDOWN_SECONDS,
    };

    // Continue to next middleware/handler
    return next();
};

/**
 * Record successful download - call after successful download
 * Sets cooldown and increments counters
 */
export async function botRateLimitRecordDownload(ctx: BotContext): Promise<void> {
    if (!ctx.botUser) return;

    const telegramId = ctx.botUser.id;

    // VIP users don't have cooldown
    if (!ctx.isVip) {
        await botRateLimitSetCooldown(telegramId, FREE_COOLDOWN_SECONDS);
    }

    // Increment download count
    await botRateLimitIncrementDownloads(telegramId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    FREE_DAILY_LIMIT,
    FREE_COOLDOWN_MS,
    FREE_COOLDOWN_SECONDS,
    VIP_COOLDOWN_MS,
    DEDUP_TTL_SECONDS,
    botRateLimitNeedsReset,
    botRateLimitResetDaily,
    botRateLimitGetCooldown,
    botRateLimitSetCooldown,
    botRateLimitIncrementDownloads,
    getTimeUntilReset,
    atomicCheckAndReset,
};
