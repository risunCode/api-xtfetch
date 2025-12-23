/**
 * Unified Cookie Module
 * Combines cookie parsing, pool management, and admin cookie functionality
 * 
 * Merged from:
 * - cookie-parser.ts: Universal cookie parsing for all platforms
 * - cookie-pool.ts: Multi-cookie rotation with health tracking & rate limiting
 * - admin-cookie.ts: Admin cookie management with caching
 * 
 * Cookies are encrypted at rest using AES-256-GCM
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { securityEncrypt, securityDecrypt } from '@/lib/utils';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/services/helper/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type CookiePlatform = 'facebook' | 'instagram' | 'weibo' | 'twitter';

export type CookieStatus = 'healthy' | 'cooldown' | 'expired' | 'disabled';

interface CookieObject {
    name?: string;
    value?: string;
    domain?: string;
}

export interface ValidationResult {
    valid: boolean;
    missing?: string[];
    info?: {
        userId?: string;
        sessionId?: string;
        pairCount: number;
    };
}

export interface PooledCookie {
    id: string;
    platform: string;
    cookie: string;
    label: string | null;
    user_id: string | null;
    status: CookieStatus;
    last_used_at: string | null;
    use_count: number;
    success_count: number;
    error_count: number;
    last_error: string | null;
    cooldown_until: string | null;
    max_uses_per_hour: number;
    enabled: boolean;
    note: string | null;
    created_at: string;
    updated_at: string;
}

export interface CookiePoolStats {
    platform: string;
    total: number;
    enabled_count: number;
    healthy_count: number;
    cooldown_count: number;
    expired_count: number;
    disabled_count: number;
    total_uses: number;
    total_success: number;
    total_errors: number;
}

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

const ENCRYPTED_PREFIX = 'enc:';

const DOMAIN_PATTERNS: Record<CookiePlatform, string[]> = {
    facebook: ['.facebook.com', 'facebook.com', '.fb.com'],
    instagram: ['.instagram.com', 'instagram.com'],
    weibo: ['.weibo.com', 'weibo.com', '.weibo.cn'],
    twitter: ['.twitter.com', 'twitter.com', '.x.com', 'x.com'],
};

const REQUIRED_COOKIES: Record<CookiePlatform, string[]> = {
    facebook: ['c_user', 'xs'],
    instagram: ['sessionid'],
    weibo: ['SUB'],
    twitter: ['auth_token'],
};

const CACHE_TTL = 300;
const MAX_CACHE_SIZE = 50;

// ============================================================================
// INTERNAL STATE
// ============================================================================

let supabase: SupabaseClient | null = null;
let lastUsedCookieId: string | null = null;
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
// INTERNAL HELPERS - Encryption
// ============================================================================

function encryptCookie(cookie: string): string {
    if (cookie.startsWith(ENCRYPTED_PREFIX)) return cookie;
    return ENCRYPTED_PREFIX + securityEncrypt(cookie);
}

function decryptCookie(cookie: string): string {
    if (!cookie.startsWith(ENCRYPTED_PREFIX)) return cookie;
    return securityDecrypt(cookie.slice(ENCRYPTED_PREFIX.length));
}

function isEncrypted(cookie: string): boolean {
    return cookie.startsWith(ENCRYPTED_PREFIX);
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
// INTERNAL HELPERS - Cookie Parsing
// ============================================================================

function filterAndExtract(
    cookies: CookieObject[], 
    platform?: CookiePlatform
): { name: string; value: string }[] {
    let filtered = cookies;
    
    if (platform && DOMAIN_PATTERNS[platform]) {
        const patterns = DOMAIN_PATTERNS[platform];
        filtered = cookies.filter(c => {
            if (!c.domain) return true;
            const domain = c.domain.toLowerCase();
            return patterns.some(p => domain.includes(p.replace('.', '')));
        });
    }
    
    return filtered
        .filter(c => c.name && c.value)
        .map(c => ({ name: c.name!, value: c.value! }));
}

function parseCookiePairs(cookie: string): { name: string; value: string }[] {
    const pairs: { name: string; value: string }[] = [];
    
    if (cookie.trim().startsWith('[')) {
        try {
            const arr = JSON.parse(cookie);
            if (Array.isArray(arr)) {
                arr.forEach((c: CookieObject) => {
                    if (c.name && c.value) pairs.push({ name: c.name, value: c.value });
                });
                return pairs;
            }
        } catch { /* fall through */ }
    }
    
    cookie.split(';').forEach(pair => {
        const [name, ...valueParts] = pair.trim().split('=');
        if (name && valueParts.length) {
            pairs.push({ name: name.trim(), value: valueParts.join('=').trim() });
        }
    });
    
    return pairs;
}

