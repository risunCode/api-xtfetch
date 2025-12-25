/**
 * Bot Message Templates
 * Reusable message templates for Telegram bot
 */

import { PlatformId } from '@/lib/types';
import { FREE_DOWNLOAD_LIMIT, ADMIN_CONTACT_USERNAME, BOT_USERNAME } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface UserInfo {
  firstName?: string | null;
  username?: string | null;
  isPremium?: boolean;
}

export interface UserStats {
  dailyDownloads: number;
  totalDownloads: number;
  remaining: number;
}

export interface MediaInfo {
  title?: string;
  author?: string;
  duration?: string;
  size?: string;
}

export interface ApiKeyInfo {
  key: string;
  expiresAt?: string | null;
  downloadsUsed?: number;
  downloadsLimit?: number | null;
}

// ============================================================================
// Platform Display Names
// ============================================================================

const PLATFORM_NAMES: Record<PlatformId, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'X (Twitter)',
  tiktok: 'TikTok',
  weibo: 'Weibo',
  youtube: 'YouTube',
};

const PLATFORM_ICONS: Record<PlatformId, string> = {
  facebook: '📘',
  instagram: '📸',
  twitter: '𝕏',
  tiktok: '🎵',
  weibo: '🔴',
  youtube: '▶️',
};

// ============================================================================
// Welcome & Menu Messages
// ============================================================================

/**
 * Welcome message for new/returning users
 */
export function welcomeMessage(user: UserInfo, stats?: UserStats): string {
  const name = user.firstName || user.username || 'there';
  const premiumBadge = user.isPremium ? ' ⭐' : '';

  let message = `🎬 *Welcome to DownAria Bot!*${premiumBadge}

Hey ${name}! 👋

Send me a video link and I'll download it for you!

*Supported platforms:*
• 📘 Facebook
• 📸 Instagram
• 𝕏 Twitter/X
• 🎵 TikTok
• ▶️ YouTube
• 🔴 Weibo`;

  if (stats) {
    const remaining = user.isPremium ? '∞' : stats.remaining.toString();
    message += `

📊 *Your Stats:*
• Downloads today: ${stats.dailyDownloads}/${user.isPremium ? '∞' : FREE_DOWNLOAD_LIMIT}
• Remaining: ${remaining}
• Total downloads: ${stats.totalDownloads}`;
  }

  message += `

Just paste a link to get started! 🚀`;

  return message;
}

/**
 * Help message
 */
export function helpMessage(): string {
  return `📖 *How to Use DownAria Bot*

*Step 1:* Copy a video link from any supported platform
*Step 2:* Paste it here
*Step 3:* Wait for the download
*Step 4:* Enjoy your video! 🎉

*Supported Platforms:*
• 📘 Facebook - Videos, Reels, Stories
• 📸 Instagram - Reels, Posts, Stories
• 𝕏 Twitter/X - Videos, GIFs
• 🎵 TikTok - Videos (with/without watermark)
• ▶️ YouTube - Videos, Shorts
• 🔴 Weibo - Videos

*Commands:*
/start - Main menu
/help - This help message
/stats - Your download statistics
/premium - Premium features info

*Tips:*
• Make sure the link is public
• Some platforms may require cookies
• Large files may take longer

Need help? Contact @${ADMIN_CONTACT_USERNAME}`;
}

// ============================================================================
// Processing Messages
// ============================================================================

/**
 * Processing message when download starts
 */
export function processingMessage(platform: PlatformId, url: string): string {
  const platformName = PLATFORM_NAMES[platform] || platform;
  const icon = PLATFORM_ICONS[platform] || '🔗';

  return `${icon} *Processing ${platformName} link...*

⏳ Please wait while I fetch your media.

\`${truncateUrl(url)}\``;
}

/**
 * Success message after download
 */
