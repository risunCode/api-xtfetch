/**
 * Core Module - Main Entry Point
 * Central export for all core domain logic.
 */

// Scrapers (includes PlatformId)
export * from './scrapers';

// Security
export * from './security';

// Config
export {
    platformMatches,
    platformDetect,
    platformIsUrl,
    platformGetRegex,
    platformGetAliases,
    PLATFORM_CONFIGS,
    platformGetDomainConfig,
    platformGetBaseUrl,
    platformGetReferer,
    platformGetOrigin,
    platformGetApiEndpoint,
    type PlatformId,
    type PlatformDomainConfig,
    getEnv,
    getEnvOptional,
    isProduction,
    isDevelopment,
    APP_NAME,
    APP_VERSION,
    APP_DESCRIPTION,
    CACHE_TTL,
    TIMEOUTS,
    RATE_LIMIT_WINDOWS,
    ALLOWED_SOCIAL_DOMAINS,
    ALLOWED_CDN_DOMAINS,
} from './config';

// Logger
export { logger } from '@/lib/services/helper/logger';
