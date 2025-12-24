/**
 * Admin AI API Keys Management
 * GET: List all AI API keys (Gemini, OpenAI, Anthropic, etc.)
 * POST: Add/Update/Delete AI API keys
 * PATCH: Update AI key (enable/disable)
 * DELETE: Delete AI key
 * 
 * Schema (Dec 2024):
 * - Table: ai_api_keys (replaces gemini_api_keys)
 * - provider: 'gemini' | 'openai' | 'anthropic' | 'other'
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabase } from '@/lib/supabase';

// AI Provider type
type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'other';

// AI API Key interface
interface AiApiKey {
    id: string;
    provider: AiProvider;
    key: string;
    label: string;
    enabled: boolean;
    use_count: number;
    error_count: number;
    last_used_at: string | null;
    last_error: string | null;
    rate_limit_reset: string | null;
    created_at: string;
    updated_at: string;
}

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const provider = searchParams.get('provider'); // Optional filter by provider

        let query = supabase
            .from('ai_api_keys')
            .select('*')
            .order('created_at', { ascending: false });

        if (provider) {
            query = query.eq('provider', provider);
        }

        const { data: keys, error } = await query;
        if (error) throw error;
        
        // Mask API keys for security (show only first 10 chars)
        const maskedKeys = (keys || []).map((k: AiApiKey) => ({
            ...k,
            key: k.key.substring(0, 10) + '...' + k.key.substring(k.key.length - 4),
            keyPreview: k.key.substring(0, 10) + '***',
        }));
        
        // Calculate stats by provider
        const stats = {
            total: keys?.length || 0,
            enabled: keys?.filter((k: AiApiKey) => k.enabled).length || 0,
            totalUses: keys?.reduce((sum: number, k: AiApiKey) => sum + k.use_count, 0) || 0,
            totalErrors: keys?.reduce((sum: number, k: AiApiKey) => sum + k.error_count, 0) || 0,
            byProvider: {
                gemini: keys?.filter((k: AiApiKey) => k.provider === 'gemini').length || 0,
                openai: keys?.filter((k: AiApiKey) => k.provider === 'openai').length || 0,
                anthropic: keys?.filter((k: AiApiKey) => k.provider === 'anthropic').length || 0,
                other: keys?.filter((k: AiApiKey) => k.provider === 'other').length || 0,
            }
        };
        
        return NextResponse.json({
            success: true,
            data: {
                keys: maskedKeys,
                stats,
            }
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { action, id, key, label, name, enabled, provider } = body;
        
        // Support both 'label' and 'name' for compatibility
        const keyLabel = label || name;
        // Default provider to 'gemini' for backward compatibility
        const keyProvider: AiProvider = provider || 'gemini';
        
        switch (action) {
            case 'add':
            case 'create': {
                if (!key || !keyLabel) {
                    return NextResponse.json({ success: false, error: 'key and label/name required' }, { status: 400 });
                }
                
                // Check for duplicate key
                const { data: existing } = await supabase
                    .from('ai_api_keys')
                    .select('id')
                    .eq('key', key)
                    .single();
                
                if (existing) {
                    return NextResponse.json({ success: false, error: 'API key already exists' }, { status: 400 });
                }
                
                const { error } = await supabase.from('ai_api_keys').insert({
                    provider: keyProvider,
                    key,
                    label: keyLabel,
                    enabled: true,
                    use_count: 0,
                    error_count: 0
                });
                
                if (error) throw error;
                
                return NextResponse.json({ success: true, message: `${keyProvider.toUpperCase()} API key added` });
            }
            
            case 'update': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
                }
                
                const updates: Partial<AiApiKey> = {};
                if (keyLabel !== undefined) updates.label = keyLabel;
                if (enabled !== undefined) updates.enabled = enabled;
                if (provider !== undefined) updates.provider = provider;
                
                const { error } = await supabase
                    .from('ai_api_keys')
                    .update(updates)
                    .eq('id', id);
                
                if (error) throw error;
                
                return NextResponse.json({ success: true, message: 'API key updated' });
            }
            
            case 'delete': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
                }
                
                const { error } = await supabase
                    .from('ai_api_keys')
                    .delete()
                    .eq('id', id);
                
                if (error) throw error;
                
                return NextResponse.json({ success: true, message: 'API key deleted' });
            }
            
            default:
                return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Handle PATCH for toggle (frontend uses PATCH for updates)
export async function PATCH(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { id, enabled, label, name, provider } = body;
        
        if (!id) {
            return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
        }
        
        const updates: Partial<AiApiKey> = {};
        if (label !== undefined) updates.label = label;
        if (name !== undefined) updates.label = name;
        if (enabled !== undefined) updates.enabled = enabled;
        if (provider !== undefined) updates.provider = provider;
        
        const { error } = await supabase
            .from('ai_api_keys')
            .update(updates)
            .eq('id', id);
        
        if (error) throw error;
        
        return NextResponse.json({ success: true, message: 'API key updated' });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Handle DELETE
export async function DELETE(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { id } = body;
        
        if (!id) {
            return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
        }
        
        const { error } = await supabase
            .from('ai_api_keys')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        return NextResponse.json({ success: true, message: 'API key deleted' });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
