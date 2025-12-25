/**
 * Telegram Bot Auth Middleware
 * Auto-registers new users and checks ban status
 * 
 * Grammy middleware pattern - attaches user data to context
 */

import { MiddlewareFn } from 'grammy';
import { logger } from '@/lib/services/shared/logger';
import type { BotContext, BotUser } from '../types';
import { BOT_MESSAGES } from '../types';
import { 
    botUserGetOrCreate as botUserGetOrCreateService,
} from '../services/userService';

// ============================================================================
// USER MANAGEMENT (Wrapper around userService)
// ============================================================================

/**
 * Get or create bot user in database
 * Wraps the userService function for middleware use
 */
async function botUserGetOrCreate(
    telegramId: number,
    userData: {
        username?: string;
        firstName?: string;
        lastName?: string;
        languageCode?: string;
    }
): Promise<BotUser | null> {
    const { data, error, isNew } = await botUserGetOrCreateService(
        telegramId,
        userData.username,
        userData.firstName,
        userData.languageCode || 'en'
    );

    if (error) {
        logger.error('telegram', error, 'USER_FETCH');
        return null;
    }

    if (isNew) {
        logger.debug('telegram', `New user registered: ${telegramId} (@${userData.username || 'no_username'})`);
    }

    // Map ServiceBotUser to BotUser (handle field name differences)
    if (data) {
        return {
            id: data.id,
            telegram_id: data.telegram_id,
            username: data.username || undefined,
            first_name: data.first_name || undefined,
            last_name: undefined, // Not in service type
            language_code: data.language_code,
            is_banned: false, // Not in service type, default to false
            ban_reason: undefined,
            api_key_id: data.api_key_id || undefined,
            daily_downloads: data.daily_downloads,
            last_download_at: data.last_download_at || undefined,
            downloads_reset_at: data.daily_reset_at,
            total_downloads: data.total_downloads,
            created_at: data.created_at,
            updated_at: data.updated_at,
        };
    }

    return null;
}

/**
 * Check if user is banned
 */
function botUserIsBanned(user: BotUser): boolean {
    return user.is_banned === true;
}

/**
 * Check if user is premium (has linked API key or is_premium flag)
 */
function botUserIsPremium(user: BotUser): boolean {
    return !!user.api_key_id;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Auth middleware - auto-registers users and checks ban status
 * 
 * Usage:
 * ```typescript
 * bot.use(authMiddleware);
 * ```
 */
export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
    // Skip if no user (e.g., channel posts)
    const from = ctx.from;
    if (!from) {
        return next();
    }

    // Get or create user
    const botUser = await botUserGetOrCreate(from.id, {
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
        languageCode: from.language_code,
    });

    if (!botUser) {
        // Database error - allow request but without user context
        logger.warn('telegram', `Failed to fetch/create user: ${from.id}`);
        return next();
    }

    // Check if banned
    if (botUserIsBanned(botUser)) {
        logger.debug('telegram', `Banned user attempted access: ${from.id}`);
        
        // Reply with ban message and stop processing
        await ctx.reply(BOT_MESSAGES.ERROR_BANNED, {
            reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
        });
        return; // Don't call next() - stop processing
    }

    // Attach user data to context
    ctx.botUser = botUser;
    ctx.isPremium = botUserIsPremium(botUser);

    // Continue to next middleware/handler
    return next();
};

// ============================================================================
// EXPORTS
// ============================================================================

export {
    botUserGetOrCreate,
    botUserIsBanned,
    botUserIsPremium,
};
