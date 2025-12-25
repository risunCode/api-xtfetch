/**
 * Bot Utils Index
 * Re-exports all bot utility functions
 */

export {
  // Message templates
  welcomeMessage,
  helpMessage,
  processingMessage,
  successMessage,
  successWithFormatsMessage,
  errorMessage,
  invalidUrlMessage,
  unsupportedPlatformMessage,
  rateLimitMessage,
  dailyLimitMessage,
  premiumInfoMessage,
  premiumStatusMessage,
  apiKeyLinkPromptMessage,
  apiKeyLinkedMessage,
  apiKeyInvalidMessage,
  apiKeyUnlinkedMessage,
  statsMessage,
  detailedStatsMessage,
  // Utility functions
  escapeMarkdown,
  truncateUrl,
  maskApiKey,
  formatDate,
  formatDuration,
  formatFileSize,
  getPlatformName,
  getPlatformIcon,
  // Constants
  PLATFORM_NAMES,
  PLATFORM_ICONS,
} from './messages';

export type {
  UserInfo,
  UserStats,
  MediaInfo,
  ApiKeyInfo,
} from './messages';
