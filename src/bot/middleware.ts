/**
 * Bot Middleware - Merged
 * Combines auth, rate limiting, and maintenance into single file
 * with tier-based rate limiting (Free/VIP/VVIP)
 * 
 * Middleware order: staleMessageFilter → maintenanceMiddleware → authMiddleware → rateLimitMiddleware
 */

import { MiddlewareFn } from 'grammy';
import { redis } from '@/lib/database';
import { logger } from '@/lib/services/shared/logger';
import type { BotContext, BotUser } from './types';
import { UserTier, getUserTier, BOT_MESSAGES } from './types';
import { TIER_LIMITS, botIsAdmin } from './config';
import { botUserGetOrCreate as botUserGetOrCreateService, botUserIncrementDownloads } from './services/userService';
import { serviceConfigLoad, serviceConfigGet } from '@/lib/config';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Stale message threshold - ignore messages older than 15 minutes */
const STALE_MESSAGE_THRESHOLD_MS = 15 * 60 * 1000;

/** Deduplication TTL in seconds */
const DEDUP_TTL_SECONDS = 300;

// ============================================================================
// STALE MESSAGE FILTER
// ============================================================================

/**
 * Filter out stale messages (older than 15 minutes)
 * Prevents processing old messages when bot restarts
 */
export const staleMessageFilter: MiddlewareFn<BotContext> = async (ctx, next) => {
  const messageDate = ctx.message?.date || ctx.callbackQuery?.message?.date;
  if (messageDate) {
    const messageAge = Date.now() - messageDate * 1000;
    if (messageAge > STALE_MESSAGE_THRESHOLD_MS) {
      logger.debug('telegram', `Ignoring stale message (${Math.round(messageAge / 1000)}s old)`);
      return;
    }
  }
  return next();
};

// ============================================================================
// AUTH MIDDLEWARE
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
      username: data.username || undefined,
      first_name: data.first_name || undefined,
      last_name: undefined,
      language_code: data.language_code,
      is_banned: data.is_banned || false,
      is_admin: (data as any).is_admin || false,
      is_vip: (data as any).is_vip || false,
      ban_reason: undefined,
      api_key_id: data.api_key_id || undefined,
      vip_expires_at: (data as any).vip_expires_at || undefined,
      premium_expires_at: (data as any).premium_expires_at || undefined,
      daily_downloads: data.daily_downloads,
      daily_reset_at: data.daily_reset_at,
      last_download_at: data.last_download_at || undefined,
      last_download_reset: data.daily_reset_at,
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
export function botUserIsBanned(user: BotUser): boolean {
  return user.is_banned === true;
}

/**
 * Check if user is VIP (has VIP flag or linked API key)
 */
export function botUserIsVip(user: BotUser): boolean {
  const tier = getUserTier(user);
  return tier === UserTier.VIP || tier === UserTier.VVIP;
}

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
    await ctx.reply(BOT_MESSAGES.ERROR_BANNED, {
      reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
    });
    return; // Don't call next() - stop processing
  }

  // Attach user data to context
  ctx.botUser = botUser;
  // Admin is always VIP, otherwise check tier
  ctx.isVip = botIsAdmin(from.id) || botUserIsVip(botUser);
  ctx.isAdmin = botIsAdmin(from.id);

  return next();
};

// ============================================================================
// TIER-BASED RATE LIMITING
// ============================================================================

/**
 * Get the next midnight reset time in WIB (UTC+7)
 * Returns a Date object representing the next 00:00 WIB
 */
