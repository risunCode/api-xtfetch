/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SESSION - Session & Token Verification
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Handles user session verification, admin authentication, and API key validation.
 * 
 * Naming Convention:
 * - auth* → Session/token verification
 * 
 * @module lib/auth/session
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT SETUP
// ═══════════════════════════════════════════════════════════════════════════════

// Support both NEXT_PUBLIC_ prefix (frontend) and non-prefixed (backend-only)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// IMPORTANT: Auth MUST use service role key, NOT anon key
// Anon key cannot verify JWT tokens properly
const authClient = supabaseUrl && supabaseServiceKey 
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

// Log auth client status on startup (only once)
if (!authClient) {
    console.error('[Auth] ⚠️ Auth client NOT initialized!');
    console.error(`[Auth] SUPABASE_URL: ${supabaseUrl ? 'SET' : 'MISSING'}`);
    console.error(`[Auth] SERVICE_ROLE_KEY: ${supabaseServiceKey ? 'SET' : 'MISSING'}`);
} else {
    console.log('[Auth] ✓ Auth client initialized');
}

// Debug flag - set to true for verbose auth logging
const DEBUG_AUTH = process.env.LOG_LEVEL === 'debug';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type UserRole = 'user' | 'admin';

export interface AuthResult {
    valid: boolean;
    userId?: string;
    email?: string;
    username?: string;
    role?: UserRole;
    error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify user session from JWT token
 */
export async function authVerifySession(request: NextRequest): Promise<AuthResult> {
    if (!authClient) {
        console.error('[Auth] Supabase not configured - SUPABASE_SERVICE_ROLE_KEY missing!');
        return { valid: false, error: 'Auth service not configured (missing service key)' };
    }
    
    const authHeader = request.headers.get('Authorization');
    
    // Always log auth attempts for debugging
    console.log(`[Auth] Header present: ${!!authHeader}, starts with Bearer: ${authHeader?.startsWith('Bearer ')}`);
    
    if (!authHeader?.startsWith('Bearer ')) {
        console.log(`[Auth] Rejected: No Bearer prefix. Header value: ${authHeader?.substring(0, 50) || 'null'}`);
        return { valid: false, error: 'No authorization token' };
    }
    
    const token = authHeader.slice(7);
    console.log(`[Auth] Token length: ${token.length}, first 20 chars: ${token.substring(0, 20)}...`);
    
    try {
        const { data: { user }, error } = await authClient.auth.getUser(token);
        
        // Always log Supabase response
        console.log(`[Auth] Supabase response - user: ${user?.id || 'null'}, error: ${error?.message || 'none'}`);
        
        if (error || !user) {
            console.error(`[Auth] Token verification failed: ${error?.message || 'No user returned'}`);
            return { valid: false, error: error?.message || 'Invalid token' };
        }
        
        if (DEBUG_AUTH) {
            console.log(`[Auth] User verified: ${user.id}`);
        }
        
        const { data: profile, error: profileError } = await authClient
            .from('users')
            .select('username, role')
            .eq('id', user.id)
            .single();
        
        if (profileError && DEBUG_AUTH) {
            console.error(`[Auth] Profile fetch error: ${profileError.message}`);
        }
        
        const role = (profile?.role as UserRole) || 'user';
        
        return {
            valid: true,
            userId: user.id,
            email: user.email,
            username: profile?.username,
            role
        };
    } catch (error) {
        console.error(`[Auth] Session verification error:`, error);
        return { valid: false, error: 'Session verification failed' };
    }
}

/**
 * Verify admin session (requires admin role)
 */
export async function authVerifyAdminSession(request: NextRequest): Promise<AuthResult> {
    const result = await authVerifySession(request);
    
    if (!result.valid) return result;
    
    if (result.role !== 'admin') {
        return { 
            valid: false, 
            error: 'Admin access required',
            userId: result.userId,
            email: result.email,
            role: result.role
        };
    }
    
    return result;
}

/**
 * Verify admin token (simplified response)
 */
export async function authVerifyAdminToken(request: NextRequest): Promise<{ valid: boolean; username?: string; error?: string }> {
    const result = await authVerifyAdminSession(request);
    return {
        valid: result.valid,
        username: result.username || result.email || 'admin',
        error: result.error
    };
}

/**
 * Verify API key from database (simple validation)
 */
export async function authVerifyApiKey(apiKey: string): Promise<{ valid: boolean; rateLimit?: number; error?: string }> {
    if (!authClient) {
        console.error('[Auth] Supabase not configured');
        return { valid: false, error: 'Auth service not configured' };
    }

    try {
        const { data: keyData, error } = await authClient
            .from('api_keys')
            .select('id, rate_limit, is_active, expires_at')
            .eq('key_hash', apiKey)
            .single();

        if (error || !keyData) {
            return { valid: false, error: 'Invalid API key' };
        }

        if (!keyData.is_active) {
            return { valid: false, error: 'API key is disabled' };
        }

        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            return { valid: false, error: 'API key has expired' };
        }

        return {
            valid: true,
            rateLimit: keyData.rate_limit || 100,
        };
    } catch (error) {
        console.error(`[Auth] API key verification error:`, error);
        return { valid: false, error: 'API key verification failed' };
    }
}
