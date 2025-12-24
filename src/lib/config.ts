/**
 * Unified Configuration Module
 * Merged from: api-config.ts, service-config.ts, system-config.ts
 * 
 * This module provides:
 * - Platform domain configuration and detection (platform*)
 * - Service configuration with Supabase sync (serviceConfig*)
 * - System configuration with database-backed settings (sysConfig*)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Supported platform identifiers */
export type PlatformId = 'tiktok' | 'instagram' | 'facebook' | 'twitter' | 'weibo' | 'youtube';

/** Maintenance mode types */
export type MaintenanceType = 'off' | 'api' | 'full';

/** Platform domain configuration */
export interface PlatformDomainConfig {
    name: string;
    domain: string;
    aliases: string[];
    apiEndpoints?: Record<string, string>;
}

/** Platform statistics */
export interface PlatformStats {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    avgResponseTime: number;
}

/** Platform service configuration */
export interface PlatformConfig {
    id: PlatformId;
    name: string;
    enabled: boolean;
    method: string;
    rateLimit: number;
    cacheTime: number;
    disabledMessage: string;
    lastUpdated: string;
    stats: PlatformStats;
    // Database-synced fields (from service_config table)
    requireCookie?: boolean;
    requireAuth?: boolean;
    priority?: number;
    healthStatus?: string;
}


/** Service-level configuration */
export interface ServiceConfig {
    platforms: Record<PlatformId, PlatformConfig>;
    globalRateLimit: number;
    playgroundRateLimit: number;
    playgroundEnabled: boolean;
    geminiRateLimit: number;
    geminiRateWindow: number;
    maintenanceMode: boolean;
    maintenanceType: MaintenanceType;
    maintenanceMessage: string;
    apiKeyRequired: boolean;
    lastUpdated: string;
}

/** Service config database table interface */
export interface ServiceConfigDB {
    id: string;
    platform: string;
    enabled: boolean;
    rate_limit: number;
    require_cookie: boolean;
    require_auth: boolean;
    priority: number;
    last_check: string | null;
    health_status: string;
    created_at: string;
    updated_at: string;
}

/** System config database table interface */
export interface SystemConfigDB {
    key: string;
    value: unknown; // JSONB
    description: string | null;
    updated_at: string;
    updated_by: string | null;
}

/** System-level configuration */
export interface SystemConfig {
    cacheTtlConfig: number;
    cacheTtlApikeys: number;
    cacheTtlCookies: number;
    cacheTtlUseragents: number;
    cacheTtlPlaygroundUrl: number;
    httpTimeout: number;
    httpMaxRedirects: number;
    scraperTimeoutFacebook: number;
    scraperTimeoutInstagram: number;
    scraperTimeoutTwitter: number;
    scraperTimeoutTiktok: number;
    scraperTimeoutWeibo: number;
    scraperMaxRetries: number;
    scraperRetryDelay: number;
    cookieCooldownMinutes: number;
    cookieMaxUsesDefault: number;
    rateLimitPublic: number;
    rateLimitApiKey: number;
    rateLimitAuth: number;
    rateLimitAdmin: number;
    lastUpdated: string;
}

// ============================================================================
// CONSTANTS - PLATFORM DOMAIN CONFIGS
// ============================================================================

export const PLATFORM_CONFIGS: Record<PlatformId, PlatformDomainConfig> = {
    tiktok: {
        name: 'TikTok',
        domain: 'tiktok.com',
        aliases: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com', 'm.tiktok.com', 'www.tiktok.com'],
    },
    instagram: {
        name: 'Instagram',
        domain: 'instagram.com',
        aliases: ['instagram.com', 'instagr.am', 'ddinstagram.com', 'www.instagram.com', 'ig.me'],
    },
    facebook: {
        name: 'Facebook',
        domain: 'facebook.com',
        aliases: ['facebook.com', 'fb.com', 'fb.watch', 'fb.me', 'fb.gg', 'm.facebook.com', 'web.facebook.com', 'www.facebook.com', 'l.facebook.com'],
    },
    twitter: {
        name: 'Twitter/X',
        domain: 'x.com',
        aliases: ['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com', 'www.twitter.com', 't.co', 'fxtwitter.com', 'vxtwitter.com', 'fixupx.com'],
        apiEndpoints: { syndication: 'https://cdn.syndication.twimg.com/tweet-result' },
    },
    weibo: {
        name: 'Weibo',
        domain: 'weibo.com',
        aliases: ['weibo.com', 'weibo.cn', 'm.weibo.cn', 'video.weibo.com', 'www.weibo.com', 't.cn'],
        apiEndpoints: { mobile: 'https://m.weibo.cn/statuses/show' },
    },
    youtube: {
        name: 'YouTube',
        domain: 'youtube.com',
        aliases: ['youtube.com', 'youtu.be', 'm.youtube.com', 'www.youtube.com', 'music.youtube.com'],
    },
};


const PLATFORM_NAMES: Record<PlatformId, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    twitter: 'Twitter/X',
    tiktok: 'TikTok',
    weibo: 'Weibo',
    youtube: 'YouTube'
};

// ============================================================================
// CONSTANTS - DEFAULT CONFIGS
// ============================================================================

