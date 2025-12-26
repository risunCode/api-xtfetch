/**
 * Cookie Pool Module
 * Multi-cookie rotation with health tracking & rate limiting
 * 
 * Extracted from unified cookies.ts
 * Cookies are encrypted at rest using AES-256-GCM
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { securityEncrypt, securityDecrypt } from '@/lib/utils';
import { logger } from '@/lib/services/shared/logger';
import { cookieParse, type CookiePlatform } from './parser';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type CookieStatus = 'healthy' | 'cooldown' | 'expired' | 'disabled';
export type CookieTier = 'public' | 'private';

export interface PooledCookie {
    id: string;
    platform: string;
    cookie: string;
    label: string | null;
    user_id: string | null;
    tier: CookieTier;
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
    tier: CookieTier;
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

// ============================================================================
// CONSTANTS
// ============================================================================

const ENCRYPTED_PREFIX = 'enc:';

/**
 * Valid platform identifiers - whitelist for SQL injection prevention
 */
const VALID_PLATFORMS = ['facebook', 'instagram', 'twitter', 'tiktok', 'weibo', 'youtube'] as const;
type ValidPlatform = typeof VALID_PLATFORMS[number];

/**
 * Validate platform parameter against whitelist
 * @throws Error if platform is invalid
 */
function validatePlatform(platform: string): asserts platform is ValidPlatform {
    if (!VALID_PLATFORMS.includes(platform as ValidPlatform)) {
        throw new Error(`Invalid platform: ${platform}. Must be one of: ${VALID_PLATFORMS.join(', ')}`);
    }
}

// ============================================================================
// INTERNAL STATE
// ============================================================================

let supabase: SupabaseClient | null = null;
let lastUsedCookieId: string | null = null;
let lastAlertTime: Record<string, number> = {}; // Rate limit alerts per platform

// ============================================================================
// WEBHOOK ALERT HELPER
// ============================================================================

/**
 * Send cookie alert to Discord webhook (if configured)
 * Rate limited to 1 alert per platform per 5 minutes
 */
async function sendCookieAlert(
    type: 'expired' | 'cooldown' | 'error',
    platform: string,
    label?: string | null,
    error?: string
): Promise<void> {
    // Rate limit: 1 alert per platform per 5 minutes
    const key = `${platform}:${type}`;
    const now = Date.now();
    if (lastAlertTime[key] && now - lastAlertTime[key] < 5 * 60 * 1000) {
        return; // Skip - already alerted recently
    }
    lastAlertTime[key] = now;

    try {
        const db = getSupabase();
        if (!db) return;

        // Get alert config
        const { data: config } = await db
            .from('alert_config')
            .select('notify_discord, discord_webhook_url, alert_cookie_low')
            .single();

        if (!config?.notify_discord || !config?.discord_webhook_url) {
            return; // Discord notifications not configured
        }

        const emoji = type === 'expired' ? '🔴' : type === 'cooldown' ? '🟡' : '⚠️';
        const title = type === 'expired' ? 'Cookie Expired' : type === 'cooldown' ? 'Cookie Cooldown' : 'Cookie Error';
        const color = type === 'expired' ? 0xff0000 : type === 'cooldown' ? 0xffaa00 : 0xff6600;

        const embed = {
            title: `${emoji} ${title}`,
            description: `A cookie for **${platform.toUpperCase()}** has been marked as ${type}.`,
            color,
            fields: [
                { name: 'Platform', value: platform, inline: true },
                { name: 'Label', value: label || 'N/A', inline: true },
                { name: 'Status', value: type.toUpperCase(), inline: true },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'DownAria Cookie Monitor' },
        };

        if (error) {
            embed.fields.push({ name: 'Error', value: error.substring(0, 200), inline: false });
        }

        await fetch(config.discord_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });

        logger.debug('cookies', `Alert sent for ${platform} cookie ${type}`);
    } catch (e) {
        logger.warn('cookies', `Failed to send cookie alert: ${e}`);
    }
}

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
// INTERNAL HELPERS - Cookie Parsing
// ============================================================================

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
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Get a rotating cookie from the pool for a platform
 * Uses optimized single-query approach with smart prioritization:
 * 1. Healthy cookies from requested tier
 * 2. Healthy cookies from public tier (if private requested)
 * 3. Expired cooldown cookies (cooldown_until < now)
 * 4. Any enabled cookie as last resort
 * 
 * @param platform - The platform to get a cookie for
 * @param tier - Cookie tier: 'public' (default) or 'private' (with fallback to public)
 */
