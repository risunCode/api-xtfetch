/**
 * Telegram Bot Configuration
 * Environment variables and constants for the bot
 */

import { UserTier } from './types';

// ============================================================================
// Environment Variables
// ============================================================================

/** Telegram Bot Token from @BotFather */
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

/** Webhook secret for verifying incoming requests (trimmed to handle Railway newline issue) */
export const TELEGRAM_WEBHOOK_SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();

/** Comma-separated list of admin Telegram user IDs */
export const TELEGRAM_ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)
  .map(Number);

/** Backend API URL for proxying media */
export const API_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : 'http://localhost:3002';

// ============================================================================
// Rate Limits
// ============================================================================

/** Download limit per reset period for free users */
export const FREE_DOWNLOAD_LIMIT = 7;

/** Reset period in hours for free users */
export const FREE_RESET_HOURS = 12;

/** Cooldown between downloads in seconds (free users) */
export const FREE_COOLDOWN_SECONDS = 4;

/** Premium download limit (0 = unlimited) */
export const PREMIUM_DOWNLOAD_LIMIT = 0;

/** Premium cooldown in seconds (auto-queue) */
export const PREMIUM_COOLDOWN_SECONDS = 0;

// ============================================================================
// Tier Limits Configuration
// ============================================================================

// Tier rate limits configuration
export const TIER_LIMITS = {
  [UserTier.FREE]: {
    dailyLimit: 7,
    cooldownSeconds: 4,
    hasApiAccess: false,
    description: 'Free User',
    icon: '🆓',
  },
  [UserTier.VIP]: {
    requestsPerWindow: 15,
    windowMinutes: 2,
    cooldownSeconds: 0, // no cooldown for VIP
    hasApiAccess: false,
    description: 'Donator',
    icon: '⭐',
  },
  [UserTier.VVIP]: {
    requestsPerWindow: 15,
    windowMinutes: 2,
    cooldownSeconds: 0, // no cooldown for VVIP
    hasApiAccess: true,
    description: 'Donator Premium',
    icon: '👑',
  },
} as const;

export type TierLimits = typeof TIER_LIMITS;

// ============================================================================
// Tier Helper Functions
// ============================================================================

export function getTierInfo(tier: UserTier) {
  return TIER_LIMITS[tier];
}

export function getTierIcon(tier: UserTier): string {
  return TIER_LIMITS[tier].icon;
}

export function getTierDescription(tier: UserTier): string {
  return TIER_LIMITS[tier].description;
}

export function formatTierDisplay(tier: UserTier): string {
  const info = TIER_LIMITS[tier];
  return `${info.icon} ${info.description}`;
}

// ============================================================================
// Bot Settings
// ============================================================================

/** Admin contact username (without @) */
export const ADMIN_CONTACT_USERNAME = process.env.TELEGRAM_ADMIN_USERNAME || 'xtfetch_support';

/** Bot username (without @) */
export const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'xtfetch_bot';

/** Maximum file size for direct upload (50MB Telegram limit) */
export const MAX_DIRECT_UPLOAD_SIZE = 50 * 1024 * 1024;

/** Maximum file size for URL upload (2GB Telegram limit) */
export const MAX_URL_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;

// ============================================================================
// Messages
// ============================================================================

export const MESSAGES = {
  WELCOME: `🎬 *Welcome to XTFetch Bot!*

Send me a video link from:
• Instagram
• TikTok
• Twitter/X
• Facebook
• YouTube
• Weibo

I'll download it for you! 🚀`,

  RATE_LIMITED: (seconds: number) =>
    `⏳ Please wait ${seconds} seconds before your next download.`,

  LIMIT_REACHED: (limit: number, hours: number) =>
    `📊 You've reached your limit of ${limit} downloads per ${hours} hours.\n\n⏰ Your limit will reset soon!\n💎 Upgrade to premium for unlimited downloads!`,

  PROCESSING: '⏳ Processing your request...',

  INVALID_URL: '❌ Invalid URL. Please send a valid video link.',

  DOWNLOAD_ERROR: '❌ Failed to download. Please try again later.',

  UNSUPPORTED_PLATFORM: '❌ This platform is not supported yet.',

  HELP: `📖 *How to use XTFetch Bot*

1. Send a video link
2. Wait for processing
3. Receive your video!

*Supported platforms:*
• Facebook • Instagram • Twitter/X
• TikTok • YouTube • Weibo
• BiliBili • Reddit • SoundCloud
• Pixiv • Erome • Eporner • PornHub • Rule34Video

*Commands:*
/start - Start the bot
/help - Show this help
/stats - Your download stats
/premium - Premium info

Need help? Contact @${ADMIN_CONTACT_USERNAME}`,
} as const;

// ============================================================================
// Validation
// ============================================================================

/** Check if bot is properly configured */
export function botConfigIsValid(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN);
}

/** Check if user is admin */
export function botIsAdmin(userId: number): boolean {
  return TELEGRAM_ADMIN_IDS.includes(userId);
}
