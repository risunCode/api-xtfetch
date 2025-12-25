/**
 * Telegram Bot Rate Limiting Middleware
 * Checks download limits (per 3 hours) and cooldown periods
 * 
 * Grammy middleware pattern - blocks requests that exceed limits
 */

import { MiddlewareFn } from 'grammy';
import { redis } from '@/lib/database';
import { logger } from '@/lib/services/shared/logger';
import type { BotContext, BotUser } from '../types';
import { RATE_LIMITS, BOT_MESSAGES } from '../types';
import { 
    botUserCheckDailyReset,
    botUserIncrementDownloads,
} from '../services/userService';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if downloads need to be reset (every 3 hours)
 */
function botRateLimitNeedsReset(user: BotUser): boolean {
    if (!user.last_download_reset) {
        console.log(`[RateLimit] User ${user.id}: No last_download_reset, needs reset`);
        return true;
    }

    const resetDate = new Date(user.last_download_reset);
    const now = new Date();
    const hoursDiff = (now.getTime() - resetDate.getTime()) / (1000 * 60 * 60);

    console.log(`[RateLimit] User ${user.id}: last_download_reset=${user.last_download_reset}, hoursDiff=${hoursDiff.toFixed(2)}, needsReset=${hoursDiff >= RATE_LIMITS.FREE_RESET_HOURS}`);

    // Reset if more than 3 hours have passed
    return hoursDiff >= RATE_LIMITS.FREE_RESET_HOURS;
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
// MIDDLEWARE
// ============================================================================

/**
 * Rate limit middleware - checks daily limits and cooldown
 * 
 * IMPORTANT: This middleware should run AFTER authMiddleware
 * It requires ctx.botUser and ctx.isPremium to be set
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

    const user = ctx.botUser;
    const telegramId = user.id;

    // Premium users bypass all limits
    if (ctx.isPremium) {
        ctx.rateLimit = {
            remaining: Infinity,
        };
        return next();
    }

    // Check if count needs reset (every 3 hours)
    if (botRateLimitNeedsReset(user)) {
        await botRateLimitResetDaily(telegramId);
        user.daily_downloads = 0; // Update local copy
    }

    // Check download limit
    const downloadLimit = RATE_LIMITS.FREE_DOWNLOAD_LIMIT;
    if (user.daily_downloads >= downloadLimit) {
        const message = BOT_MESSAGES.ERROR_LIMIT_REACHED
            .replace('{limit}', String(downloadLimit))
            .replace('{hours}', String(RATE_LIMITS.FREE_RESET_HOURS));
        
        await ctx.reply(message, {
            reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔑 Get API Key', callback_data: 'have_api_key' },
                ]],
            },
        });
        return; // Stop processing
    }

    // Check cooldown
    const cooldownRemaining = await botRateLimitGetCooldown(telegramId);
    if (cooldownRemaining > 0) {
        const message = BOT_MESSAGES.ERROR_RATE_LIMIT.replace('{seconds}', String(cooldownRemaining));
        
        await ctx.reply(message, {
            reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
        });
        return; // Stop processing
    }

    // Attach rate limit info to context
    ctx.rateLimit = {
        remaining: downloadLimit - user.daily_downloads,
        cooldownSeconds: RATE_LIMITS.FREE_COOLDOWN_SECONDS,
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

    // Premium users don't have cooldown
    if (!ctx.isPremium) {
        await botRateLimitSetCooldown(telegramId, RATE_LIMITS.FREE_COOLDOWN_SECONDS);
    }

    // Increment download count
    await botRateLimitIncrementDownloads(telegramId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
    botRateLimitNeedsReset,
    botRateLimitResetDaily,
    botRateLimitGetCooldown,
    botRateLimitSetCooldown,
    botRateLimitIncrementDownloads,
};
