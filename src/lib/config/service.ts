/**
 * Service Configuration Module
 * Split from: lib/config.ts
 * 
 * This module provides:
 * - Service configuration with Supabase sync (serviceConfig*)
 * - ServiceConfig, ServiceConfigDB types
 */

import { supabase, supabaseAdmin } from '@/lib/database';
import { PlatformId } from './platform';
import { sysConfigGet, MaintenanceType, PlatformStats, PlatformConfig } from './system';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

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

// ============================================================================
// CONSTANTS - DEFAULT CONFIGS
// ============================================================================

const BOOTSTRAP_CACHE_TTL = 5000; // 5 seconds - short TTL for fast maintenance mode detection

const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
    platforms: {
        facebook: { id: 'facebook', name: 'Facebook', enabled: true, method: 'HTML Scraping', rateLimit: 10, cacheTime: 300, disabledMessage: 'Facebook service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        instagram: { id: 'instagram', name: 'Instagram', enabled: true, method: 'Embed API', rateLimit: 15, cacheTime: 300, disabledMessage: 'Instagram service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        twitter: { id: 'twitter', name: 'Twitter/X', enabled: true, method: 'Syndication API', rateLimit: 20, cacheTime: 300, disabledMessage: 'Twitter/X service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        tiktok: { id: 'tiktok', name: 'TikTok', enabled: true, method: 'TikWM API', rateLimit: 15, cacheTime: 300, disabledMessage: 'TikTok service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        weibo: { id: 'weibo', name: 'Weibo', enabled: true, method: 'Mobile API', rateLimit: 10, cacheTime: 300, disabledMessage: 'Weibo service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        youtube: { id: 'youtube', name: 'YouTube', enabled: true, method: 'External API', rateLimit: 10, cacheTime: 3600, disabledMessage: 'YouTube service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        // New platforms (yt-dlp/gallery-dl based)
        bilibili: { id: 'bilibili', name: 'BiliBili', enabled: true, method: 'yt-dlp', rateLimit: 10, cacheTime: 300, disabledMessage: 'BiliBili service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        reddit: { id: 'reddit', name: 'Reddit', enabled: true, method: 'yt-dlp', rateLimit: 10, cacheTime: 300, disabledMessage: 'Reddit service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        soundcloud: { id: 'soundcloud', name: 'SoundCloud', enabled: true, method: 'yt-dlp', rateLimit: 10, cacheTime: 300, disabledMessage: 'SoundCloud service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        eporner: { id: 'eporner', name: 'Eporner', enabled: true, method: 'yt-dlp', rateLimit: 10, cacheTime: 300, disabledMessage: 'Eporner service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        pornhub: { id: 'pornhub', name: 'PornHub', enabled: true, method: 'yt-dlp', rateLimit: 10, cacheTime: 300, disabledMessage: 'PornHub service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        rule34video: { id: 'rule34video', name: 'Rule34Video', enabled: true, method: 'yt-dlp', rateLimit: 10, cacheTime: 300, disabledMessage: 'Rule34Video service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        erome: { id: 'erome', name: 'Erome', enabled: true, method: 'gallery-dl', rateLimit: 10, cacheTime: 300, disabledMessage: 'Erome service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
        pixiv: { id: 'pixiv', name: 'Pixiv', enabled: true, method: 'gallery-dl', rateLimit: 10, cacheTime: 300, disabledMessage: 'Pixiv service is temporarily unavailable.', lastUpdated: new Date().toISOString(), stats: { totalRequests: 0, successCount: 0, errorCount: 0, avgResponseTime: 0 } },
    },
    globalRateLimit: 6,
    playgroundRateLimit: 3,
    playgroundEnabled: true,
    geminiRateLimit: 5,
    geminiRateWindow: 1,
    maintenanceMode: false,
    maintenanceType: 'off',
    maintenanceMessage: 'DownAria is under maintenance. Please try again later.',
    apiKeyRequired: false,
    lastUpdated: new Date().toISOString()
};

// ============================================================================
// STATE - Module-level state variables
// ============================================================================

let serviceConfig: ServiceConfig = JSON.parse(JSON.stringify(DEFAULT_SERVICE_CONFIG));
let serviceConfigLastFetch = 0;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

// ALWAYS use service role for config reads to bypass RLS
const getWriteClient = () => supabaseAdmin || supabase;
const getReadClient = () => supabaseAdmin || supabase; // Changed: use admin for reads too!

// ============================================================================
// SERVICE CONFIG FUNCTIONS
// ============================================================================

/** Load service configuration from database */
export async function serviceConfigLoad(forceRefresh = false): Promise<boolean> {
    // Use short TTL for maintenance mode detection (5 seconds)
    const cacheTTL = BOOTSTRAP_CACHE_TTL;
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
    const systemConfig = sysConfigGet();
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
// SERVICE CONFIG DATABASE FUNCTIONS (for service_config table)
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