export async function cookiePoolGetRotating(
    platform: string,
    tier: CookieTier = 'public'
): Promise<string | null> {
    // Validate platform against whitelist to prevent SQL injection
    try {
        validatePlatform(platform);
    } catch (e) {
        logger.error('cookies', `Invalid platform parameter: ${platform}`);
        return null;
    }

    const db = getSupabase();
    if (!db) {
        logger.warn('cookies', `No database configured for cookie pool`);
        return null;
    }

    try {
        // Non-blocking RPC call to reset expired cooldowns (fire and forget)
        (async () => {
            try { await db.rpc('reset_expired_cooldowns'); } catch { /* ignore */ }
        })();

        const now = new Date().toISOString();
        
        // Build tiers to search: for private tier, include public as fallback
        const tiersToSearch = tier === 'private' ? ['private', 'public'] : ['public'];
        
        // Single optimized query that fetches best available cookie
        // Priority order via computed columns in ORDER BY:
        // 1. Tier match (requested tier first)
        // 2. Status priority (healthy > expired cooldown > other)
        // 3. Cooldown expiry (for cooldown status, prefer already expired)
        // 4. Last used (least recently used first)
        // 5. Use count (least used first)
        const { data: cookies, error } = await db
            .from('admin_cookie_pool')
            .select('*')
            .eq('platform', platform)
            .eq('enabled', true)
            .in('tier', tiersToSearch)
            .order('last_used_at', { ascending: true, nullsFirst: true })
            .order('use_count', { ascending: true })
            .limit(20); // Get a batch to filter in-memory for priority

        if (error || !cookies || cookies.length === 0) {
            logger.warn('cookies', `[${platform}:${tier}] No cookies found in pool!`);
            return null;
        }

        // Score and sort cookies by priority in-memory
        // This is faster than multiple DB queries
        const scoredCookies = cookies.map(cookie => {
            let priority = 1000; // Lower is better
            
            // Tier priority: requested tier > fallback tier
            if (cookie.tier === tier) {
                priority -= 500;
            }
            
            // Status priority
            const isHealthy = cookie.status === 'healthy';
            const isCooldownExpired = cookie.status === 'cooldown' && 
                cookie.cooldown_until && new Date(cookie.cooldown_until) < new Date(now);
            const isCooldownActive = cookie.status === 'cooldown' && 
                cookie.cooldown_until && new Date(cookie.cooldown_until) >= new Date(now);
            
            if (isHealthy && (!cookie.cooldown_until || new Date(cookie.cooldown_until) < new Date(now))) {
                priority -= 400; // Best: healthy with no active cooldown
            } else if (isCooldownExpired) {
                priority -= 300; // Good: cooldown has expired
            } else if (isHealthy) {
                priority -= 200; // OK: healthy but has active cooldown
            } else if (!isCooldownActive) {
                priority -= 100; // Fallback: any other status without active cooldown
            }
            // Active cooldown cookies get no bonus (priority stays higher = worse)
            
            return { cookie, priority, isHealthy, isCooldownExpired };
        });

        // Sort by priority (lower is better), then by last_used_at, then by use_count
        scoredCookies.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            // Secondary sort by last_used_at (nulls first, then ascending)
            const aTime = a.cookie.last_used_at ? new Date(a.cookie.last_used_at).getTime() : 0;
            const bTime = b.cookie.last_used_at ? new Date(b.cookie.last_used_at).getTime() : 0;
            if (aTime !== bTime) return aTime - bTime;
            // Tertiary sort by use_count
            return a.cookie.use_count - b.cookie.use_count;
        });

        const best = scoredCookies[0];
        if (!best) {
            logger.warn('cookies', `[${platform}:${tier}] No suitable cookies found after scoring!`);
            return null;
        }

        const selectedCookie = best.cookie;
        const tierInfo = selectedCookie.tier === tier ? tier : `${tier}→${selectedCookie.tier}`;
        
        // Determine what type of cookie we found for logging
        let cookieType: string;
        if (best.isHealthy && (!selectedCookie.cooldown_until || new Date(selectedCookie.cooldown_until) < new Date(now))) {
            cookieType = 'healthy';
        } else if (best.isCooldownExpired) {
            cookieType = 'expired cooldown';
        } else {
            cookieType = `fallback (status: ${selectedCookie.status})`;
        }
        
        logger.debug('cookies', `[${platform}:${tierInfo}] Found ${cookieType} cookie: ${selectedCookie.id.substring(0, 8)}...`);

        // Update cookie based on its state
        const updateData: Record<string, unknown> = {
            last_used_at: now,
            use_count: selectedCookie.use_count + 1
        };
        
        // Reset cooldown if it was expired, or reset status if using fallback
        if (best.isCooldownExpired || selectedCookie.status !== 'healthy') {
            updateData.status = 'healthy';
            updateData.cooldown_until = null;
        }

        // Non-blocking update (fire and forget for performance)
        (async () => {
            try {
                await db.from('admin_cookie_pool')
                    .update(updateData)
                    .eq('id', selectedCookie.id);
            } catch (err) {
                logger.warn('cookies', `Failed to update cookie usage: ${err}`);
            }
        })();

        lastUsedCookieId = selectedCookie.id;
        const decrypted = decryptCookie(selectedCookie.cookie);
        return cookieParse(decrypted, platform as CookiePlatform) || decrypted;
    } catch (e) {
        logger.error('cookies', `[${platform}:${tier}] cookiePoolGetRotating error: ${e}`);
        return null;
    }
}

