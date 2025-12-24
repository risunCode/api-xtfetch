/**
 * Admin Services API
 * GET: Get all platform configs (from service_config table + in-memory config)
 * POST: Update platform config
 * PUT: Toggle maintenance mode
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabaseAdmin, supabase } from '@/lib/database';
import {
    serviceConfigGetAsync,
    serviceConfigUpdatePlatform,
    serviceConfigSetMaintenanceMode,
    serviceConfigSetGlobalRateLimit,
    serviceConfigSetPlaygroundEnabled,
    serviceConfigSetPlaygroundRateLimit,
    serviceConfigSetGeminiRateLimit,
    serviceConfigLoad,
    serviceConfigLoadFromDB,
    serviceConfigUpdateInDB,
    serviceConfigCreateInDB,
    type PlatformId,
    type MaintenanceType,
    type ServiceConfigDB
} from '@/core/config';

// Get the database client (prefer admin client for write operations)
const getDb = () => supabaseAdmin || supabase;

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    try {
        // ALWAYS force refresh from DB for admin endpoint
        await serviceConfigLoad(true);
        const inMemoryConfig = await serviceConfigGetAsync();
        
        // Load database-backed service configs
        const dbConfigs = await serviceConfigLoadFromDB();
        
        // Load platform stats from download_stats (last 7 days)
        const db = getDb();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        let platformStats: Record<string, { totalRequests: number; successCount: number; errorCount: number }> = {};
        
        if (db) {
            const { data: statsData } = await db
                .from('download_stats')
                .select('platform, total_requests, success_count, error_count')
                .gte('date', sevenDaysAgo.toISOString().split('T')[0]);
            
            if (statsData) {
                // Aggregate by platform
                for (const row of statsData) {
                    if (!platformStats[row.platform]) {
                        platformStats[row.platform] = { totalRequests: 0, successCount: 0, errorCount: 0 };
                    }
                    platformStats[row.platform].totalRequests += row.total_requests || 0;
                    platformStats[row.platform].successCount += row.success_count || 0;
                    platformStats[row.platform].errorCount += row.error_count || 0;
                }
            }
        }
        
        // Merge database configs with in-memory configs for complete view
        const mergedPlatforms: Record<string, unknown> = {};
        
        // Start with in-memory platforms
        for (const [platformId, platformConfig] of Object.entries(inMemoryConfig.platforms)) {
            const dbConfig = dbConfigs.find(c => c.platform === platformId);
            const stats = platformStats[platformId] || { totalRequests: 0, successCount: 0, errorCount: 0 };
            
            mergedPlatforms[platformId] = {
                ...platformConfig,
                // Override with database values if available
                // Note: No maintenance column - global maintenance is in system_config.service_global
                ...(dbConfig && {
                    enabled: dbConfig.enabled,
                    rateLimit: dbConfig.rate_limit,
                    requireCookie: dbConfig.require_cookie,
                    requireAuth: dbConfig.require_auth,
                    priority: dbConfig.priority,
                    healthStatus: dbConfig.health_status,
                    lastCheck: dbConfig.last_check,
                    dbId: dbConfig.id,
                }),
                // Add stats
                stats,
            };
        }
        
        return NextResponse.json({ 
            success: true, 
            data: {
                ...inMemoryConfig,
                platforms: mergedPlatforms,
            },
            dbConfigs // Also return raw DB configs for reference
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
        const { action, platformId, ...updates } = body;

        switch (action) {
            case 'updatePlatform': {
                if (!platformId) {
                    return NextResponse.json({ success: false, error: 'platformId required' }, { status: 400 });
                }
                
                // Update in-memory config
                const inMemorySuccess = await serviceConfigUpdatePlatform(platformId as PlatformId, updates);
                
                // Also update database config if it exists
                // Note: No maintenance column - global maintenance is in system_config.service_global
                const dbUpdates: Partial<ServiceConfigDB> = {};
                if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
                if (updates.rateLimit !== undefined) dbUpdates.rate_limit = updates.rateLimit;
                if (updates.requireCookie !== undefined) dbUpdates.require_cookie = updates.requireCookie;
                if (updates.requireAuth !== undefined) dbUpdates.require_auth = updates.requireAuth;
                if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
                if (updates.healthStatus !== undefined) dbUpdates.health_status = updates.healthStatus;
                
                if (Object.keys(dbUpdates).length > 0) {
                    await serviceConfigUpdateInDB(platformId, dbUpdates);
                }
                
                if (!inMemorySuccess) {
                    return NextResponse.json({ success: false, error: 'Platform not found or DB error' }, { status: 500 });
                }
                return NextResponse.json({ success: true, message: `${platformId} updated` });
            }

            case 'updatePlatformDB': {
                // Direct database update for service_config table
                if (!platformId) {
                    return NextResponse.json({ success: false, error: 'platformId required' }, { status: 400 });
                }
                
                // Note: No maintenance column - global maintenance is in system_config.service_global
                const dbUpdates: Partial<ServiceConfigDB> = {};
                if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
                if (updates.rate_limit !== undefined) dbUpdates.rate_limit = updates.rate_limit;
                if (updates.require_cookie !== undefined) dbUpdates.require_cookie = updates.require_cookie;
                if (updates.require_auth !== undefined) dbUpdates.require_auth = updates.require_auth;
                if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
                if (updates.health_status !== undefined) dbUpdates.health_status = updates.health_status;
                
                const success = await serviceConfigUpdateInDB(platformId, dbUpdates);
                if (!success) {
                    return NextResponse.json({ success: false, error: 'Failed to update platform in database' }, { status: 500 });
                }
                
                return NextResponse.json({ success: true, message: `${platformId} updated in database` });
            }

            case 'createPlatformDB': {
                // Create new platform config in database
                if (!platformId) {
                    return NextResponse.json({ success: false, error: 'platformId required' }, { status: 400 });
                }
                
                // Note: No maintenance column - global maintenance is in system_config.service_global
                const newConfig = await serviceConfigCreateInDB(platformId, {
                    enabled: updates.enabled ?? true,
                    rate_limit: updates.rate_limit ?? 60,
                    require_cookie: updates.require_cookie ?? false,
                    require_auth: updates.require_auth ?? false,
                    priority: updates.priority ?? 5,
                    health_status: updates.health_status ?? 'unknown'
                });
                
                if (!newConfig) {
                    return NextResponse.json({ success: false, error: 'Failed to create platform config' }, { status: 500 });
                }
                
                return NextResponse.json({ success: true, data: newConfig, message: `${platformId} created in database` });
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
                return NextResponse.json({ success: false, error: 'Invalid action. Use: updatePlatform, updatePlatformDB, createPlatformDB, updateGlobal' }, { status: 400 });
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
