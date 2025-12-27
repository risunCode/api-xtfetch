/**
 * System Configuration Module
 * Split from: lib/config.ts
 * 
 * This module provides:
 * - System configuration with database-backed settings (sysConfig*)
 * - System config key-value functions (systemConfig*)
 * - SystemConfig, SystemConfigDB, MaintenanceType, PlatformStats, PlatformConfig types
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PlatformId } from './platform';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Maintenance mode types */
export type MaintenanceType = 'off' | 'api' | 'full' | 'all';

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
// CONSTANTS - DEFAULT CONFIGS
// ============================================================================

const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
    cacheTtlConfig: 30000,
    cacheTtlApikeys: 10000,
    cacheTtlCookies: 300000,
    cacheTtlUseragents: 300000,
    cacheTtlPlaygroundUrl: 120000,
    httpTimeout: 15000,
    httpMaxRedirects: 10,
    scraperTimeoutFacebook: 20000,
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

const BOOTSTRAP_CACHE_TTL = 30000;

// ============================================================================
// STATE - Module-level state variables
// ============================================================================

let systemConfig: SystemConfig = { ...DEFAULT_SYSTEM_CONFIG };
let systemConfigLastFetch = 0;
let systemConfigIsLoading = false;

// Supabase client for system config
let sysConfigSupabase: SupabaseClient | null = null;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function getSysConfigSupabase(): SupabaseClient | null {
    if (sysConfigSupabase) return sysConfigSupabase;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    sysConfigSupabase = createClient(url, key);
    return sysConfigSupabase;
}

// ============================================================================
// SYSTEM CONFIG FUNCTIONS
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
// SYSTEM CONFIG KEY-VALUE FUNCTIONS (for system_config JSONB table)
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