export function botRateLimitGetResetTime(): Date {
  const now = new Date();
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

/**
 * Get cooldown remaining (seconds) for user from Redis
 * Returns 0 if no cooldown active
 */
async function getCooldown(telegramId: number): Promise<number> {
  if (!redis) return 0;
  try {
    const ttl = await redis.ttl(`bot:cooldown:${telegramId}`);
    return ttl > 0 ? ttl : 0;
  } catch {
    return 0;
  }
}

/**
 * Set cooldown for user in Redis
 */
async function setCooldown(telegramId: number, seconds: number): Promise<void> {
  if (!redis || seconds <= 0) return;
  try {
    await redis.set(`bot:cooldown:${telegramId}`, '1', { ex: seconds });
  } catch (error) {
    logger.error('telegram', error, 'COOLDOWN_SET');
  }
}

/**
 * Detect user language from context
 */
function getUserLanguage(ctx: BotContext): 'id' | 'en' {
  const langCode = ctx.from?.language_code || ctx.botUser?.language_code || 'en';
  return langCode?.startsWith('id') ? 'id' : 'en';
}

/**
 * Rate limit middleware with tier-based limits
 * 
 * Tier Limits:
 * - Free: 8/day, 4s cooldown
 * - VIP: 15 req/2min window, ~8s cooldown
 * - VVIP: Same as VIP + API access
 * 
 * IMPORTANT: This middleware should run AFTER authMiddleware
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

  // Skip rate limit for API key input (dwa_*, xtf_*)
  const messageText = ctx.message?.text?.trim() || '';
  if (messageText.startsWith('dwa_') || messageText.startsWith('xtf_')) {
    return next();
  }

  const user = ctx.botUser;
  const tier = getUserTier(user);
  const tierConfig = TIER_LIMITS[tier];
  const lang = getUserLanguage(ctx);

  // VIP/VVIP: Check window-based rate limit (cooldown only)
  if (tier !== UserTier.FREE) {
    const cooldown = await getCooldown(user.id);
    if (cooldown > 0) {
      const msg = lang === 'id'
        ? `⏳ Tunggu ${cooldown} detik sebelum download berikutnya.`
        : `⏳ Wait ${cooldown} seconds before next download.`;
      await ctx.reply(msg, {
        reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
      });
      return;
    }
    
    ctx.rateLimit = { 
      remaining: Infinity, 
      cooldownSeconds: tierConfig.cooldownSeconds 
    };
    return next();
  }

  // Free tier: Check daily limit
  const freeConfig = tierConfig as typeof TIER_LIMITS[UserTier.FREE];
  const { hours, minutes } = getTimeUntilReset();
  
  if (user.daily_downloads >= freeConfig.dailyLimit) {
    const msg = lang === 'id'
      ? `❌ Batas harian tercapai (${user.daily_downloads}/${freeConfig.dailyLimit})\n\n` +
        `⏰ Reset: 00:00 WIB (${hours}j ${minutes}m lagi)\n\n` +
        `💝 Upgrade ke Paket Donasi mulai Rp5.000\n` +
        `🌐 Atau akses via website tanpa batas!`
      : `❌ Daily limit reached (${user.daily_downloads}/${freeConfig.dailyLimit})\n\n` +
        `⏰ Resets at: 00:00 WIB (in ${hours}h ${minutes}m)\n\n` +
        `💝 Upgrade to Donation Plan from Rp5,000\n` +
        `🌐 Or access via website with no limits!`;
    
    await ctx.reply(msg, {
      reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
      reply_markup: {
        inline_keyboard: [[
          { text: '🌐 Website', url: 'https://downaria.vercel.app' },
          { text: lang === 'id' ? '💝 Paket Donasi' : '💝 Donation Plan', callback_data: 'cmd:donate' },
        ]],
      },
    });
    return;
  }

  // Check cooldown
  const cooldown = await getCooldown(user.id);
  if (cooldown > 0) {
    const msg = lang === 'id'
      ? `⏳ Tunggu ${cooldown} detik sebelum download berikutnya.`
      : `⏳ Wait ${cooldown} seconds before next download.`;
    await ctx.reply(msg, {
      reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
    });
    return;
  }

  // Attach rate limit info to context
  ctx.rateLimit = {
    remaining: freeConfig.dailyLimit - user.daily_downloads,
    resetAt: botRateLimitGetResetTime(),
    cooldownSeconds: freeConfig.cooldownSeconds,
  };

  return next();
};

/**
 * Record successful download - sets cooldown and increments counter
 * Call this after a successful download
 */
export async function botRateLimitRecordDownload(ctx: BotContext): Promise<void> {
  if (!ctx.botUser) return;

  const tier = getUserTier(ctx.botUser);
  const tierConfig = TIER_LIMITS[tier];

  // Set cooldown based on tier
  await setCooldown(ctx.botUser.id, tierConfig.cooldownSeconds);

  // Increment download count
  await botUserIncrementDownloads(ctx.botUser.id);
}

/**
 * Record download by user ID (for queue worker)
 * Simpler version that doesn't need ctx
 */
export async function botRateLimitRecordDownloadById(userId: number, isPremium: boolean = false): Promise<void> {
  // Set cooldown based on tier
  const cooldownSeconds = isPremium ? TIER_LIMITS[UserTier.VIP].cooldownSeconds : TIER_LIMITS[UserTier.FREE].cooldownSeconds;
  await setCooldown(userId, cooldownSeconds);

  // Increment download count
  await botUserIncrementDownloads(userId);
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

// ============================================================================
// MAINTENANCE MIDDLEWARE
// ============================================================================

type MaintenanceType = 'off' | 'api' | 'full' | 'all';

interface MaintenanceInfo {
  isActive: boolean;
  type: MaintenanceType;
  message?: string;
  estimatedEndTime?: string;
}

/**
 * Middleware to check maintenance mode
 * Blocks all bot operations during full maintenance (except for admins)
 * 
 * NOTE: Fetches fresh config from DB on each request to ensure sync with admin console
 */
export const maintenanceMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  // Force refresh config from DB
  await serviceConfigLoad(true);
  const config = serviceConfigGet();
  
  const isMaintenanceMode = config.maintenanceMode === true;
  const maintenanceType = String(config.maintenanceType || 'off') as MaintenanceType;
  
  // Block on full maintenance or 'all' (not API-only)
  const shouldBlock = isMaintenanceMode && (maintenanceType === 'full' || maintenanceType === 'all');
  
  if (shouldBlock) {
    // Allow admins to bypass maintenance mode
    const userId = ctx.from?.id;
    if (userId && botIsAdmin(userId)) {
      return next(); // Admin bypass
    }
    
    // Build maintenance message
    const message = buildMaintenanceMessage({
      isActive: true,
      type: maintenanceType,
      message: config.maintenanceMessage,
    }, ctx.from?.language_code);
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    return; // Don't proceed to next middleware
  }
  
  return next();
};

/**
 * Build a comprehensive maintenance message
 */
function buildMaintenanceMessage(info: MaintenanceInfo, languageCode?: string): string {
  const lang = languageCode?.startsWith('id') ? 'id' : 'en';
  
  // Maintenance type indicator
  const typeIndicator = getMaintenanceTypeIndicator(info.type, lang);
  
  // Header
  const header = lang === 'id'
    ? `🔧 *Sedang Maintenance*`
    : `🔧 *Under Maintenance*`;
  
  // Type badge
  const typeBadge = lang === 'id'
    ? `\n\n📌 *Tipe:* ${typeIndicator}`
    : `\n\n📌 *Type:* ${typeIndicator}`;
  
  // Custom message from admin (if set)
  const customMsg = info.message
    ? `\n\n📝 ${info.message}`
    : '';
  
  // Estimated end time (if set)
  let estimatedTime = '';
  if (info.estimatedEndTime) {
    const endTime = formatEstimatedTime(info.estimatedEndTime, lang);
    if (endTime) {
      estimatedTime = lang === 'id'
        ? `\n\n⏰ *Perkiraan selesai:* ${endTime}`
        : `\n\n⏰ *Estimated completion:* ${endTime}`;
    }
  }
  
  // Default message if no custom message
  const defaultMsg = !info.message
    ? (lang === 'id'
        ? `\n\nLayanan sedang dalam pemeliharaan untuk peningkatan performa dan fitur baru.`
        : `\n\nService is under maintenance for performance improvements and new features.`)
    : '';
  
  // Footer
  const footer = lang === 'id'
    ? `\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Silakan coba lagi nanti.\n` +
      `Terima kasih atas kesabarannya! 🙏\n\n` +
      `📢 Update: @downariaxt\\_bot`
    : `\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Please try again later.\n` +
      `Thanks for your patience! 🙏\n\n` +
      `📢 Updates: @downariaxt\\_bot`;
  
  return header + typeBadge + customMsg + defaultMsg + estimatedTime + footer;
}

/**
 * Get human-readable maintenance type indicator
 */
function getMaintenanceTypeIndicator(type: MaintenanceType, lang: 'en' | 'id'): string {
  const indicators: Record<MaintenanceType, { en: string; id: string }> = {
    'off': { en: 'Normal', id: 'Normal' },
    'api': { en: 'API Only', id: 'Hanya API' },
    'full': { en: 'Full Maintenance', id: 'Maintenance Penuh' },
    'all': { en: 'Complete Shutdown', id: 'Shutdown Total' },
  };
  
  return indicators[type]?.[lang] || indicators['full'][lang];
}

/**
 * Format estimated end time to human-readable string
 */
function formatEstimatedTime(isoTime: string, lang: 'en' | 'id'): string | null {
  try {
    const endDate = new Date(isoTime);
    const now = new Date();
    
    // If end time is in the past, don't show it
    if (endDate <= now) {
      return lang === 'id' ? 'Segera' : 'Soon';
    }
    
    // Calculate time difference
    const diffMs = endDate.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 60) {
      return lang === 'id'
        ? `~${diffMins} menit lagi`
        : `~${diffMins} minutes`;
    } else if (diffHours < 24) {
      const mins = diffMins % 60;
      return lang === 'id'
        ? `~${diffHours} jam ${mins > 0 ? mins + ' menit' : ''}`
        : `~${diffHours} hour${diffHours > 1 ? 's' : ''} ${mins > 0 ? mins + ' min' : ''}`;
    } else {
      // Show date/time for longer maintenance
      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      };
      return endDate.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', options) + ' WIB';
    }
  } catch {
    return null;
  }
}