export function successMessage(
  media: MediaInfo,
  remaining: number | 'unlimited'
): string {
  const remainingText = remaining === 'unlimited' ? '∞' : remaining.toString();

  let message = `✅ *Download Ready!*

📝 *Title:* ${escapeMarkdown(media.title || 'Untitled')}`;

  if (media.author) {
    message += `\n👤 *Author:* ${escapeMarkdown(media.author)}`;
  }

  if (media.duration) {
    message += `\n⏱ *Duration:* ${media.duration}`;
  }

  if (media.size) {
    message += `\n📦 *Size:* ${media.size}`;
  }

  message += `

📊 Downloads remaining today: *${remainingText}*`;

  return message;
}

/**
 * Success message with multiple formats available
 */
export function successWithFormatsMessage(
  media: MediaInfo,
  formatCount: number
): string {
  let message = `✅ *Media Found!*

📝 *Title:* ${escapeMarkdown(media.title || 'Untitled')}`;

  if (media.author) {
    message += `\n👤 *Author:* ${escapeMarkdown(media.author)}`;
  }

  if (media.duration) {
    message += `\n⏱ *Duration:* ${media.duration}`;
  }

  message += `

📥 *${formatCount} formats available*
Select your preferred quality below:`;

  return message;
}

// ============================================================================
// Error Messages
// ============================================================================

/**
 * Generic error message
 */
export function errorMessage(platform: PlatformId, error: string): string {
  const platformName = PLATFORM_NAMES[platform] || platform;
  const icon = PLATFORM_ICONS[platform] || '🔗';

  return `❌ *Download Failed*

${icon} Platform: ${platformName}
⚠️ Error: ${escapeMarkdown(error)}

*Possible reasons:*
• The content might be private
• The link might be invalid
• The platform might be temporarily unavailable

Please try again or contact @${ADMIN_CONTACT_USERNAME} if the issue persists.`;
}

/**
 * Invalid URL message
 */
export function invalidUrlMessage(): string {
  return `❌ *Invalid URL*

Please send a valid video link from one of these platforms:
• Facebook
• Instagram
• Twitter/X
• TikTok
• YouTube
• Weibo

*Example:*
\`https://www.instagram.com/reel/ABC123\``;
}

/**
 * Unsupported platform message
 */
export function unsupportedPlatformMessage(url: string): string {
  return `❌ *Unsupported Platform*

The link you sent is not from a supported platform.

*Supported platforms:*
• 📘 Facebook
• 📸 Instagram
• 𝕏 Twitter/X
• 🎵 TikTok
• ▶️ YouTube
• 🔴 Weibo

Your link: \`${truncateUrl(url)}\``;
}

// ============================================================================
// Rate Limit Messages
// ============================================================================

/**
 * Rate limit message (cooldown)
 */
export function rateLimitMessage(resetInSeconds: number): string {
  return `⏳ *Please Wait*

You're sending requests too quickly!
Please wait *${resetInSeconds} seconds* before your next download.

💡 *Tip:* Upgrade to premium for faster downloads!`;
}

/**
 * Daily limit reached message
 */
export function dailyLimitMessage(limit: number, resetTime?: string): string {
  let message = `📊 *Daily Limit Reached*

You've used all *${limit}* free downloads for today.

*Options:*
• Wait until tomorrow for reset
• Upgrade to premium for unlimited downloads`;

  if (resetTime) {
    message += `\n\n🕐 Resets at: ${resetTime}`;
  }

  return message;
}

// ============================================================================
// Premium Messages
// ============================================================================

/**
 * Premium info message (for free users)
 */
export function premiumInfoMessage(): string {
  return `⭐ *Premium Features*

Upgrade to premium and enjoy:

✅ *Unlimited downloads* - No daily limits
✅ *Faster processing* - Priority queue
✅ *No cooldown* - Download back-to-back
✅ *HD Quality* - Best available quality
✅ *Priority support* - Direct admin access

*How to get premium:*
1. Contact @${ADMIN_CONTACT_USERNAME} to purchase an API key
2. Click "I Have an API Key" below to link it

Already have a key? Tap the button below! 👇`;
}

/**
 * Premium status message (for premium users)
 */
