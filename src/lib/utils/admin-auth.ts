/**
 * Admin Authentication
 * Supabase session-based auth for admin panel
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl && supabaseServiceKey 
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

export type UserRole = 'user' | 'admin';

interface AuthResult {
    valid: boolean;
    userId?: string;
    email?: string;
    username?: string;
    role?: UserRole;
    error?: string;
}

export async function verifySession(request: NextRequest): Promise<AuthResult> {
    if (!supabase) {
        console.error('[Auth] Supabase not configured');
        return { valid: false, error: 'Auth service not configured' };
    }
    
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return { valid: false, error: 'No authorization token' };
    }
    
    const token = authHeader.slice(7);
    
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return { valid: false, error: error?.message || 'Invalid token' };
        }
        
        const { data: profile } = await supabase
            .from('users')
            .select('username, role')
            .eq('id', user.id)
            .single();
        
        const role = (profile?.role as UserRole) || 'user';
        
        return {
            valid: true,
            userId: user.id,
            email: user.email,
            username: profile?.username,
            role
        };
    } catch (error) {
        console.error('[Auth] Session verification error:', error);
        return { valid: false, error: 'Session verification failed' };
    }
}

export async function verifyAdminSession(request: NextRequest): Promise<AuthResult> {
    const result = await verifySession(request);
    
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

export async function verifyAdminToken(request: NextRequest): Promise<{ valid: boolean; username?: string; error?: string }> {
    const result = await verifyAdminSession(request);
    return {
        valid: result.valid,
        username: result.username || result.email || 'admin',
        error: result.error
    };
}

interface ApiKeyValidation {
    valid: boolean;
    rateLimit?: number;
    error?: string;
}

export async function verifyApiKey(apiKey: string): Promise<ApiKeyValidation> {
    if (!supabase) {
        console.error('[Auth] Supabase not configured');
        return { valid: false, error: 'Auth service not configured' };
    }

    try {
        const { data: keyData, error } = await supabase
            .from('api_keys')
            .select('id, rate_limit, is_active, expires_at')
            .eq('key_hash', apiKey) // In production, this should be hashed
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
        console.error('[Auth] API key verification error:', error);
        return { valid: false, error: 'API key verification failed' };
    }
}
