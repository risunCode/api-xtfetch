/**
 * Cookies Module - Barrel Export
 * 
 * Re-exports all cookie-related functionality from:
 * - parser.ts: Cookie parsing and validation
 * - pool.ts: Cookie pool management with rotation
 * - admin.ts: Admin cookie management with caching
 */

// Parser exports
export {
    cookieParse,
    cookieValidate,
    cookieIsLike,
    cookieGetFormat,
    type CookiePlatform,
    type ValidationResult,
} from './parser';

// Pool exports
export {
    cookiePoolGetRotating,
    cookiePoolMarkSuccess,
    cookiePoolMarkError,
    cookiePoolMarkCooldown,
    cookiePoolMarkExpired,
    cookiePoolMarkLoginRedirect,
    cookiePoolGetByPlatform,
    cookiePoolGetStats,
    cookiePoolAdd,
    cookiePoolUpdate,
    cookiePoolDelete,
    cookiePoolTestHealth,
    cookiePoolGetDecrypted,
    cookiePoolMigrateUnencrypted,
    type CookieStatus,
    type CookieTier,
    type PooledCookie,
    type CookiePoolStats,
} from './pool';

// Admin exports
export {
    adminCookieGet,
    adminCookieHas,
    adminCookieGetAll,
    adminCookieSet,
    adminCookieToggle,
    adminCookieDelete,
    adminCookieClearCache,
} from './admin';
