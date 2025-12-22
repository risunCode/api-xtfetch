/**
 * Public Cookie Status API v1
 * Returns which platforms have admin cookies configured (no auth required)
 * Only returns boolean status, never exposes actual cookie values
 */

import { NextResponse } from 'next/server';
import { getAdminCookie, type CookiePlatform } from '@/lib/cookies';

const PLATFORMS: CookiePlatform[] = ['facebook', 'instagram', 'twitter', 'weibo'];

export async function GET() {
    try {
        const status: Record<string, { available: boolean; label: string }> = {};
        
        await Promise.all(
            PLATFORMS.map(async (platform) => {
                const cookie = await getAdminCookie(platform);
                status[platform] = {
                    available: !!cookie,
                    label: platform.charAt(0).toUpperCase() + platform.slice(1),
                };
            })
        );
        
        return NextResponse.json({
            success: true,
            data: status,
            meta: {
                endpoint: '/api/v1/cookies',
                timestamp: new Date().toISOString(),
            }
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            },
        });
    } catch (error) {
        console.error('[Cookies Status] Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch cookie status',
        }, { status: 500 });
    }
}

// Support OPTIONS for CORS
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
