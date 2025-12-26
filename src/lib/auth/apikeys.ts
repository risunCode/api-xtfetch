/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * API KEYS - API Key Management
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Handles API key CRUD operations, validation, and rate limiting.
 * 
 * Naming Convention:
 * - apiKey* → API key management
 * 
 * @module lib/auth/apikeys
 */

import crypto from 'crypto';
import { supabase, supabaseAdmin } from '@/lib/database/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const getWriteClient = () => supabaseAdmin || supabase;
const getReadClient = () => supabase;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ApiKeyType = 'public' | 'private';

export interface ApiKey {
    id: string;
    name: string;
    key: string;
    hashedKey: string;
    keyType: ApiKeyType;
    enabled: boolean;
    rateLimit: number;
    created: string;
    lastUsed: string | null;
    expiresAt: string | null;
    stats: { totalRequests: number; successCount: number; errorCount: number };
}

export interface ApiKeyValidation {
    valid: boolean;
    rateLimit?: number;
    error?: string;
}

export interface ApiKeyValidateResult {
    valid: boolean;
    error?: string;
    key?: ApiKey;
    remaining?: number;
}

type KeyFormat = 'alphanumeric' | 'hex' | 'base64';

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_RATE_LIMIT_ENTRIES = 1000;
const CLEANUP_INTERVAL = 60000; // 1 minute
let lastCleanup = Date.now();
let keysCache: ApiKey[] = [];
let lastCacheTime = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cleanup expired rate limit entries with periodic sweep
 * Prevents memory leaks by removing stale entries and enforcing max size
 */
function cleanupRateLimits(): void {
    const now = Date.now();

    // Only cleanup every minute to avoid performance overhead
    if (now - lastCleanup < CLEANUP_INTERVAL) {
        return;
    }
    lastCleanup = now;

    // Remove expired entries
    for (const [key, value] of rateLimitMap.entries()) {
        if (value.resetAt < now) {
            rateLimitMap.delete(key);
        }
    }

    // If still too many entries, remove oldest ones
    if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
        const entries = Array.from(rateLimitMap.entries())
            .sort((a, b) => a[1].resetAt - b[1].resetAt);

        const toRemove = entries.slice(0, rateLimitMap.size - MAX_RATE_LIMIT_ENTRIES);
        toRemove.forEach(([key]) => rateLimitMap.delete(key));
    }
}

async function getCacheTTL(): Promise<number> {
    try {
        const { sysConfigCacheTtlApikeys } = await import('@/lib/config');
        return sysConfigCacheTtlApikeys();
    } catch {
        return 10000;
    }
}

function generateKeyId(): string {
    return crypto.randomBytes(8).toString('hex');
}

function generateApiKeyString(prefix: string = 'xtf_live', length: number = 32, format: KeyFormat = 'alphanumeric'): string {
    let random: string;
    switch (format) {
        case 'hex':
            random = crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
            break;
        case 'base64':
            random = crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64url').slice(0, length);
            break;
        default:
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            const bytes = crypto.randomBytes(length);
            random = Array.from(bytes).map(b => chars[b % chars.length]).join('');
    }
    const cleanPrefix = prefix.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `${cleanPrefix}_${random}`;
}

function hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
}

async function loadKeysFromDB(): Promise<ApiKey[]> {
    // Use admin client for API keys (RLS blocks anon access)
    const db = getWriteClient();
    if (!db) return [];
    try {
        const { data, error } = await db.from('api_keys').select('*').order('created_at', { ascending: false });
        if (error || !data) {
            console.error('[loadKeysFromDB] Error:', error?.message);
            return [];
        }
        return data.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            name: row.name as string,
            key: row.key_preview as string,
            hashedKey: row.key_hash as string,
            keyType: (row.key_type as ApiKeyType) || 'public',
            enabled: row.enabled as boolean,
            rateLimit: row.rate_limit as number,
            created: row.created_at as string,
            lastUsed: row.last_used as string | null,
            expiresAt: row.expires_at as string | null,
            stats: {
                totalRequests: (row.total_requests as number) || 0,
                successCount: (row.success_count as number) || 0,
                errorCount: (row.error_count as number) || 0
            }
        }));
    } catch (e) {
        console.error('[loadKeysFromDB] Exception:', e);
        return [];
    }
}

async function ensureFreshCache(): Promise<void> {
    const cacheTTL = await getCacheTTL();
    if (Date.now() - lastCacheTime > cacheTTL) {
        keysCache = await loadKeysFromDB();
        lastCacheTime = Date.now();
    }
}

function checkKeyRateLimit(keyId: string, limit: number): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const windowMs = 60 * 1000;
    
    // Periodic cleanup (runs at most once per minute)
    cleanupRateLimits();
    
    const entry = rateLimitMap.get(keyId);
    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(keyId, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, resetIn: windowMs };
    }
    if (entry.count >= limit) {
        return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
    }
    entry.count++;
    return { allowed: true, remaining: limit - entry.count, resetIn: entry.resetAt - now };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API KEY CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new API key
 */
