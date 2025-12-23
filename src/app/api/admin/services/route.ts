/**
 * Admin Services API
 * GET: Get all platform configs
 * POST: Update platform config
 * PUT: Toggle maintenance mode
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import {
    serviceConfigGetAsync,
    serviceConfigUpdatePlatform,
    serviceConfigSetMaintenanceMode,
    serviceConfigSetGlobalRateLimit,
    serviceConfigSetPlaygroundEnabled,
    serviceConfigSetPlaygroundRateLimit,
    serviceConfigSetGeminiRateLimit,
    serviceConfigLoad,
    type PlatformId,
    type MaintenanceType
} from '@/lib/config';

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    try {
        await serviceConfigLoad();
        const config = await serviceConfigGetAsync();
        return NextResponse.json({ success: true, data: config });
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
        const { action, platformId, ...updates } = body;

        switch (action) {
            case 'updatePlatform': {
                if (!platformId) {
                    return NextResponse.json({ success: false, error: 'platformId required' }, { status: 400 });
                }
                const success = await serviceConfigUpdatePlatform(platformId as PlatformId, updates);
                if (!success) {
                    return NextResponse.json({ success: false, error: 'Platform not found or DB error' }, { status: 500 });
                }
                return NextResponse.json({ success: true, message: `${platformId} updated` });
            }

            case 'updateGlobal': {
                const { playgroundEnabled, playgroundRateLimit, maintenanceMode, maintenanceType, maintenanceMessage, globalRateLimit, geminiRateLimit, geminiRateWindow } = updates;
                
                if (playgroundEnabled !== undefined) await serviceConfigSetPlaygroundEnabled(playgroundEnabled);
                if (playgroundRateLimit !== undefined) await serviceConfigSetPlaygroundRateLimit(playgroundRateLimit);
                if (maintenanceMode !== undefined) await serviceConfigSetMaintenanceMode(maintenanceMode, maintenanceType as MaintenanceType, maintenanceMessage);
                if (globalRateLimit !== undefined) await serviceConfigSetGlobalRateLimit(globalRateLimit);
                if (geminiRateLimit !== undefined || geminiRateWindow !== undefined) {
                    await serviceConfigSetGeminiRateLimit(geminiRateLimit ?? 60, geminiRateWindow);
                }
                
                const config = await serviceConfigGetAsync();
                return NextResponse.json({ success: true, message: 'Global settings updated', data: config });
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

export async function PUT(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    try {
        const body = await request.json();
        const { maintenanceMode, maintenanceType, maintenanceMessage, globalRateLimit } = body;

        if (maintenanceMode !== undefined) {
            await serviceConfigSetMaintenanceMode(maintenanceMode, maintenanceType as MaintenanceType, maintenanceMessage);
        }
        if (globalRateLimit !== undefined) {
            await serviceConfigSetGlobalRateLimit(globalRateLimit);
        }

        const config = await serviceConfigGetAsync();
        return NextResponse.json({ success: true, message: 'Global settings updated', data: config });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