/**
 * Mark the last used cookie as successful
 * Resets error count and login_fail_count on success
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
                status: 'healthy',
                cooldown_until: null
            })
            .eq('id', lastUsedCookieId);
    }
}

/**
 * Mark the last used cookie as having an error
 * 
 * Error handling logic:
 * - Normal errors: increment error_count
 * - After 5 errors: cooldown 1 minute
 * - After 10 errors (5 more): mark as expired
 * - Checkpoint errors: immediately expired
 * - Login redirect: track separately, 2x = expired
 */
export async function cookiePoolMarkError(error?: string): Promise<void> {
    if (!lastUsedCookieId) return;
    const db = getSupabase();
    if (!db) return;
    
    const { data } = await db
        .from('admin_cookie_pool')
        .select('error_count, platform, label, status')
        .eq('id', lastUsedCookieId)
        .single();
    
    if (!data) return;
    
    const errorMsg = error?.toLowerCase() || '';
    const newErrorCount = (data.error_count || 0) + 1;
    
    // Checkpoint = immediately expired (no recovery)
    if (errorMsg.includes('checkpoint')) {
        await db
            .from('admin_cookie_pool')
            .update({
                error_count: newErrorCount,
                last_error: error || 'Checkpoint required',
                status: 'expired'
            })
            .eq('id', lastUsedCookieId);
        
        sendCookieAlert('expired', data.platform, data.label, 'Checkpoint required').catch(() => {});
        return;
    }
    
    // After 10 errors total = expired
    if (newErrorCount >= 10) {
        await db
            .from('admin_cookie_pool')
            .update({
                error_count: newErrorCount,
                last_error: error || 'Too many errors',
                status: 'expired'
            })
            .eq('id', lastUsedCookieId);
        
        sendCookieAlert('expired', data.platform, data.label, `${newErrorCount} errors - ${error || 'Too many errors'}`).catch(() => {});
        return;
    }
    
    // After 5 errors = cooldown 1 minute
    if (newErrorCount >= 5 && data.status !== 'cooldown') {
        const cooldownUntil = new Date(Date.now() + 1 * 60000).toISOString(); // 1 minute
        
        await db
            .from('admin_cookie_pool')
            .update({
                error_count: newErrorCount,
                last_error: error || 'Multiple errors',
                status: 'cooldown',
                cooldown_until: cooldownUntil
            })
            .eq('id', lastUsedCookieId);
        
        sendCookieAlert('cooldown', data.platform, data.label, `${newErrorCount} errors - 1min cooldown`).catch(() => {});
        return;
    }
    
    // Normal error - just increment count
    await db
        .from('admin_cookie_pool')
        .update({
            error_count: newErrorCount,
            last_error: error || 'Request failed'
        })
        .eq('id', lastUsedCookieId);
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
            cooldownMinutes = 1; // Default 1 minute
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
 * Mark the last used cookie as expired due to login redirect
 * 
 * Logic: 2 login redirects = expired (might be false positive on first)
 */
export async function cookiePoolMarkLoginRedirect(error?: string): Promise<void> {
    if (!lastUsedCookieId) return;
    const db = getSupabase();
    if (!db) return;
    
    // Get current state
    const { data } = await db
        .from('admin_cookie_pool')
        .select('error_count, platform, label, last_error')
        .eq('id', lastUsedCookieId)
        .single();
    
    if (!data) return;
    
    const newErrorCount = (data.error_count || 0) + 1;
    const wasLoginError = data.last_error?.includes('login') || data.last_error?.includes('Login');
    
    // Second login redirect = expired
    if (wasLoginError) {
        await db
            .from('admin_cookie_pool')
            .update({
                error_count: newErrorCount,
                last_error: error || 'Login redirect (2nd time)',
                status: 'expired'
            })
            .eq('id', lastUsedCookieId);
        
        sendCookieAlert('expired', data.platform, data.label, 'Login redirect 2x').catch(() => {});
        return;
    }
    
    // First login redirect = just record it, might be false positive
    await db
        .from('admin_cookie_pool')
        .update({
            error_count: newErrorCount,
            last_error: error || 'Login redirect (1st time)'
        })
        .eq('id', lastUsedCookieId);
}

/**
 * Mark the last used cookie as expired (for checkpoint or confirmed session death)
 */
export async function cookiePoolMarkExpired(error?: string): Promise<void> {
    if (!lastUsedCookieId) return;
    const db = getSupabase();
    if (!db) return;
    
    const errorMsg = error?.toLowerCase() || '';
    
    // Check if this is a checkpoint error - always expire immediately
    if (errorMsg.includes('checkpoint')) {
        const { data: cookieInfo } = await db
            .from('admin_cookie_pool')
            .select('platform, label')
            .eq('id', lastUsedCookieId)
            .single();
        
        await db
            .from('admin_cookie_pool')
            .update({
                status: 'expired',
                last_error: error || 'Checkpoint required'
            })
            .eq('id', lastUsedCookieId);
        
        if (cookieInfo) {
            sendCookieAlert('expired', cookieInfo.platform, cookieInfo.label, error).catch(() => {});
        }
        return;
    }
    
    // Check if this is a login redirect - use special handling
    if (errorMsg.includes('login')) {
        await cookiePoolMarkLoginRedirect(error);
        return;
    }
    
    // Other expired cases - mark directly
    const { data: cookieInfo } = await db
        .from('admin_cookie_pool')
        .select('platform, label, tier')
        .eq('id', lastUsedCookieId)
        .single();
    
    await db
        .from('admin_cookie_pool')
        .update({
            status: 'expired',
            last_error: error || 'Session expired'
        })
        .eq('id', lastUsedCookieId);
    
    if (cookieInfo) {
        sendCookieAlert('expired', cookieInfo.platform, cookieInfo.label, error).catch(() => {});
    }
}

/**
 * Get all cookies for a platform from the pool
 */
export async function cookiePoolGetByPlatform(platform: string): Promise<PooledCookie[]> {
    // Validate platform against whitelist to prevent SQL injection
    try {
        validatePlatform(platform);
    } catch (e) {
        logger.error('cookies', `Invalid platform parameter: ${platform}`);
        return [];
    }

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
    options?: { label?: string; note?: string; max_uses_per_hour?: number; tier?: CookieTier }
): Promise<PooledCookie | null> {
    // Validate platform against whitelist to prevent SQL injection
    validatePlatform(platform);

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
            max_uses_per_hour: options?.max_uses_per_hour || 60,
            tier: options?.tier || 'public'
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
    updates: Partial<Pick<PooledCookie, 'cookie' | 'label' | 'note' | 'enabled' | 'status' | 'max_uses_per_hour' | 'tier'>>
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