export async function apiKeyCreate(
    name: string,
    options?: {
        userId?: string;  // Required for DB insert
        rateLimit?: number;
        expiresInDays?: number;
        isTest?: boolean;
        keyLength?: number;
        keyFormat?: KeyFormat;
        prefix?: string;
        keyType?: ApiKeyType;
    }
): Promise<{ key: ApiKey; plainKey: string }> {
    const db = getWriteClient();
    const id = generateKeyId();
    const keyLength = Math.max(16, Math.min(64, options?.keyLength || 32));
    let prefix = options?.prefix?.trim();
    if (!prefix) prefix = options?.isTest ? 'xtf_test' : 'xtf_live';
    const plainKey = generateApiKeyString(prefix, keyLength, options?.keyFormat || 'alphanumeric');
    const hashedKey = hashKey(plainKey);
    const keyPreview = plainKey.slice(0, 12) + '...' + plainKey.slice(-4);
    const expiresAt = options?.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;
    const keyType: ApiKeyType = options?.keyType || 'public';

    if (db) {
        const { error } = await db.from('api_keys').insert({
            id,
            user_id: options?.userId,  // Required field!
            name,
            key_hash: hashedKey,
            key_preview: keyPreview,
            key_type: keyType,
            enabled: true,
            rate_limit: options?.rateLimit || 60,
            expires_at: expiresAt,
            total_requests: 0,
            success_count: 0,
            error_count: 0
        });
        if (error) {
            console.error('[apiKeyCreate] Insert error:', error.message);
            throw new Error(error.message);
        }
    }
    lastCacheTime = 0;
    return {
        key: {
            id,
            name,
            key: keyPreview,
            hashedKey,
            keyType,
            enabled: true,
            rateLimit: options?.rateLimit || 60,
            created: new Date().toISOString(),
            lastUsed: null,
            expiresAt,
            stats: { totalRequests: 0, successCount: 0, errorCount: 0 }
        },
        plainKey
    };
}

/**
 * Get API key by ID
 */
export async function apiKeyGet(id: string): Promise<ApiKey | null> {
    await ensureFreshCache();
    return keysCache.find(k => k.id === id) || null;
}

/**
 * Get all API keys
 */
export async function apiKeyGetAll(): Promise<ApiKey[]> {
    await ensureFreshCache();
    return keysCache;
}

/**
 * Update API key
 */
export async function apiKeyUpdate(
    id: string,
    updates: Partial<Pick<ApiKey, 'name' | 'enabled' | 'rateLimit'>>
): Promise<boolean> {
    const db = getWriteClient();
    if (!db) return false;
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
    if (updates.rateLimit !== undefined) updateData.rate_limit = Math.max(1, Math.min(1000, updates.rateLimit));
    const { error } = await db.from('api_keys').update(updateData).eq('id', id);
    if (error) return false;
    lastCacheTime = 0;
    return true;
}

/**
 * Delete API key
 */
export async function apiKeyDelete(id: string): Promise<boolean> {
    const db = getWriteClient();
    if (!db) return false;
    const { error } = await db.from('api_keys').delete().eq('id', id);
    if (error) return false;
    lastCacheTime = 0;
    return true;
}

/**
 * Validate API key (full validation with rate limiting)
 * NOTE: Uses admin client because api_keys table has RLS that blocks anon access
 */
export async function apiKeyValidate(plainKey: string): Promise<ApiKeyValidateResult> {
    if (!plainKey || plainKey.length < 10 || !plainKey.includes('_')) {
        return { valid: false, error: 'Invalid API key format' };
    }
    const hashedInput = hashKey(plainKey);
    // Must use admin client - api_keys table has RLS blocking anon access
    const db = getWriteClient();
    if (!db) return { valid: false, error: 'Database unavailable' };
    
    const { data, error } = await db.from('api_keys').select('*').eq('key_hash', hashedInput).single();
    if (error || !data) return { valid: false, error: 'Invalid API key' };
    if (!data.enabled) return { valid: false, error: 'API key is disabled' };
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return { valid: false, error: 'API key has expired' };
    }
    
    const rateCheck = checkKeyRateLimit(data.id, data.rate_limit);
    if (!rateCheck.allowed) {
        return {
            valid: false,
            error: `Rate limit exceeded. Try again in ${Math.ceil(rateCheck.resetIn / 1000)}s`,
            remaining: 0
        };
    }
    
    getWriteClient()?.from('api_keys').update({ last_used: new Date().toISOString() }).eq('id', data.id);
    
    return {
        valid: true,
        key: {
            id: data.id,
            name: data.name,
            key: data.key_preview,
            hashedKey: data.key_hash,
            keyType: (data.key_type as ApiKeyType) || 'public',
            enabled: data.enabled,
            rateLimit: data.rate_limit,
            created: data.created_at,
            lastUsed: new Date().toISOString(),
            expiresAt: data.expires_at,
            stats: {
                totalRequests: data.total_requests,
                successCount: data.success_count,
                errorCount: data.error_count
            }
        },
        remaining: rateCheck.remaining
    };
}

/**
 * Record API key usage
 */
export async function apiKeyRecordUsage(keyId: string, success: boolean): Promise<void> {
    const db = getWriteClient();
    if (!db) return;
    if (success) {
        await db.rpc('increment_api_key_success', { key_id: keyId });
    } else {
        await db.rpc('increment_api_key_error', { key_id: keyId });
    }
}

/**
 * Extract API key from request
 */
export function apiKeyExtract(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    const apiKeyHeader = request.headers.get('X-API-Key');
    if (apiKeyHeader) return apiKeyHeader;
    const url = new URL(request.url);
    return url.searchParams.get('key') || url.searchParams.get('api_key');
}
