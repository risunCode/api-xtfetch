/**
 * Cookie Pool Manager
 * Multi-cookie rotation with health tracking & rate limiting
 * Cookies are encrypted at rest using AES-256-GCM
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '@/lib/utils/security';

const ENCRYPTED_PREFIX = 'enc:';

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
    if (!supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) {
            console.warn('[CookiePool] Supabase not configured');
            return null;
        }
        supabase = createClient(url, key);
    }
    return supabase;
}

export type CookieStatus = 'healthy' | 'cooldown' | 'expired' | 'disabled';

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

let lastUsedCookieId: string | null = null;

function encryptCookie(cookie: string): string {
    if (cookie.startsWith(ENCRYPTED_PREFIX)) return cookie;
    return ENCRYPTED_PREFIX + encrypt(cookie);
}

function decryptCookie(cookie: string): string {
    if (!cookie.startsWith(ENCRYPTED_PREFIX)) return cookie;
    return decrypt(cookie.slice(ENCRYPTED_PREFIX.length));
}

function isEncrypted(cookie: string): boolean {
    return cookie.startsWith(ENCRYPTED_PREFIX);
}

export async function getRotatingCookie(platform: string): Promise<string | null> {
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
            return decryptCookie(fallback.cookie);
        }

        await db
            .from('admin_cookie_pool')
            .update({
                last_used_at: new Date().toISOString(),
                use_count: data.use_count + 1
            })
            .eq('id', data.id);

        lastUsedCookieId = data.id;
        return decryptCookie(data.cookie);
    } catch (e) {
        console.error('[CookiePool] getRotatingCookie error:', e);
        return null;
    }
}

export async function markCookieSuccess(): Promise<void> {
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

export async function markCookieError(error?: string): Promise<void> {
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
            const { getCookieCooldownMinutes } = await import('@/lib/services/helper/system-config');
            cooldownMinutes = getCookieCooldownMinutes();
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

export async function markCookieCooldown(minutes?: number, error?: string): Promise<void> {
    if (!lastUsedCookieId) return;
    const db = getSupabase();
    if (!db) return;
    
    let cooldownMinutes = minutes;
    if (cooldownMinutes === undefined) {
        try {
            const { getCookieCooldownMinutes } = await import('@/lib/services/helper/system-config');
            cooldownMinutes = getCookieCooldownMinutes();
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

export async function markCookieExpired(error?: string): Promise<void> {
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

export async function getCookiesByPlatform(platform: string): Promise<PooledCookie[]> {
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

function getCookiePreview(cookie: string): string {
    const decrypted = decryptCookie(cookie);
    if (decrypted.length <= 30) return decrypted.slice(0, 10) + '...';
    return decrypted.slice(0, 20) + '...[' + decrypted.length + ' chars]';
}

export async function getCookiePoolStats(): Promise<CookiePoolStats[]> {
    const db = getSupabase();
    if (!db) return [];

    const { data } = await db.from('cookie_pool_stats').select('*');
    return data || [];
}

export async function addCookieToPool(
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

export async function updatePooledCookie(
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

export async function deleteCookieFromPool(id: string): Promise<boolean> {
    const db = getSupabase();
    if (!db) return false;

    const { error } = await db.from('admin_cookie_pool').delete().eq('id', id);
    return !error;
}

export async function testCookieHealth(id: string): Promise<{ healthy: boolean; error?: string }> {
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

export function getDecryptedCookie(encryptedCookie: string): string {
    return decryptCookie(encryptedCookie);
}

export async function migrateUnencryptedCookies(): Promise<{ migrated: number; errors: number }> {
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