export function premiumStatusMessage(apiKey: ApiKeyInfo): string {
  const maskedKey = maskApiKey(apiKey.key);
  const expiryText = apiKey.expiresAt
    ? formatDate(apiKey.expiresAt)
    : 'Never';

  let downloadsText = '∞ Unlimited';
  if (apiKey.downloadsLimit) {
    downloadsText = `${apiKey.downloadsUsed || 0} / ${apiKey.downloadsLimit}`;
  }

  return `⭐ *Premium Status*

🔑 *API Key:* \`${maskedKey}\`
📅 *Expires:* ${expiryText}
📥 *Downloads:* ${downloadsText}

You have access to all premium features:
✅ Unlimited downloads
✅ No cooldown
✅ HD quality
✅ Priority support

Thank you for being a premium user! 💎`;
}

/**
 * API key link prompt
 */
export function apiKeyLinkPromptMessage(): string {
  return `🔑 *Link Your API Key*

Please send your API key to activate premium features.

Your API key should look like:
\`xtf_xxxxxxxxxxxxxxxxxxxx\`

Send it now or tap Cancel to go back.`;
}

/**
 * API key linked success
 */
export function apiKeyLinkedMessage(): string {
  return `✅ *API Key Linked Successfully!*

You now have access to premium features:
• Unlimited downloads
• No cooldown
• HD quality priority
• Priority support

Enjoy your premium experience! 🎉`;
}

/**
 * API key invalid message
 */
export function apiKeyInvalidMessage(): string {
  return `❌ *Invalid API Key*

The API key you provided is invalid or expired.

Please check your key and try again, or contact @${ADMIN_CONTACT_USERNAME} for assistance.`;
}

/**
 * API key unlinked message
 */
export function apiKeyUnlinkedMessage(): string {
  return `🔓 *API Key Unlinked*

Your API key has been unlinked from this account.
You're now on the free tier with ${FREE_DOWNLOAD_LIMIT} downloads per day.

You can link a new API key anytime from the Premium menu.`;
}

// ============================================================================
// Stats Messages
// ============================================================================

/**
 * User stats message
 */
export function statsMessage(
  stats: UserStats,
  isPremium: boolean,
  totalDownloads: number
): string {
  const tierBadge = isPremium ? '⭐ Premium' : '🆓 Free';
  const dailyLimit = isPremium ? '∞' : FREE_DOWNLOAD_LIMIT.toString();
  const remaining = isPremium ? '∞' : stats.remaining.toString();

  return `📊 *Your Statistics*

*Account:* ${tierBadge}

*Today:*
• Downloads: ${stats.dailyDownloads} / ${dailyLimit}
• Remaining: ${remaining}

*All Time:*
• Total downloads: ${totalDownloads}

${isPremium ? '💎 Enjoying unlimited downloads!' : '💡 Upgrade to premium for unlimited downloads!'}`;
}

/**
 * Detailed stats message with platform breakdown
 */
export function detailedStatsMessage(
  stats: UserStats,
  isPremium: boolean,
  platformStats: Record<PlatformId, number>
): string {
  let message = statsMessage(stats, isPremium, stats.totalDownloads);

  message += `\n\n*Downloads by Platform:*`;

  const sortedPlatforms = Object.entries(platformStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  for (const [platform, count] of sortedPlatforms) {
    const icon = PLATFORM_ICONS[platform as PlatformId] || '📥';
    const name = PLATFORM_NAMES[platform as PlatformId] || platform;
    message += `\n${icon} ${name}: ${count}`;
  }

  return message;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape special Markdown characters
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Truncate URL for display
 */
export function truncateUrl(url: string, maxLength: number = 50): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

/**
 * Mask API key for display
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format duration from seconds
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get platform display name
 */
export function getPlatformName(platform: PlatformId): string {
  return PLATFORM_NAMES[platform] || platform;
}

/**
 * Get platform icon
 */
export function getPlatformIcon(platform: PlatformId): string {
  return PLATFORM_ICONS[platform] || '🔗';
}

// Export platform maps for external use
export { PLATFORM_NAMES, PLATFORM_ICONS };
