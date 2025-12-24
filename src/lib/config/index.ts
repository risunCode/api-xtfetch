/**
 * Config Module - Barrel Export
 * Split from: lib/config.ts
 * 
 * This module re-exports all config functions from:
 * - platform.ts - Platform detection and config (platform*)
 * - service.ts - Service configuration (serviceConfig*)
 * - system.ts - System configuration (sysConfig*, systemConfig*)
 */

// ============================================================================
// PLATFORM EXPORTS
// ============================================================================

export {
    // Types
    type PlatformId,
    type PlatformDomainConfig,
    // Constants
    PLATFORM_CONFIGS,
    // Functions
    platformGetBaseUrl,
    platformGetReferer,
    platformGetOrigin,
    platformDetect,
    platformIsUrl,
    platformMatches,
    platformGetRegex,
    platformGetAliases,
    platformGetDomainConfig,
    platformGetApiEndpoint,
} from './platform';

// ============================================================================
// SERVICE CONFIG EXPORTS
// ============================================================================

export {
    // Types
    type ServiceConfig,
    type ServiceConfigDB,
    // Functions - Load/Save
    serviceConfigLoad,
    serviceConfigSaveGlobal,
    serviceConfigSavePlatform,
    // Functions - Getters
    serviceConfigGet,
    serviceConfigGetAsync,
    serviceConfigGetPlatform,
    serviceConfigIsPlatformEnabled,
    serviceConfigIsMaintenanceMode,
    serviceConfigGetMaintenanceType,
    serviceConfigGetMaintenanceMessage,
    serviceConfigIsApiKeyRequired,
    serviceConfigIsPlaygroundEnabled,
    serviceConfigGetPlaygroundRateLimit,
    serviceConfigGetGlobalRateLimit,
    serviceConfigGetGeminiRateLimit,
    serviceConfigGetGeminiRateWindow,
    serviceConfigGetPlatformDisabledMessage,
    serviceConfigGetAllPlatforms,
    // Functions - Setters
    serviceConfigSetPlatformEnabled,
    serviceConfigSetMaintenanceMode,
    serviceConfigSetGlobalRateLimit,
    serviceConfigSetPlaygroundEnabled,
    serviceConfigSetPlaygroundRateLimit,
    serviceConfigSetGeminiRateLimit,
    serviceConfigRecordRequest,
    serviceConfigUpdatePlatform,
    // Functions - Database
    serviceConfigLoadFromDB,
    serviceConfigGetFromDB,
    serviceConfigUpdateInDB,
    serviceConfigCreateInDB,
    serviceConfigDeleteFromDB,
} from './service';

// ============================================================================
// SYSTEM CONFIG EXPORTS
// ============================================================================

export {
    // Types
    type MaintenanceType,
    type PlatformStats,
    type PlatformConfig,
    type SystemConfigDB,
    type SystemConfig,
    // Constants
    SYSTEM_CONFIG_DEFAULTS,
    // Functions - Load
    sysConfigLoad,
    // Functions - Getters
    sysConfigGet,
    sysConfigCacheTtlConfig,
    sysConfigCacheTtlApikeys,
    sysConfigCacheTtlCookies,
    sysConfigCacheTtlUseragents,
    sysConfigCacheTtlPlaygroundUrl,
    sysConfigHttpTimeout,
    sysConfigHttpMaxRedirects,
    sysConfigScraperTimeout,
    sysConfigScraperMaxRetries,
    sysConfigScraperRetryDelay,
    sysConfigCookieCooldownMinutes,
    sysConfigCookieMaxUsesDefault,
    sysConfigRateLimitPublic,
    sysConfigRateLimitApiKey,
    sysConfigRateLimitAuth,
    sysConfigRateLimitAdmin,
    // Functions - Update/Reset
    sysConfigUpdate,
    sysConfigReset,
    // Functions - Key-Value
    systemConfigGet,
    systemConfigSet,
    systemConfigGetAll,
    systemConfigDelete,
    systemConfigClearCache,
} from './system';
