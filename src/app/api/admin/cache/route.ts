/**
 * Admin Cache Management API
 * GET: Get cache stats
 * POST: Clear cache by platform or URL
 * DELETE: Clear all cache
 * 
 * Storage: Redis (Upstash)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { isRedisAvailable, redis } from '@/lib/redis';
import { 
    cacheGetStats, 
    cacheClear, 
    cacheGenerateKey,
    cacheExtractContentId,
    cacheResetStats
} from '@/lib/cache';
import type { PlatformId } from '@/core/config';

// GET - Get cache statistics
export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const stats = await cacheGetStats();
    return NextResponse.json({ 
        success: true, 
        data: {
            ...stats,
            storage: 'redis',
            available: isRedisAvailable()
        }
    });
}

// POST - Clear cache by platform or specific URL
export async function POST(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!isRedisAvailable() || !redis) {
        return NextResponse.json({ success: false, error: 'Redis not configured' }, { status: 503 });
    }

    try {
        const body = await request.json();
        const { platform, url, resetStats } = body as { platform?: PlatformId; url?: string; resetStats?: boolean };

        // Reset stats only
        if (resetStats) {
            await cacheResetStats();
            return NextResponse.json({
                success: true,
                message: 'Cache statistics reset'
            });
        }

        // Clear specific URL cache
        if (url && platform) {
            const contentId = cacheExtractContentId(platform, url);
            if (contentId) {
                const cacheKey = cacheGenerateKey(platform, contentId);
                await redis.del(cacheKey);
                return NextResponse.json({
                    success: true,
                    message: `Cache cleared for URL`,
                    cacheKey,
                    cleared: 1
                });
            }
            return NextResponse.json({ success: false, error: 'Could not generate cache key for URL' }, { status: 400 });
        }

        // Clear by platform
        if (platform) {
            const cleared = await cacheClear(platform);
            return NextResponse.json({
                success: true,
                message: `Cache cleared for ${platform}`,
                platform,
                cleared
            });
        }

        return NextResponse.json({ success: false, error: 'Provide platform or url+platform' }, { status: 400 });
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }
}

// DELETE - Clear all cache
export async function DELETE(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!isRedisAvailable()) {
        return NextResponse.json({
            success: false,
            error: 'Redis not configured'
        }, { status: 503 });
    }

    const cleared = await cacheClear();

    return NextResponse.json({
        success: true,
        message: 'Redis cache cleared',
        cleared,
        storage: 'redis'
    });
}
