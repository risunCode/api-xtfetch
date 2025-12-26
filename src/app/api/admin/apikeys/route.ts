/**
 * Admin API Keys Management
 * GET: List all keys
 * POST: Create/update/delete keys
 * 
 * Schema (Dec 2024):
 * - key_type: 'public' | 'private' (NEW)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import {
    apiKeyGetAll,
    apiKeyCreate,
    apiKeyUpdate,
    apiKeyDelete,
} from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    try {
        const keys = await apiKeyGetAll();
        
        // Map to frontend expected format
        const mappedKeys = keys.map(k => ({
            id: k.id,
            name: k.name,
            key: k.key,
            keyHash: k.hashedKey,
            keyPreview: k.key,
            keyType: k.keyType,
            enabled: k.enabled,
            rateLimit: k.rateLimit,
            createdAt: k.created,  // Frontend expects createdAt
            lastUsed: k.lastUsed,
            expiresAt: k.expiresAt,
            stats: k.stats,
        }));
        
        return NextResponse.json({ success: true, data: mappedKeys });
    } catch (error) {
        console.error('[apikeys GET] Error:', error);
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
        const { action, id, name, enabled, rateLimit, isTest, keyLength, keyFormat, validityDays, prefix, keyType } = body;

        switch (action) {
            case 'create': {
                if (!name) {
                    return NextResponse.json({ success: false, error: 'Name required' }, { status: 400 });
                }
                const result = await apiKeyCreate(name, { 
                    userId: auth.userId!, // Pass user ID from auth
                    rateLimit, 
                    expiresInDays: validityDays, 
                    isTest,
                    keyLength: keyLength || 32,
                    keyFormat: keyFormat || 'alphanumeric',
                    prefix: prefix || undefined,
                    keyType: keyType || 'public'
                });
                return NextResponse.json({ 
                    success: true, 
                    data: result.key,
                    plainKey: result.plainKey,
                    message: 'API key created. Save the key now!'
                });
            }

            case 'update': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
                }
                const success = await apiKeyUpdate(id, { name, enabled, rateLimit });
                if (!success) {
                    return NextResponse.json({ success: false, error: 'Key not found' }, { status: 404 });
                }
                return NextResponse.json({ success: true, message: 'Key updated' });
            }

            case 'delete': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
                }
                const success = await apiKeyDelete(id);
                if (!success) {
                    return NextResponse.json({ success: false, error: 'Key not found' }, { status: 404 });
                }
                return NextResponse.json({ success: true, message: 'Key deleted' });
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
