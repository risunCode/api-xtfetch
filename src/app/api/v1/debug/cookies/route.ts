/**
 * Debug Cookie Status API
 * GET /api/v1/debug/cookies
 * 
 * Returns cookie pool status for all platforms
 * NO AUTH REQUIRED - for debugging only
 */

import { NextResponse } from 'next/server';
import { getCookiePoolStats, getCookiesByPlatform } from '@/lib/cookies';

const PLATFORMS = ['facebook', 'instagram', 'twitter', 'weibo', 'tiktok', 'youtube'];

export async function GET() {
    try {
        // Get pool stats
        const poolStats = await getCookiePoolStats();
        
        // Get detailed info per platform
        const details: Record<string, {
            total: number;
            healthy: number;
            cooldown: number;
            expired: number;
            disabled: number;
            cookies: Array<{
                id: string;
                label: string | null;
                status: string;
                enabled: boolean;
                useCount: number;
                successCount: number;
                errorCount: number;
                lastUsed: string | null;
                lastError: string | null;
            }>;
        }> = {};

        for (const platform of PLATFORMS) {
            const cookies = await getCookiesByPlatform(platform);
            const stat = poolStats.find(s => s.platform === platform);
            
            details[platform] = {
                total: stat?.total || cookies.length,
                healthy: stat?.healthy_count || cookies.filter(c => c.status === 'healthy' && c.enabled).length,
                cooldown: stat?.cooldown_count || cookies.filter(c => c.status === 'cooldown').length,
                expired: stat?.expired_count || cookies.filter(c => c.status === 'expired').length,
                disabled: stat?.disabled_count || cookies.filter(c => !c.enabled).length,
                cookies: cookies.map(c => ({
                    id: c.id,
                    label: c.label,
                    status: c.status,
                    enabled: c.enabled,
                    useCount: c.use_count,
                    successCount: c.success_count,
                    errorCount: c.error_count,
                    lastUsed: c.last_used_at,
                    lastError: c.last_error,
                })),
            };
        }

        // Summary
        const summary = {
            totalCookies: Object.values(details).reduce((sum, d) => sum + d.total, 0),
            healthyCookies: Object.values(details).reduce((sum, d) => sum + d.healthy, 0),
            platformsWithCookies: Object.entries(details).filter(([, d]) => d.total > 0).map(([p]) => p),
            platformsWithoutCookies: Object.entries(details).filter(([, d]) => d.total === 0).map(([p]) => p),
        };

        return NextResponse.json({
            success: true,
            summary,
            details,
            meta: {
                endpoint: '/api/v1/debug/cookies',
                timestamp: new Date().toISOString(),
                note: 'Debug endpoint - shows cookie pool status',
            },
        });
    } catch (error) {
        console.error('[Debug Cookies] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch cookie status',
        }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
