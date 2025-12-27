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

// Format utilities
export {
  sanitizeTitle,
  escapeMarkdownV1,
  escapeMarkdownV2,
} from './format';

// Media sending utilities
export {
  sendMedia,
  fetchWithRetry,
  buildSimpleCaption,
  escapeMarkdown as escapeMarkdownMedia,
  getPlatformName as getMediaPlatformName,
  needsDownloadFirst,
  findHdVideo,
  findSdVideo,
  deduplicateImages,
  MAX_TELEGRAM_FILESIZE,
  type SendMediaOptions,
  type SendMediaResult,
} from './media';

// Buffer management utilities
export {
  ManagedBuffer,
  fetchWithRetry as fetchBufferWithRetry,
  fetchWithCleanup,
  withManagedBuffer,
  getFilesizeFromHead,
  suggestGC,
  isWithinTelegramLimit,
  formatBytes,
  MAX_TELEGRAM_FILESIZE as TELEGRAM_MAX_FILESIZE,
  DEFAULT_TIMEOUT,
  DEFAULT_RETRIES,
  type FetchOptions,
} from './buffer';