function extractCookieInfo(
    pairs: { name: string; value: string }[], 
    platform: CookiePlatform
): ValidationResult['info'] {
    const info: ValidationResult['info'] = { pairCount: pairs.length };
    
    switch (platform) {
        case 'facebook': {
            const cUser = pairs.find(p => p.name === 'c_user');
            const xs = pairs.find(p => p.name === 'xs');
            if (cUser) info.userId = cUser.value;
            if (xs) info.sessionId = xs.value.substring(0, 20) + '...';
            break;
        }
        case 'instagram': {
            const dsUser = pairs.find(p => p.name === 'ds_user_id');
            const sessionId = pairs.find(p => p.name === 'sessionid');
            if (dsUser) info.userId = dsUser.value;
            if (sessionId) info.sessionId = sessionId.value.substring(0, 20) + '...';
            break;
        }
        case 'weibo': {
            const sub = pairs.find(p => p.name === 'SUB');
            if (sub) info.sessionId = sub.value.substring(0, 20) + '...';
            break;
        }
        case 'twitter': {
            const authToken = pairs.find(p => p.name === 'auth_token');
            if (authToken) info.sessionId = authToken.value.substring(0, 20) + '...';
            break;
        }
    }
    
    return info;
}

function extractUserId(cookie: string, platform: string): string | null {
    try {
        const parsed = JSON.parse(cookie);
        if (Array.isArray(parsed)) {
            const patterns: Record<string, string> = {
                facebook: 'c_user', instagram: 'ds_user_id', twitter: 'twid', weibo: 'SUB'
            };
            const key = patterns[platform];
            const found = parsed.find((c: { name: string }) => c.name === key);
            return found?.value || null;
        }
    } catch {
        const patterns: Record<string, RegExp> = {
            facebook: /c_user=(\d+)/, instagram: /ds_user_id=(\d+)/,
            twitter: /twid=u%3D(\d+)/, weibo: /SUB=([^;]+)/
        };
        const match = cookie.match(patterns[platform]);
        return match?.[1] || null;
    }
    return null;
}

function getCookiePreview(cookie: string): string {
    const decrypted = decryptCookie(cookie);
    if (decrypted.length <= 30) return decrypted.slice(0, 10) + '...';
    return decrypted.slice(0, 20) + '...[' + decrypted.length + ' chars]';
}


// ============================================================================
// COOKIE PARSER FUNCTIONS (from cookie-parser.ts)
// ============================================================================

/**
 * Parse cookie input from various formats into a standard cookie string
 */
export function cookieParse(input: unknown, platform?: CookiePlatform): string | null {
    if (!input) return null;
    
    let pairs: { name: string; value: string }[] = [];
    
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return null;
        
        if (trimmed.startsWith('[')) {
            try {
                const arr = JSON.parse(trimmed) as CookieObject[];
                if (Array.isArray(arr)) {
                    pairs = filterAndExtract(arr, platform);
                }
            } catch {
                return trimmed;
            }
        } else {
            return trimmed;
        }
    } else if (Array.isArray(input)) {
        pairs = filterAndExtract(input as CookieObject[], platform);
    } else if (typeof input === 'object' && input !== null) {
        const obj = input as CookieObject;
        if (obj.name && obj.value) {
            pairs = [{ name: obj.name, value: obj.value }];
        }
    }
    
    if (pairs.length === 0) return null;
    return pairs.map(p => `${p.name}=${p.value}`).join('; ');
}

