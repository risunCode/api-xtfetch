/**
 * Core Config Module
 * Centralized configuration and constants.
 * 
 * This is the CANONICAL import path for all config functions.
 * Import from @/core/config, NOT from @/lib/config directly.
 */

// Platform Configuration
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
} from '@/lib/config/platform';

// Service Configuration
export {
    serviceConfigGet,
    serviceConfigGetAsync,
    serviceConfigLoad,
    serviceConfigLoadFromDB,
    serviceConfigUpdatePlatform,
    serviceConfigUpdateInDB,
    serviceConfigCreateInDB,
    serviceConfigSetPlaygroundEnabled,
    serviceConfigSetPlaygroundRateLimit,
    serviceConfigGetPlaygroundRateLimit,
    serviceConfigSetMaintenanceMode,
    serviceConfigSetGlobalRateLimit,
    serviceConfigSetGeminiRateLimit,
    serviceConfigGetGeminiRateLimit,
    serviceConfigGetGeminiRateWindow,
    type ServiceConfig,
    type ServiceConfigDB,
} from '@/lib/config/service';

// System Configuration
export {
    sysConfigScraperTimeout,
    sysConfigScraperMaxRetries,
    sysConfigScraperRetryDelay,
    sysConfigCacheTtlConfig,
    sysConfigCacheTtlApikeys,
    sysConfigCacheTtlCookies,
    sysConfigCacheTtlUseragents,
    type PlatformConfig,
    type PlatformStats,
    type MaintenanceType,
    type SystemConfigDB,
} from '@/lib/config/system';

// Scraper Configuration
export { SCRAPER_CONFIG } from './scrapers';

// Environment Helpers
export function getEnv(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) return defaultValue;
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

export function getEnvOptional(key: string): string | undefined {
    return process.env[key];
}

export function isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
}

// Application Constants
export const APP_NAME = 'XTFetch API';
export const APP_VERSION = '1.0.0';
export const APP_DESCRIPTION = 'Social Media Downloader API';

export const CACHE_TTL = {
    SHORT: 5 * 60 * 1000,
    MEDIUM: 30 * 60 * 1000,
    LONG: 24 * 60 * 60 * 1000,
};

export const TIMEOUTS = {
    SHORT: 5000,
    NORMAL: 10000,
    LONG: 30000,
};

export const RATE_LIMIT_WINDOWS = {
    SHORT: 60 * 1000,
    MEDIUM: 5 * 60 * 1000,
    LONG: 60 * 60 * 1000,
};

export const ALLOWED_SOCIAL_DOMAINS = [
    'facebook.com', 'fb.com', 'fb.watch', 'fbcdn.net',
    'instagram.com', 'cdninstagram.com', 'instagr.am',
    'twitter.com', 'x.com', 't.co', 'twimg.com',
    'tiktok.com', 'tiktokcdn.com', 'musical.ly',
    'weibo.com', 'weibo.cn', 'sinaimg.cn',
    'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com',
];

export const ALLOWED_CDN_DOMAINS = [
    'fbcdn.net', 'cdninstagram.com', 'scontent.cdninstagram.com',
    'pbs.twimg.com', 'video.twimg.com',
    'tiktokcdn.com', 'tiktokcdn-us.com',
    'sinaimg.cn', 'weibocdn.com',
];
