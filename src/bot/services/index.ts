/**
 * Bot Services Index
 * Re-exports all bot service functions
 */

// User Service
export {
  botUserCreate,
  botUserGet,
  botUserUpdate,
  botUserGetOrCreate,
  botUserLinkApiKey,
  botUserUnlinkApiKey,
  botUserIncrementDownloads,
  botUserResetDailyDownloads,
  botUserCheckDailyReset,
  botUserGetStats,
  botUserGetRemainingDownloads,
} from './userService';

export type {
  BotUser,
  BotUserCreateInput,
  BotUserUpdateInput,
} from './userService';

// Download Service
export {
  botDownloadCreate,
  botDownloadGetHistory,
  botDownloadUpdateStatus,
  botDownloadUpdateTitle,
  botDownloadGet,
  botDownloadGetUserStats,
  botDownloadGetRecent,
  botDownloadGetByPlatform,
  botDownloadCountSince,
} from './downloadService';

export type {
  BotDownload,
  BotDownloadCreateInput,
  DownloadStatus,
} from './downloadService';
