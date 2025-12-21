/**
 * Cookies Barrel Export
 */

// Parsing
export { parseCookie, validateCookie, isCookieLike, getCookieFormat, type CookiePlatform } from '@/lib/utils/cookie-parser';

// Security - sanitization
export { sanitizeCookie, isValidCookie } from '@/lib/utils/security';

// Pool rotation & management
export {
    getRotatingCookie,
    markCookieSuccess,
    markCookieError,
    markCookieCooldown,
    markCookieExpired,
    getCookiePoolStats,
    getCookiesByPlatform,
    addCookieToPool,
    updatePooledCookie,
    deleteCookieFromPool,
    testCookieHealth,
    getDecryptedCookie,
    migrateUnencryptedCookies,
    type CookiePoolStats,
    type PooledCookie,
    type CookieStatus,
} from '@/lib/utils/cookie-pool';

// Admin cookies (legacy single cookie)
export {
    getAdminCookie,
    hasAdminCookie,
    getAllAdminCookies,
    setAdminCookie,
    toggleAdminCookie,
    deleteAdminCookie,
    clearAdminCookieCache,
} from '@/lib/utils/admin-cookie';