const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
    platforms: {
        facebook: { id: 'facebook', name: 'Facebook', enabled: true, method: 'HTML Scraping', rateLimit: 10, cacheTime: 300, disabledMessage: 'Facebook service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        instagram: { id: 'instagram', name: 'Instagram', enabled: true, method: 'Embed API', rateLimit: 15, cacheTime: 300, disabledMessage: 'Instagram service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        twitter: { id: 'twitter', name: 'Twitter/X', enabled: true, method: 'Syndication API', rateLimit: 20, cacheTime: 300, disabledMessage: 'Twitter/X service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        tiktok: { id: 'tiktok', name: 'TikTok', enabled: true, method: 'TikWM API', rateLimit: 15, cacheTime: 300, disabledMessage: 'TikTok service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        weibo: { id: 'weibo', name: 'Weibo', enabled: true, method: 'Mobile API', rateLimit: 10, cacheTime: 300, disabledMessage: 'Weibo service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        youtube: { id: 'youtube', name: 'YouTube', enabled: true, method: 'External API', rateLimit: 10, cacheTime: 3600, disabledMessage: 'YouTube service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
    },
    globalRateLimit: 15,
    playgroundRateLimit: 5,
    playgroundEnabled: true,
    geminiRateLimit: 60,
    geminiRateWindow: 1,
    maintenanceMode: false,
    maintenanceType: 'off',
    maintenanceMessage: '🔧 XTFetch is under maintenance. Please try again later.',
    apiKeyRequired: false,
    lastUpdated: new Date().toISOString()
};

const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
    cacheTtlConfig: 30000,
    cacheTtlApikeys: 10000,
    cacheTtlCookies: 300000,
    cacheTtlUseragents: 300000,
    cacheTtlPlaygroundUrl: 120000,
    httpTimeout: 15000,
    httpMaxRedirects: 10,
    scraperTimeoutFacebook: 10000,
    scraperTimeoutInstagram: 15000,
    scraperTimeoutTwitter: 15000,
    scraperTimeoutTiktok: 10000,
    scraperTimeoutWeibo: 15000,
    scraperMaxRetries: 2,
    scraperRetryDelay: 1000,
    cookieCooldownMinutes: 30,
    cookieMaxUsesDefault: 100,
    rateLimitPublic: 15,
    rateLimitApiKey: 100,
    rateLimitAuth: 10,
    rateLimitAdmin: 60,
    lastUpdated: new Date().toISOString(),
};

export { DEFAULT_SYSTEM_CONFIG as SYSTEM_CONFIG_DEFAULTS };


// ============================================================================
// STATE - Module-level state variables
// ============================================================================

// Service config state
let serviceConfig: ServiceConfig = JSON.parse(JSON.stringify(DEFAULT_SERVICE_CONFIG));
let serviceConfigLastFetch = 0;

// System config state
let systemConfig: SystemConfig = { ...DEFAULT_SYSTEM_CONFIG };
let systemConfigLastFetch = 0;
let systemConfigIsLoading = false;
const BOOTSTRAP_CACHE_TTL = 30000;

// Supabase client for system config
let sysConfigSupabase: SupabaseClient | null = null;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

// ALWAYS use service role for config reads to bypass RLS
const getWriteClient = () => supabaseAdmin || supabase;
const getReadClient = () => supabaseAdmin || supabase; // Changed: use admin for reads too!

function getSysConfigSupabase(): SupabaseClient | null {
    if (sysConfigSupabase) return sysConfigSupabase;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    sysConfigSupabase = createClient(url, key);
    return sysConfigSupabase;
}

// ============================================================================
// PLATFORM FUNCTIONS (from api-config.ts)
// ============================================================================

/** Get base URL for a platform */
export function platformGetBaseUrl(platform: PlatformId): string {
    const domain = PLATFORM_CONFIGS[platform]?.domain;
    return domain ? `https://www.${domain}` : '';
}

/** Get referer header value for a platform */
export function platformGetReferer(platform: PlatformId): string {
    const domain = PLATFORM_CONFIGS[platform]?.domain;
    return domain ? `https://www.${domain}/` : '';
}

/** Get origin header value for a platform */
export function platformGetOrigin(platform: PlatformId): string {
    return platformGetBaseUrl(platform);
}

/** Detect platform from URL */
export function platformDetect(url: string): PlatformId | null {
    try {
        const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        for (const [id, config] of Object.entries(PLATFORM_CONFIGS)) {
            if (config.aliases.some(alias => hostname === alias.replace(/^www\./, '') || hostname.endsWith('.' + alias.replace(/^www\./, '')))) {
                return id as PlatformId;
            }
        }
    } catch { /* invalid URL */ }
    return null;
}

/** Check if URL belongs to a specific platform */
export function platformIsUrl(url: string, platform: PlatformId): boolean {
    return platformDetect(url) === platform;
}

/** Check if URL matches a platform (loose match) */
export function platformMatches(url: string, platform: PlatformId): boolean {
    const aliases = PLATFORM_CONFIGS[platform]?.aliases || [];
    const lower = url.toLowerCase();
    return aliases.some(alias => lower.includes(alias));
}

/** Get regex pattern for platform detection */
export function platformGetRegex(platform: PlatformId): RegExp {
    const aliases = PLATFORM_CONFIGS[platform]?.aliases || [];
    const escaped = aliases.map(a => a.replace(/\./g, '\\.'));
    return new RegExp(`(${escaped.join('|')})`, 'i');
}

/** Get all domain aliases for a platform */
export function platformGetAliases(platform: PlatformId): string[] {
    return PLATFORM_CONFIGS[platform]?.aliases || [];
}

/** Get full domain config for a platform */
export function platformGetDomainConfig(platform: PlatformId): PlatformDomainConfig {
    return PLATFORM_CONFIGS[platform];
}

/** Get API endpoint for a platform */
export function platformGetApiEndpoint(platform: PlatformId, endpoint: string): string {
    return PLATFORM_CONFIGS[platform]?.apiEndpoints?.[endpoint] || '';
}


// ============================================================================
// SERVICE CONFIG FUNCTIONS (from service-config.ts)
// ============================================================================

/** Load service configuration from database */
export async function serviceConfigLoad(forceRefresh = false): Promise<boolean> {
    const cacheTTL = systemConfig.cacheTtlConfig || BOOTSTRAP_CACHE_TTL;
    if (!forceRefresh && Date.now() - serviceConfigLastFetch < cacheTTL) return true;
    
    const db = getReadClient();
    if (!db) {
        console.error('[serviceConfigLoad] No database client available!');
        return false;
    }
    
    try {
        // Load global settings from system_config
        const { data: globalData, error: globalError } = await db
            .from('system_config')
            .select('value')
            .eq('key', 'service_global')
            .single();
        
        if (globalError) {
            console.error('[serviceConfigLoad] Error loading service_global:', globalError);
        }
        
        if (globalData?.value) {
            const global = globalData.value as Record<string, unknown>;
            // Only log in development
            if (process.env.NODE_ENV !== 'production') {
                console.log('[serviceConfigLoad] Loaded from DB:', { 
                    maintenanceMode: global.maintenanceMode, 
                    maintenanceType: global.maintenanceType 
                });
            }
            if (global.maintenanceMode !== undefined) serviceConfig.maintenanceMode = global.maintenanceMode as boolean;
            if (global.maintenanceType !== undefined) serviceConfig.maintenanceType = global.maintenanceType as MaintenanceType;
            if (global.maintenanceMessage !== undefined) serviceConfig.maintenanceMessage = global.maintenanceMessage as string;
            if (global.globalRateLimit !== undefined) serviceConfig.globalRateLimit = global.globalRateLimit as number;
            if (global.playgroundEnabled !== undefined) serviceConfig.playgroundEnabled = global.playgroundEnabled as boolean;
            if (global.playgroundRateLimit !== undefined) serviceConfig.playgroundRateLimit = global.playgroundRateLimit as number;
            if (global.geminiRateLimit !== undefined) serviceConfig.geminiRateLimit = global.geminiRateLimit as number;
            if (global.geminiRateWindow !== undefined) serviceConfig.geminiRateWindow = global.geminiRateWindow as number;
            if (global.apiKeyRequired !== undefined) serviceConfig.apiKeyRequired = global.apiKeyRequired as boolean;
        } else {
            console.warn('[serviceConfigLoad] No service_global found in DB, using defaults');
        }
        
        // Load platform configs from service_config table
        const { data: platformData } = await db
            .from('service_config')
            .select('*');
        
        if (platformData && platformData.length > 0) {
            for (const dbConfig of platformData) {
                const platformId = dbConfig.platform as PlatformId;
                if (serviceConfig.platforms[platformId]) {
                    serviceConfig.platforms[platformId].enabled = dbConfig.enabled;
                    serviceConfig.platforms[platformId].rateLimit = dbConfig.rate_limit;
                    serviceConfig.platforms[platformId].requireCookie = dbConfig.require_cookie;
                    serviceConfig.platforms[platformId].requireAuth = dbConfig.require_auth;
                    serviceConfig.platforms[platformId].priority = dbConfig.priority;
                    serviceConfig.platforms[platformId].healthStatus = dbConfig.health_status;
                }
            }
        }
    } catch (err) {
        console.error('[serviceConfigLoad] Exception:', err);
        return false;
    }
    
    serviceConfigLastFetch = Date.now();
    serviceConfig.lastUpdated = new Date().toISOString();
    return true;
}

async function serviceConfigEnsureFresh() {
    const cacheTTL = systemConfig.cacheTtlConfig || BOOTSTRAP_CACHE_TTL;
    if (Date.now() - serviceConfigLastFetch > cacheTTL) await serviceConfigLoad();
}

/** Save global service configuration to system_config table */
export async function serviceConfigSaveGlobal(): Promise<boolean> {
    const db = getWriteClient();
    if (!db) {
        // Fallback to in-memory only if no DB
        serviceConfig.lastUpdated = new Date().toISOString();
        return true;
    }
    
    try {
        // Save global settings to system_config table
        const globalSettings = {
            maintenanceMode: serviceConfig.maintenanceMode,
            maintenanceType: serviceConfig.maintenanceType,
            maintenanceMessage: serviceConfig.maintenanceMessage,
            globalRateLimit: serviceConfig.globalRateLimit,
            playgroundEnabled: serviceConfig.playgroundEnabled,
            playgroundRateLimit: serviceConfig.playgroundRateLimit,
            geminiRateLimit: serviceConfig.geminiRateLimit,
            geminiRateWindow: serviceConfig.geminiRateWindow,
            apiKeyRequired: serviceConfig.apiKeyRequired,
            lastUpdated: new Date().toISOString()
        };
        
        // Upsert to system_config
        const { error } = await db
            .from('system_config')
            .upsert({
                key: 'service_global',
                value: globalSettings,
                description: 'Global service configuration',
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });
        
        if (error) {
            console.error('Failed to save global config:', error);
            return false;
        }
        
        serviceConfig.lastUpdated = globalSettings.lastUpdated;
        return true;
    } catch (err) {
        console.error('Error saving global config:', err);
        return false;
    }
}

/** Save platform-specific configuration to service_config table */
export async function serviceConfigSavePlatform(platformId: PlatformId): Promise<boolean> {
    const platform = serviceConfig.platforms[platformId];
    if (!platform) return false;
    
    platform.lastUpdated = new Date().toISOString();
    serviceConfig.lastUpdated = new Date().toISOString();
    
    // Persist to database (no maintenance column - global maintenance is in system_config)
    const success = await serviceConfigUpdateInDB(platformId, {
        enabled: platform.enabled,
        rate_limit: platform.rateLimit,
        require_cookie: platform.requireCookie || false,
        require_auth: platform.requireAuth || false,
        priority: platform.priority || 5,
        health_status: platform.healthStatus || 'unknown'
    });
    
    return success;
}


// Service Config Getters
/** Get full service configuration (sync) - Note: May return stale data, use serviceConfigGetAsync for fresh data */
export function serviceConfigGet(): ServiceConfig { return { ...serviceConfig }; }

/** Get full service configuration (async, ensures fresh data with TTL check) */
export async function serviceConfigGetAsync(): Promise<ServiceConfig> {
    const cacheTTL = systemConfig.cacheTtlConfig || BOOTSTRAP_CACHE_TTL;
    const now = Date.now();
    
    // Check if cache is stale
    if (now - serviceConfigLastFetch > cacheTTL) {
        await serviceConfigLoad();
    }
    
    return { ...serviceConfig };
}

/** Get platform-specific configuration */
export function serviceConfigGetPlatform(platformId: PlatformId): PlatformConfig | null { return serviceConfig.platforms[platformId] || null; }

/** Check if a platform is enabled */
export function serviceConfigIsPlatformEnabled(platformId: PlatformId): boolean { return serviceConfig.platforms[platformId]?.enabled ?? false; }

/** Check if maintenance mode is active */
export function serviceConfigIsMaintenanceMode(): boolean { return serviceConfig.maintenanceMode; }

/** Get maintenance type */
export function serviceConfigGetMaintenanceType(): MaintenanceType { return serviceConfig.maintenanceType; }

/** Get maintenance message */
export function serviceConfigGetMaintenanceMessage(): string { return serviceConfig.maintenanceMessage; }

/** Check if API key is required */
export function serviceConfigIsApiKeyRequired(): boolean { return serviceConfig.apiKeyRequired; }

/** Check if playground is enabled */
export function serviceConfigIsPlaygroundEnabled(): boolean { return serviceConfig.playgroundEnabled; }

/** Get playground rate limit */
export function serviceConfigGetPlaygroundRateLimit(): number { return serviceConfig.playgroundRateLimit; }

/** Get global rate limit */
export function serviceConfigGetGlobalRateLimit(): number { return serviceConfig.globalRateLimit; }

/** Get Gemini rate limit */
export function serviceConfigGetGeminiRateLimit(): number { return serviceConfig.geminiRateLimit; }

/** Get Gemini rate window (in minutes) */
export function serviceConfigGetGeminiRateWindow(): number { return serviceConfig.geminiRateWindow; }

/** Get disabled message for a platform */
export function serviceConfigGetPlatformDisabledMessage(platformId: PlatformId): string { return serviceConfig.platforms[platformId]?.disabledMessage || `${platformId} service is currently disabled.`; }

/** Get all platform configurations */
export function serviceConfigGetAllPlatforms(): PlatformConfig[] { return Object.values(serviceConfig.platforms); }


// Service Config Setters
/** Enable or disable a platform */
export async function serviceConfigSetPlatformEnabled(platformId: PlatformId, enabled: boolean): Promise<boolean> {
    if (!serviceConfig.platforms[platformId]) return false;
    serviceConfig.platforms[platformId].enabled = enabled;
    serviceConfig.platforms[platformId].lastUpdated = new Date().toISOString();
    serviceConfig.lastUpdated = new Date().toISOString();
    return await serviceConfigSavePlatform(platformId);
}

/** Set maintenance mode */
export async function serviceConfigSetMaintenanceMode(enabled: boolean, type?: MaintenanceType, message?: string): Promise<boolean> {
    serviceConfig.maintenanceMode = enabled;
    serviceConfig.maintenanceType = type ?? (enabled ? 'full' : 'off');
    if (message !== undefined) serviceConfig.maintenanceMessage = message;
    serviceConfig.lastUpdated = new Date().toISOString();
    return await serviceConfigSaveGlobal();
}

/** Set global rate limit */
export async function serviceConfigSetGlobalRateLimit(limit: number): Promise<boolean> {
    serviceConfig.globalRateLimit = Math.max(1, Math.min(1000, limit));
    serviceConfig.lastUpdated = new Date().toISOString();
    return await serviceConfigSaveGlobal();
}

/** Enable or disable playground */
export async function serviceConfigSetPlaygroundEnabled(enabled: boolean): Promise<boolean> {
    serviceConfig.playgroundEnabled = enabled;
    serviceConfig.lastUpdated = new Date().toISOString();
    return await serviceConfigSaveGlobal();
}

/** Set playground rate limit */
export async function serviceConfigSetPlaygroundRateLimit(limit: number): Promise<boolean> {
    serviceConfig.playgroundRateLimit = Math.max(1, Math.min(100, limit));
    serviceConfig.lastUpdated = new Date().toISOString();
    return await serviceConfigSaveGlobal();
}

/** Set Gemini rate limit */
export async function serviceConfigSetGeminiRateLimit(limit: number, window?: number): Promise<boolean> {
    serviceConfig.geminiRateLimit = Math.max(1, Math.min(1000, limit));
    if (window !== undefined) serviceConfig.geminiRateWindow = Math.max(1, Math.min(60, window));
    serviceConfig.lastUpdated = new Date().toISOString();
    return await serviceConfigSaveGlobal();
}

/** Record a request for statistics */
export function serviceConfigRecordRequest(platformId: PlatformId, success: boolean, responseTime: number): void {
    const platform = serviceConfig.platforms[platformId];
    if (!platform) return;
    platform.stats.totalRequests++;
    if (success) platform.stats.successCount++; else platform.stats.errorCount++;
    const total = platform.stats.totalRequests;
    platform.stats.avgResponseTime = ((platform.stats.avgResponseTime * (total - 1)) + responseTime) / total;
    if (platform.stats.totalRequests % 100 === 0) serviceConfigSavePlatform(platformId).catch(() => {});
}

/** Update platform configuration */
export async function serviceConfigUpdatePlatform(platformId: PlatformId, updates: Partial<PlatformConfig>): Promise<boolean> {
    if (!serviceConfig.platforms[platformId]) return false;
    const platform = serviceConfig.platforms[platformId];
    if (updates.enabled !== undefined) platform.enabled = updates.enabled;
    if (updates.rateLimit !== undefined) platform.rateLimit = updates.rateLimit;
    if (updates.cacheTime !== undefined) platform.cacheTime = updates.cacheTime;
    if (updates.disabledMessage !== undefined) platform.disabledMessage = updates.disabledMessage;
    platform.lastUpdated = new Date().toISOString();
    serviceConfig.lastUpdated = new Date().toISOString();
    return await serviceConfigSavePlatform(platformId);
}


// ============================================================================
// SYSTEM CONFIG FUNCTIONS (from system-config.ts)
// ============================================================================

/** Load system configuration from database */
export async function sysConfigLoad(): Promise<boolean> {
    const cacheTtl = systemConfig.cacheTtlConfig || BOOTSTRAP_CACHE_TTL;
    if (Date.now() - systemConfigLastFetch < cacheTtl) return true;
    if (systemConfigIsLoading) return true;
    systemConfigIsLoading = true;
    
    try {
        const db = getSysConfigSupabase();
        if (!db) { systemConfigIsLoading = false; return false; }
        
        const { data, error } = await db.from('system_config').select('*').eq('id', 'default').single();
        if (error || !data) { systemConfigIsLoading = false; return false; }
        
        systemConfig = {
            cacheTtlConfig: data.cache_ttl_config ?? DEFAULT_SYSTEM_CONFIG.cacheTtlConfig,
            cacheTtlApikeys: data.cache_ttl_apikeys ?? DEFAULT_SYSTEM_CONFIG.cacheTtlApikeys,
            cacheTtlCookies: data.cache_ttl_cookies ?? DEFAULT_SYSTEM_CONFIG.cacheTtlCookies,
            cacheTtlUseragents: data.cache_ttl_useragents ?? DEFAULT_SYSTEM_CONFIG.cacheTtlUseragents,
            cacheTtlPlaygroundUrl: data.cache_ttl_playground_url ?? DEFAULT_SYSTEM_CONFIG.cacheTtlPlaygroundUrl,
            httpTimeout: data.http_timeout ?? DEFAULT_SYSTEM_CONFIG.httpTimeout,
            httpMaxRedirects: data.http_max_redirects ?? DEFAULT_SYSTEM_CONFIG.httpMaxRedirects,
            scraperTimeoutFacebook: data.scraper_timeout_facebook ?? DEFAULT_SYSTEM_CONFIG.scraperTimeoutFacebook,
            scraperTimeoutInstagram: data.scraper_timeout_instagram ?? DEFAULT_SYSTEM_CONFIG.scraperTimeoutInstagram,
            scraperTimeoutTwitter: data.scraper_timeout_twitter ?? DEFAULT_SYSTEM_CONFIG.scraperTimeoutTwitter,
            scraperTimeoutTiktok: data.scraper_timeout_tiktok ?? DEFAULT_SYSTEM_CONFIG.scraperTimeoutTiktok,
            scraperTimeoutWeibo: data.scraper_timeout_weibo ?? DEFAULT_SYSTEM_CONFIG.scraperTimeoutWeibo,
            scraperMaxRetries: data.scraper_max_retries ?? DEFAULT_SYSTEM_CONFIG.scraperMaxRetries,
            scraperRetryDelay: data.scraper_retry_delay ?? DEFAULT_SYSTEM_CONFIG.scraperRetryDelay,
            cookieCooldownMinutes: data.cookie_cooldown_minutes ?? DEFAULT_SYSTEM_CONFIG.cookieCooldownMinutes,
            cookieMaxUsesDefault: data.cookie_max_uses_default ?? DEFAULT_SYSTEM_CONFIG.cookieMaxUsesDefault,
            rateLimitPublic: data.rate_limit_public ?? DEFAULT_SYSTEM_CONFIG.rateLimitPublic,
            rateLimitApiKey: data.rate_limit_api_key ?? DEFAULT_SYSTEM_CONFIG.rateLimitApiKey,
            rateLimitAuth: data.rate_limit_auth ?? DEFAULT_SYSTEM_CONFIG.rateLimitAuth,
            rateLimitAdmin: data.rate_limit_admin ?? DEFAULT_SYSTEM_CONFIG.rateLimitAdmin,
            lastUpdated: data.updated_at || new Date().toISOString(),
        };
        
        systemConfigLastFetch = Date.now();
        systemConfigIsLoading = false;
        return true;
    } catch {
        systemConfigIsLoading = false;
        return false;
    }
}

// System Config Getters
/** Get full system configuration */
export function sysConfigGet(): SystemConfig { return systemConfig; }

/** Get config cache TTL */
export function sysConfigCacheTtlConfig(): number { return systemConfig.cacheTtlConfig; }

/** Get API keys cache TTL */
export function sysConfigCacheTtlApikeys(): number { return systemConfig.cacheTtlApikeys; }

/** Get cookies cache TTL */
export function sysConfigCacheTtlCookies(): number { return systemConfig.cacheTtlCookies; }

/** Get user agents cache TTL */
export function sysConfigCacheTtlUseragents(): number { return systemConfig.cacheTtlUseragents; }

/** Get playground URL cache TTL */
export function sysConfigCacheTtlPlaygroundUrl(): number { return systemConfig.cacheTtlPlaygroundUrl; }

/** Get HTTP timeout */
export function sysConfigHttpTimeout(): number { return systemConfig.httpTimeout; }

/** Get HTTP max redirects */
export function sysConfigHttpMaxRedirects(): number { return systemConfig.httpMaxRedirects; }


/** Get scraper timeout for a specific platform */
export function sysConfigScraperTimeout(platform: string): number {
    switch (platform) {
        case 'facebook': return systemConfig.scraperTimeoutFacebook;
        case 'instagram': return systemConfig.scraperTimeoutInstagram;
        case 'twitter': return systemConfig.scraperTimeoutTwitter;
        case 'tiktok': return systemConfig.scraperTimeoutTiktok;
        case 'weibo': return systemConfig.scraperTimeoutWeibo;
        default: return systemConfig.httpTimeout;
    }
}

/** Get scraper max retries */
export function sysConfigScraperMaxRetries(): number { return systemConfig.scraperMaxRetries; }

/** Get scraper retry delay */
export function sysConfigScraperRetryDelay(): number { return systemConfig.scraperRetryDelay; }

/** Get cookie cooldown minutes */
export function sysConfigCookieCooldownMinutes(): number { return systemConfig.cookieCooldownMinutes; }

/** Get cookie max uses default */
export function sysConfigCookieMaxUsesDefault(): number { return systemConfig.cookieMaxUsesDefault; }

/** Get public rate limit */
export function sysConfigRateLimitPublic(): number { return systemConfig.rateLimitPublic; }

/** Get API key rate limit */
export function sysConfigRateLimitApiKey(): number { return systemConfig.rateLimitApiKey; }

/** Get auth rate limit */
export function sysConfigRateLimitAuth(): number { return systemConfig.rateLimitAuth; }

/** Get admin rate limit */
export function sysConfigRateLimitAdmin(): number { return systemConfig.rateLimitAdmin; }

/** Update system configuration */
export async function sysConfigUpdate(updates: Partial<Record<string, number>>): Promise<boolean> {
    const db = getSysConfigSupabase();
    if (!db) return false;
    
    const dbUpdates: Record<string, number> = {};
    const keyMap: Record<string, string> = {
        cacheTtlConfig: 'cache_ttl_config', cacheTtlApikeys: 'cache_ttl_apikeys',
        cacheTtlCookies: 'cache_ttl_cookies', cacheTtlUseragents: 'cache_ttl_useragents',
        cacheTtlPlaygroundUrl: 'cache_ttl_playground_url', httpTimeout: 'http_timeout',
        httpMaxRedirects: 'http_max_redirects', scraperTimeoutFacebook: 'scraper_timeout_facebook',
        scraperTimeoutInstagram: 'scraper_timeout_instagram', scraperTimeoutTwitter: 'scraper_timeout_twitter',
        scraperTimeoutTiktok: 'scraper_timeout_tiktok', scraperTimeoutWeibo: 'scraper_timeout_weibo',
        scraperMaxRetries: 'scraper_max_retries', scraperRetryDelay: 'scraper_retry_delay',
        cookieCooldownMinutes: 'cookie_cooldown_minutes', cookieMaxUsesDefault: 'cookie_max_uses_default',
        rateLimitPublic: 'rate_limit_public', rateLimitApiKey: 'rate_limit_api_key',
        rateLimitAuth: 'rate_limit_auth', rateLimitAdmin: 'rate_limit_admin',
    };
    
    for (const [key, value] of Object.entries(updates)) {
        const dbKey = keyMap[key];
        if (dbKey && typeof value === 'number') dbUpdates[dbKey] = value;
    }
    
    if (Object.keys(dbUpdates).length === 0) return false;
    
    const { error } = await db.from('system_config').update(dbUpdates).eq('id', 'default');
    if (error) return false;
    
    systemConfigLastFetch = 0;
    await sysConfigLoad();
    return true;
}


/** Reset system configuration to defaults */
export async function sysConfigReset(): Promise<boolean> {
    const db = getSysConfigSupabase();
    if (!db) return false;
    
    const { error } = await db.from('system_config').update({
        cache_ttl_config: DEFAULT_SYSTEM_CONFIG.cacheTtlConfig,
        cache_ttl_apikeys: DEFAULT_SYSTEM_CONFIG.cacheTtlApikeys,
        cache_ttl_cookies: DEFAULT_SYSTEM_CONFIG.cacheTtlCookies,
        cache_ttl_useragents: DEFAULT_SYSTEM_CONFIG.cacheTtlUseragents,
        cache_ttl_playground_url: DEFAULT_SYSTEM_CONFIG.cacheTtlPlaygroundUrl,
        http_timeout: DEFAULT_SYSTEM_CONFIG.httpTimeout,
        http_max_redirects: DEFAULT_SYSTEM_CONFIG.httpMaxRedirects,
        scraper_timeout_facebook: DEFAULT_SYSTEM_CONFIG.scraperTimeoutFacebook,
        scraper_timeout_instagram: DEFAULT_SYSTEM_CONFIG.scraperTimeoutInstagram,
        scraper_timeout_twitter: DEFAULT_SYSTEM_CONFIG.scraperTimeoutTwitter,
        scraper_timeout_tiktok: DEFAULT_SYSTEM_CONFIG.scraperTimeoutTiktok,
        scraper_timeout_weibo: DEFAULT_SYSTEM_CONFIG.scraperTimeoutWeibo,
        scraper_max_retries: DEFAULT_SYSTEM_CONFIG.scraperMaxRetries,
        scraper_retry_delay: DEFAULT_SYSTEM_CONFIG.scraperRetryDelay,
        cookie_cooldown_minutes: DEFAULT_SYSTEM_CONFIG.cookieCooldownMinutes,
        cookie_max_uses_default: DEFAULT_SYSTEM_CONFIG.cookieMaxUsesDefault,
        rate_limit_public: DEFAULT_SYSTEM_CONFIG.rateLimitPublic,
        rate_limit_api_key: DEFAULT_SYSTEM_CONFIG.rateLimitApiKey,
        rate_limit_auth: DEFAULT_SYSTEM_CONFIG.rateLimitAuth,
        rate_limit_admin: DEFAULT_SYSTEM_CONFIG.rateLimitAdmin,
    }).eq('id', 'default');
    
    if (error) return false;
    systemConfig = { ...DEFAULT_SYSTEM_CONFIG };
    systemConfigLastFetch = Date.now();
    return true;
}

// ============================================================================
// SYSTEM CONFIG KEY-VALUE FUNCTIONS (New - for system_config JSONB table)
// ============================================================================

/** System config key-value cache */
const systemConfigKVCache = new Map<string, { value: unknown; expires: number }>();
const SYSTEM_CONFIG_KV_CACHE_TTL = 30000; // 30 seconds

/**
 * Get a single system config value by key (from JSONB system_config table)
 */
export async function systemConfigGet<T = unknown>(key: string): Promise<T | null> {
    // Check cache first
    const cached = systemConfigKVCache.get(key);
    if (cached && cached.expires > Date.now()) {
        return cached.value as T;
    }
    
    const db = getSysConfigSupabase();
    if (!db) return null;
    
    try {
        const { data, error } = await db
            .from('system_config')
            .select('value')
            .eq('key', key)
            .single();
        
        if (error || !data) return null;
        
        // Cache the result
        systemConfigKVCache.set(key, {
            value: data.value,
            expires: Date.now() + SYSTEM_CONFIG_KV_CACHE_TTL
        });
        
        return data.value as T;
    } catch {
        return null;
    }
}

/**
 * Set a system config value by key (to JSONB system_config table)
 */
export async function systemConfigSet(
    key: string, 
    value: unknown, 
    description?: string
): Promise<boolean> {
    const db = getSysConfigSupabase();
    if (!db) return false;
    
    try {
        const { error } = await db
            .from('system_config')
            .upsert({
                key,
                value,
                description: description || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });
        
        if (error) return false;
        
        // Update cache
        systemConfigKVCache.set(key, {
            value,
            expires: Date.now() + SYSTEM_CONFIG_KV_CACHE_TTL
        });
        
        return true;
    } catch {
        return false;
    }
}

/**
 * Get all system config key-value pairs (from JSONB system_config table)
 */
export async function systemConfigGetAll(): Promise<SystemConfigDB[]> {
    const db = getSysConfigSupabase();
    if (!db) return [];
    
    try {
        const { data, error } = await db
            .from('system_config')
            .select('*')
            .order('key');
        
        if (error || !data) return [];
        
        return data as SystemConfigDB[];
    } catch {
        return [];
    }
}

/**
 * Delete a system config key (from JSONB system_config table)
 */
export async function systemConfigDelete(key: string): Promise<boolean> {
    const db = getSysConfigSupabase();
    if (!db) return false;
    
    try {
        const { error } = await db
            .from('system_config')
            .delete()
            .eq('key', key);
        
        if (error) return false;
        
        // Remove from cache
        systemConfigKVCache.delete(key);
        
        return true;
    } catch {
        return false;
    }
}

/**
 * Clear system config key-value cache
 */
export function systemConfigClearCache(): void {
    systemConfigKVCache.clear();
}

// ============================================================================
// SERVICE CONFIG DATABASE FUNCTIONS (New - for service_config table)
// ============================================================================

/** Service config database cache */
let serviceConfigDBCache: ServiceConfigDB[] = [];
let serviceConfigDBLastFetch = 0;
const SERVICE_CONFIG_DB_CACHE_TTL = 30000; // 30 seconds

/**
 * Load service configuration from database (service_config table)
 */
export async function serviceConfigLoadFromDB(): Promise<ServiceConfigDB[]> {
    const cacheTTL = SERVICE_CONFIG_DB_CACHE_TTL;
    if (Date.now() - serviceConfigDBLastFetch < cacheTTL && serviceConfigDBCache.length > 0) {
        return serviceConfigDBCache;
    }
    
    const db = getReadClient();
    if (!db) return [];
    
    try {
        const { data, error } = await db
            .from('service_config')
            .select('*')
            .order('platform');
        
        if (error || !data) return [];
        
        serviceConfigDBCache = data as ServiceConfigDB[];
        serviceConfigDBLastFetch = Date.now();
        
        return serviceConfigDBCache;
    } catch {
        return [];
    }
}

/**
 * Get service config for a specific platform from database
 */
export async function serviceConfigGetFromDB(platform: string): Promise<ServiceConfigDB | null> {
    const configs = await serviceConfigLoadFromDB();
    return configs.find(c => c.platform === platform) || null;
}

/**
 * Update service config for a platform in database
 */
export async function serviceConfigUpdateInDB(
    platform: string,
    updates: Partial<Omit<ServiceConfigDB, 'id' | 'platform' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
    const db = getWriteClient();
    if (!db) return false;
    
    try {
        const { error } = await db
            .from('service_config')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('platform', platform);
        
        if (error) return false;
        
        // Invalidate cache
        serviceConfigDBLastFetch = 0;
        
        return true;
    } catch {
        return false;
    }
}

/**
 * Create service config for a new platform in database
 */
export async function serviceConfigCreateInDB(
    platform: string,
    config?: Partial<Omit<ServiceConfigDB, 'id' | 'platform' | 'created_at' | 'updated_at'>>
): Promise<ServiceConfigDB | null> {
    const db = getWriteClient();
    if (!db) return null;
    
    try {
        // Note: No maintenance column - global maintenance is in system_config.service_global
        const { data, error } = await db
            .from('service_config')
            .insert({
                platform,
                enabled: config?.enabled ?? true,
                rate_limit: config?.rate_limit ?? 60,
                require_cookie: config?.require_cookie ?? false,
                require_auth: config?.require_auth ?? false,
                priority: config?.priority ?? 5,
                health_status: config?.health_status ?? 'unknown'
            })
            .select()
            .single();
        
        if (error || !data) return null;
        
        // Invalidate cache
        serviceConfigDBLastFetch = 0;
        
        return data as ServiceConfigDB;
    } catch {
        return null;
    }
}

/**
 * Delete service config for a platform from database
 */
export async function serviceConfigDeleteFromDB(platform: string): Promise<boolean> {
    const db = getWriteClient();
    if (!db) return false;
    
    try {
        const { error } = await db
            .from('service_config')
            .delete()
            .eq('platform', platform);
        
        if (error) return false;
        
        // Invalidate cache
        serviceConfigDBLastFetch = 0;
        
        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Auto-load configs on module import
serviceConfigLoad().catch(() => {});