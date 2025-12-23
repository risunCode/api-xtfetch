/**
 * Admin Gemini API Keys Management
 * GET: List all API keys
 * POST: Add/Update/Delete API keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import {
    getGeminiApiKeys,
    addGeminiApiKey,
    updateGeminiApiKey,
    deleteGeminiApiKey,
} from '@/lib/integrations/gemini';

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    try {
        const keys = await getGeminiApiKeys();
        
        // Mask API keys for security (show only first 10 chars)
        const maskedKeys = keys.map(k => ({
            ...k,
            key: k.key.substring(0, 10) + '...' + k.key.substring(k.key.length - 4),
            keyPreview: k.key.substring(0, 10) + '***',
        }));
        
        // Calculate stats
        const stats = {
            total: keys.length,
            enabled: keys.filter(k => k.enabled).length,
            totalUses: keys.reduce((sum, k) => sum + k.use_count, 0),
            totalErrors: keys.reduce((sum, k) => sum + k.error_count, 0),
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
    
    try {
        const body = await request.json();
        const { action, id, key, label, enabled } = body;
        
        switch (action) {
            case 'add': {
                if (!key || !label) {
                    return NextResponse.json({ success: false, error: 'key and label required' }, { status: 400 });
                }
                
                const result = await addGeminiApiKey(key, label);
                if (!result.success) {
                    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
                }
                
                return NextResponse.json({ success: true, message: 'API key added' });
            }
            
            case 'update': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
                }
                
                const updates: { label?: string; enabled?: boolean } = {};
                if (label !== undefined) updates.label = label;
                if (enabled !== undefined) updates.enabled = enabled;
                
                const result = await updateGeminiApiKey(id, updates);
                if (!result.success) {
                    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
                }
                
                return NextResponse.json({ success: true, message: 'API key updated' });
            }
            
            case 'delete': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
                }
                
                const result = await deleteGeminiApiKey(id);
                if (!result.success) {
                    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
                }
                
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