// ============================================================================
// MAINTENANCE HELPER FUNCTIONS
// ============================================================================

/**
 * Check if bot should be in maintenance mode (async - fetches from DB)
 */
export async function botIsInMaintenance(): Promise<boolean> {
  await serviceConfigLoad(true);
  const config = serviceConfigGet();
  const isMaintenanceMode = config.maintenanceMode === true;
  const maintenanceType = config.maintenanceType;
  return isMaintenanceMode && (maintenanceType === 'full' || maintenanceType === 'all');
}

/**
 * Get maintenance info for bot
 */
export async function botGetMaintenanceInfo(): Promise<MaintenanceInfo> {
  await serviceConfigLoad(true);
  const config = serviceConfigGet();
  
  return {
    isActive: config.maintenanceMode === true,
    type: (config.maintenanceType || 'off') as MaintenanceType,
    message: config.maintenanceMessage,
  };
}

/**
 * Get maintenance message for bot (bilingual)
 */
export async function botGetMaintenanceMessage(languageCode?: string): Promise<string> {
  const info = await botGetMaintenanceInfo();
  
  if (!info.isActive) {
    return languageCode?.startsWith('id')
      ? '✅ Layanan beroperasi normal.'
      : '✅ Service is operating normally.';
  }
  
  return buildMaintenanceMessage(info, languageCode);
}

// ============================================================================
// LEGACY EXPORTS (Backward Compatibility)
// ============================================================================

// Re-export for backward compatibility with existing code
export {
  botUserGetOrCreate,
  getCooldown as botRateLimitGetCooldown,
  setCooldown as botRateLimitSetCooldown,
  getTimeUntilReset,
};

// Legacy constants (from rateLimit.ts)
export const FREE_DAILY_LIMIT = TIER_LIMITS[UserTier.FREE].dailyLimit;
export const FREE_COOLDOWN_SECONDS = TIER_LIMITS[UserTier.FREE].cooldownSeconds;
export const FREE_COOLDOWN_MS = FREE_COOLDOWN_SECONDS * 1000;
export const VIP_COOLDOWN_MS = TIER_LIMITS[UserTier.VIP].cooldownSeconds * 1000;