/**
 * Validate a cookie string for a specific platform
 */
export function cookieValidate(cookie: string | null, platform: CookiePlatform): ValidationResult {
    if (!cookie) {
        return { valid: false, missing: REQUIRED_COOKIES[platform] };
    }
    
    const pairs = parseCookiePairs(cookie);
    const required = REQUIRED_COOKIES[platform];
    const missing = required.filter(name => !pairs.some(p => p.name === name));
    const info = extractCookieInfo(pairs, platform);
    
    return {
        valid: missing.length === 0,
        missing: missing.length > 0 ? missing : undefined,
        info,
    };
}

/**
 * Check if input looks like a cookie
 */
export function cookieIsLike(input: unknown): boolean {
    if (!input) return false;
    
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (trimmed.startsWith('[')) {
            try {
                const arr = JSON.parse(trimmed);
                return Array.isArray(arr) && arr.some((c: CookieObject) => c.name && c.value);
            } catch {
                return false;
            }
        }
        return trimmed.includes('=');
    }
    
    if (Array.isArray(input)) {
        return input.some((c: CookieObject) => c.name && c.value);
    }
    
    return false;
}

/**
 * Detect the format of a cookie input
 */
export function cookieGetFormat(input: unknown): 'json' | 'string' | 'array' | 'unknown' {
    if (!input) return 'unknown';
    
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (trimmed.startsWith('[')) {
            try {
                JSON.parse(trimmed);
                return 'json';
            } catch {
                return 'unknown';
            }
        }
        return 'string';
    }
    
    if (Array.isArray(input)) return 'array';
    return 'unknown';
}


// ============================================================================
// COOKIE POOL FUNCTIONS (from cookie-pool.ts)
// ============================================================================

/**
 * Get a rotating cookie from the pool for a platform
 */
export async function cookiePoolGetRotating(platform: string): Promise<string | null> {
    const db = getSupabase();
    if (!db) return null;

    try {
        try { await db.rpc('reset_expired_cooldowns'); } catch { /* ignore */ }

        const { data, error } = await db
            .from('admin_cookie_pool')
            .select('*')
            .eq('platform', platform)
            .eq('enabled', true)
            .in('status', ['healthy'])
            .or('cooldown_until.is.null,cooldown_until.lt.now()')
            .order('last_used_at', { ascending: true, nullsFirst: true })
            .order('use_count', { ascending: true })
            .limit(1)
            .single();

        if (error || !data) {
            const { data: fallback } = await db
                .from('admin_cookie_pool')
                .select('*')
                .eq('platform', platform)
                .eq('enabled', true)
                .eq('status', 'cooldown')
                .lt('cooldown_until', new Date().toISOString())
                .order('cooldown_until', { ascending: true })
                .limit(1)
                .single();
            
            if (!fallback) return null;
            
            await db
                .from('admin_cookie_pool')
                .update({ status: 'healthy', cooldown_until: null })
                .eq('id', fallback.id);
            
            lastUsedCookieId = fallback.id;
            const decrypted = decryptCookie(fallback.cookie);
            // Parse JSON cookie format to string if needed
            return cookieParse(decrypted, platform as CookiePlatform) || decrypted;
        }

        await db
            .from('admin_cookie_pool')
            .update({
                last_used_at: new Date().toISOString(),
                use_count: data.use_count + 1
            })
            .eq('id', data.id);

        lastUsedCookieId = data.id;
        const decrypted = decryptCookie(data.cookie);
        // Parse JSON cookie format to string if needed
        return cookieParse(decrypted, platform as CookiePlatform) || decrypted;
    } catch (e) {
        console.error('[CookiePool] cookiePoolGetRotating error:', e);
        return null;
    }
}

/**
 * Mark the last used cookie as successful
 */
