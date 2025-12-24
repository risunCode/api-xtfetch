/**
 * Admin Cookie Module
 * Admin cookie management with caching
 * 
 * Extracted from unified cookies.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { redis } from '@/lib/database';
import { logger } from '@/lib/services/shared/logger';
import { cookiePoolGetRotating } from './pool';
import type { CookiePlatform } from './parser';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface AdminCookie {
    platform: string;
    cookie: string;
    enabled: boolean;
    note: string | null;
    updated_at: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_TTL = 300;
const MAX_CACHE_SIZE = 50;

// ============================================================================
// INTERNAL STATE
// ============================================================================

let supabase: SupabaseClient | null = null;
const memCache = new Map<string, { cookie: string | null; expires: number }>();

// ============================================================================
// INTERNAL HELPERS - Supabase
// ============================================================================

function getSupabase(): SupabaseClient | null {
    if (!supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) {
            logger.warn('cookies', 'Supabase not configured');
            return null;
        }
        supabase = createClient(url, key);
    }
    return supabase;
}

// ============================================================================
// INTERNAL HELPERS - Cache
// ============================================================================

function cleanupMemCache() {
    const now = Date.now();
    for (const [key, entry] of memCache.entries()) {
        if (entry.expires < now) memCache.delete(key);
    }
}

async function getCached(key: string): Promise<string | null | undefined> {
    if (redis) {
        try { return await redis.get<string>(key); } catch { /* fallback */ }
    }
    const entry = memCache.get(key);
    if (entry && entry.expires > Date.now()) return entry.cookie;
    if (entry) memCache.delete(key);
    return undefined;
}

async function setCached(key: string, value: string | null): Promise<void> {
    if (redis) {
        try { await redis.set(key, value ?? '', { ex: CACHE_TTL }); return; } catch { /* fallback */ }
    }
    if (memCache.size >= MAX_CACHE_SIZE) cleanupMemCache();
    if (memCache.size >= MAX_CACHE_SIZE) {
        const oldest = memCache.keys().next().value;
        if (oldest) memCache.delete(oldest);
    }
    memCache.set(key, { cookie: value, expires: Date.now() + CACHE_TTL * 1000 });
}

async function delCached(key: string): Promise<void> {
    memCache.delete(key);
    if (redis) { try { await redis.del(key); } catch { /* ignore */ } }
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Get admin cookie for a platform (tries pool first, then legacy)
 */
export async function adminCookieGet(platform: CookiePlatform): Promise<string | null> {
    try {
        const poolCookie = await cookiePoolGetRotating(platform);
        if (poolCookie) return poolCookie;
    } catch { /* fallback to legacy */ }

    const cacheKey = `cookie:${platform}`;
    const cached = await getCached(cacheKey);
    if (cached !== undefined) return cached || null;

    const sb = getSupabase();
    if (!sb) return null;

    try {
        const { data, error } = await sb
            .from('admin_cookies')
            .select('cookie, enabled')
            .eq('platform', platform)
            .single();

        const cookie = (!error && data?.enabled) ? data.cookie : null;
        await setCached(cacheKey, cookie);
        return cookie;
    } catch {
        return null;
    }
}

/**
 * Check if admin cookie exists for a platform
 */
export async function adminCookieHas(platform: CookiePlatform): Promise<boolean> {
    const cookie = await adminCookieGet(platform);
    return cookie !== null;
}

/**
 * Get all admin cookies
 */
export async function adminCookieGetAll(): Promise<AdminCookie[]> {
    const sb = getSupabase();
    if (!sb) return [];

    try {
        const { data, error } = await sb
            .from('admin_cookies')
            .select('*')
            .order('platform');

        if (error || !data) return [];
        return data as AdminCookie[];
    } catch {
        return [];
    }
}

/**
 * Set admin cookie for a platform
 */
export async function adminCookieSet(
    platform: CookiePlatform,
    cookie: string,
    note?: string
): Promise<boolean> {
    const sb = getSupabase();
    if (!sb) return false;

    try {
        const { error } = await sb
            .from('admin_cookies')
            .upsert({
                platform,
                cookie,
                enabled: true,
                note: note || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'platform' });

        if (!error) await delCached(`cookie:${platform}`);
        return !error;
    } catch {
        return false;
    }
}

/**
 * Toggle admin cookie enabled status
 */
export async function adminCookieToggle(platform: CookiePlatform, enabled: boolean): Promise<boolean> {
    const sb = getSupabase();
    if (!sb) return false;

    try {
        const { error } = await sb
            .from('admin_cookies')
            .update({ enabled, updated_at: new Date().toISOString() })
            .eq('platform', platform);

        if (!error) await delCached(`cookie:${platform}`);
        return !error;
    } catch {
        return false;
    }
}

/**
 * Delete admin cookie for a platform
 */
export async function adminCookieDelete(platform: CookiePlatform): Promise<boolean> {
    const sb = getSupabase();
    if (!sb) return false;

    try {
        const { error } = await sb
            .from('admin_cookies')
            .delete()
            .eq('platform', platform);

        if (!error) await delCached(`cookie:${platform}`);
        return !error;
    } catch {
        return false;
    }
}

/**
 * Clear admin cookie cache
 */
export async function adminCookieClearCache(): Promise<void> {
    memCache.clear();
    if (redis) {
        const platforms: CookiePlatform[] = ['facebook', 'instagram', 'weibo', 'twitter'];
        await Promise.all(platforms.map(p => redis!.del(`cookie:${p}`).catch(() => {})));
    }
}
