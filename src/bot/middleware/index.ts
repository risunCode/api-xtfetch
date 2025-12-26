/**
 * Bot Middleware Exports
 * 
 * Usage:
 * ```typescript
 * import { authMiddleware, rateLimitMiddleware, maintenanceMiddleware } from '@/bot/middleware';
 * 
 * bot.use(maintenanceMiddleware); // Check maintenance first
 * bot.use(authMiddleware);
 * bot.use(rateLimitMiddleware);
 * ```
 */

export { authMiddleware, botUserGetOrCreate, botUserIsBanned, botUserIsPremium } from './auth';
export { 
    rateLimitMiddleware, 
    botRateLimitRecordDownload,
    botRateLimitNeedsReset,
    botRateLimitResetDaily,
    botRateLimitGetCooldown,
    botRateLimitSetCooldown,
    botRateLimitIncrementDownloads,
} from './rateLimit';
export { 
    maintenanceMiddleware, 
    botIsInMaintenance, 
    botGetMaintenanceMessage,
    botIsGlobalMaintenance,
} from './maintenance';