export async function cookiePoolMarkSuccess(): Promise<void> {
    if (!lastUsedCookieId) return;
    const db = getSupabase();
    if (!db) return;
    
    const { data } = await db
        .from('admin_cookie_pool')
        .select('success_count, use_count')
        .eq('id', lastUsedCookieId)
        .single();
    
    if (data) {
        await db
            .from('admin_cookie_pool')
            .update({ 
                success_count: data.success_count + 1,
                use_count: data.use_count + 1,
                last_error: null,
                status: 'healthy'
            })
            .eq('id', lastUsedCookieId);
    }
}

/**
 * Mark the last used cookie as having an error
 */
export async function cookiePoolMarkError(error?: string): Promise<void> {
    if (!lastUsedCookieId) return;
    const db = getSupabase();
    if (!db) return;
    
    const { data } = await db
        .from('admin_cookie_pool')
        .select('error_count')
        .eq('id', lastUsedCookieId)
        .single();
    
    const newErrorCount = (data?.error_count || 0) + 1;
    
    if (newErrorCount % 10 === 0) {
        let cooldownMinutes = 30;
        try {
            const { sysConfigCookieCooldownMinutes } = await import('@/lib/config');
            cooldownMinutes = sysConfigCookieCooldownMinutes();
        } catch { /* use default */ }
        
        const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60000).toISOString();
        
        await db
            .from('admin_cookie_pool')
            .update({
                error_count: newErrorCount,
                last_error: error || 'Multiple errors',
                status: 'cooldown',
                cooldown_until: cooldownUntil
            })
            .eq('id', lastUsedCookieId);
    } else {
        await db
            .from('admin_cookie_pool')
            .update({
                error_count: newErrorCount,
                last_error: error || 'Request failed'
            })
            .eq('id', lastUsedCookieId);
    }
}

/**
 * Mark the last used cookie as in cooldown
 */
export async function cookiePoolMarkCooldown(minutes?: number, error?: string): Promise<void> {
    if (!lastUsedCookieId) return;
    const db = getSupabase();
    if (!db) return;
    
    let cooldownMinutes = minutes;
    if (cooldownMinutes === undefined) {
        try {
            const { sysConfigCookieCooldownMinutes } = await import('@/lib/config');
            cooldownMinutes = sysConfigCookieCooldownMinutes();
        } catch {
            cooldownMinutes = 30;
        }
    }
    
    const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60000).toISOString();
    
    const { data } = await db
        .from('admin_cookie_pool')
        .select('error_count')
        .eq('id', lastUsedCookieId)
        .single();
    
    await db
        .from('admin_cookie_pool')
        .update({
            status: 'cooldown',
            cooldown_until: cooldownUntil,
            error_count: (data?.error_count || 0) + 1,
            last_error: error || 'Rate limited'
        })
        .eq('id', lastUsedCookieId);
}

/**
 * Mark the last used cookie as expired
 */
export async function cookiePoolMarkExpired(error?: string): Promise<void> {
    if (!lastUsedCookieId) return;
    const db = getSupabase();
    if (!db) return;
    
    await db
        .from('admin_cookie_pool')
        .update({
            status: 'expired',
            last_error: error || 'Session expired'
        })
        .eq('id', lastUsedCookieId);
}


/**
 * Get all cookies for a platform from the pool
 */
export async function cookiePoolGetByPlatform(platform: string): Promise<PooledCookie[]> {
    const db = getSupabase();
    if (!db) return [];

    const { data } = await db
        .from('admin_cookie_pool')
        .select('*')
        .eq('platform', platform)
        .order('created_at', { ascending: false });
    
    if (!data) return [];
    
    return data.map(cookie => ({
        ...cookie,
        cookiePreview: getCookiePreview(cookie.cookie),
        isEncrypted: isEncrypted(cookie.cookie),
    }));
}

/**
 * Get statistics for all cookie pools
 */
export async function cookiePoolGetStats(): Promise<CookiePoolStats[]> {
    const db = getSupabase();
    if (!db) return [];

    const { data } = await db.from('cookie_pool_stats').select('*');
    return data || [];
}

/**
 * Add a new cookie to the pool
 */
export async function cookiePoolAdd(
    platform: string,
    cookie: string,
    options?: { label?: string; note?: string; max_uses_per_hour?: number }
): Promise<PooledCookie | null> {
    const db = getSupabase();
    if (!db) throw new Error('Database not configured');

    const userId = extractUserId(cookie, platform);
    const encryptedCookie = encryptCookie(cookie);
    
    const { data, error } = await db
        .from('admin_cookie_pool')
        .insert({
            platform,
            cookie: encryptedCookie,
            user_id: userId,
            label: options?.label,
            note: options?.note,
            max_uses_per_hour: options?.max_uses_per_hour || 60
        })
        .select()
        .single();
    
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Update an existing cookie in the pool
 */
export async function cookiePoolUpdate(
    id: string,
    updates: Partial<Pick<PooledCookie, 'cookie' | 'label' | 'note' | 'enabled' | 'status' | 'max_uses_per_hour'>>
): Promise<PooledCookie | null> {
    const db = getSupabase();
    if (!db) throw new Error('Database not configured');

    const updateData: Record<string, unknown> = { ...updates };

    if (updates.cookie) {
        const { data: existing } = await db
            .from('admin_cookie_pool')
            .select('platform')
            .eq('id', id)
            .single();
        
        if (existing) {
            updateData.user_id = extractUserId(updates.cookie, existing.platform);
            updateData.cookie = encryptCookie(updates.cookie);
        }
    }
    
    const { data, error } = await db
        .from('admin_cookie_pool')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
    
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Delete a cookie from the pool
 */
export async function cookiePoolDelete(id: string): Promise<boolean> {
    const db = getSupabase();
    if (!db) return false;

    const { error } = await db.from('admin_cookie_pool').delete().eq('id', id);
    return !error;
}

/**
 * Test the health of a specific cookie
 */
export async function cookiePoolTestHealth(id: string): Promise<{ healthy: boolean; error?: string }> {
    const db = getSupabase();
    if (!db) return { healthy: false, error: 'Database not configured' };

    const { data } = await db
        .from('admin_cookie_pool')
        .select('platform, cookie, status, error_count')
        .eq('id', id)
        .single();
    
    if (!data) return { healthy: false, error: 'Cookie not found' };
    
    const decryptedCookie = decryptCookie(data.cookie);
    if (!decryptedCookie || decryptedCookie.length < 10) {
        return { healthy: false, error: 'Invalid cookie format' };
    }
    
    const isHealthy = data.status === 'healthy' || data.status === 'cooldown';
    return { 
        healthy: isHealthy, 
        error: isHealthy ? undefined : data.status === 'expired' ? 'Marked as expired' : `Status: ${data.status}`
    };
}

/**
 * Get decrypted cookie value
 */
export function cookiePoolGetDecrypted(encryptedCookie: string): string {
    return decryptCookie(encryptedCookie);
}

/**
 * Migrate unencrypted cookies to encrypted format
 */
export async function cookiePoolMigrateUnencrypted(): Promise<{ migrated: number; errors: number }> {
    const db = getSupabase();
    if (!db) return { migrated: 0, errors: 0 };

    let migrated = 0;
    let errors = 0;

    try {
        const { data: cookies } = await db.from('admin_cookie_pool').select('id, cookie');
        if (!cookies) return { migrated: 0, errors: 0 };

        for (const cookie of cookies) {
            if (cookie.cookie.startsWith(ENCRYPTED_PREFIX)) continue;

            try {
                const encrypted = encryptCookie(cookie.cookie);
                await db.from('admin_cookie_pool').update({ cookie: encrypted }).eq('id', cookie.id);
                migrated++;
            } catch {
                errors++;
            }
        }

        return { migrated, errors };
    } catch {
        return { migrated, errors };
    }
}


// ============================================================================
// ADMIN COOKIE FUNCTIONS (from admin-cookie.ts)
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
