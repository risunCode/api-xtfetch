/**
 * Free Homepage API v1 - Public Services
 * POST /api/v1/publicservices
 * 
 * Uses admin cookie pool for all users (no user cookie needed)
 * 
 * Cache Flow:
 * 1. Quick cache check (content ID based, no HTTP)
 * 2. URL resolution (only if cache miss)
 * 3. Cache check with resolved URL
 * 4. Scrape (only if cache miss)
 * 5. Cache result
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/core/scrapers';
import { prepareUrl, prepareUrlSync } from '@/lib/url';
import { logger } from '@/lib/services/helper/logger';
import { cookiePoolGetRotating } from '@/lib/cookies';
import { platformDetect } from '@/lib/config';
import { 
    cacheGetQuick, 
    cacheGet, 
    cacheSet, 
    cacheSetAlias,
    cacheExtractContentId,
    cacheIsShortUrl,
    type ContentType
} from '@/lib/cache';
import type { ScraperResult } from '@/core/scrapers/types';

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    try {
        const body = await request.json();
        const { url } = body;

        // Validate required parameters
        if (!url) {
            return NextResponse.json(
                { success: false, error: 'URL is required' },
                { status: 400 }
            );
        }

        // Step 1: Quick platform detection (no HTTP)
        const quickParse = prepareUrlSync(url);
        const detectedPlatform = quickParse.platform || platformDetect(url);
        
        // Step 2: Quick cache check BEFORE URL resolution (fastest path)
        if (detectedPlatform) {
            const quickCache = await cacheGetQuick<ScraperResult>(detectedPlatform, url);
            if (quickCache.hit && quickCache.data?.success) {
                logger.cache(detectedPlatform, true);
                const responseTime = Date.now() - startTime;
                return NextResponse.json({
                    success: true,
                    data: quickCache.data.data ? { ...quickCache.data.data, responseTime } : quickCache.data.data,
                    cached: true,
                    cacheSource: quickCache.source,
                    meta: {
                        tier: 'free',
                        platform: detectedPlatform,
                        rateLimit: '10 requests per minute',
                        endpoint: '/api/v1/publicservices'
                    }
                });
            }
        }

        // Step 3: URL resolution (only if cache miss)
        const urlResult = await prepareUrl(url);
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return NextResponse.json(
                { success: false, error: urlResult.assessment.errorMessage || 'Invalid URL or unsupported platform' },
                { status: 400 }
            );
        }

        // Step 4: Check cache with resolved URL (if URL was resolved)
        if (urlResult.wasResolved) {
            const resolvedCache = await cacheGet<ScraperResult>(urlResult.platform, urlResult.resolvedUrl);
            if (resolvedCache.hit && resolvedCache.data?.success) {
                logger.cache(urlResult.platform, true);
                
                // Backfill alias for short URL → content ID mapping
                const contentId = cacheExtractContentId(urlResult.platform, urlResult.resolvedUrl);
                if (contentId && cacheIsShortUrl(url)) {
                    await cacheSetAlias(url, urlResult.platform, contentId);
                }
                
                const responseTime = Date.now() - startTime;
                return NextResponse.json({
                    success: true,
                    data: resolvedCache.data.data ? { ...resolvedCache.data.data, responseTime } : resolvedCache.data.data,
                    cached: true,
                    cacheSource: resolvedCache.source,
                    meta: {
                        tier: 'free',
                        platform: urlResult.platform,
                        rateLimit: '10 requests per minute',
                        endpoint: '/api/v1/publicservices'
                    }
                });
            }
        }

        // Step 5: Get cookie from admin pool for this platform
        const poolCookie = await cookiePoolGetRotating(urlResult.platform);
        
        // Step 6: Run scraper (cache miss)
        logger.cache(urlResult.platform, false);
        const result = await runScraper(urlResult.platform, urlResult.resolvedUrl, {
            cookie: poolCookie || undefined,
            skipCache: true // Scrapers no longer handle cache
        });

        // Step 7: Cache successful result
        if (result.success && result.data) {
            const contentType = (result.data.type as ContentType) || 'unknown';
            await cacheSet(urlResult.platform, urlResult.resolvedUrl, result, contentType);
            
            // Set alias for short URLs
            const contentId = cacheExtractContentId(urlResult.platform, urlResult.resolvedUrl);
            if (contentId && cacheIsShortUrl(url)) {
                await cacheSetAlias(url, urlResult.platform, contentId);
            }
        }

        // Log result
        if (result.success) {
            logger.complete(urlResult.platform, Date.now() - startTime);
        } else {
            logger.error(urlResult.platform, result.error || 'Unknown error');
        }

        const responseTime = Date.now() - startTime;

        return NextResponse.json({
            success: result.success,
            data: result.data ? { ...result.data, responseTime } : result.data,
            error: result.error,
            errorCode: result.errorCode,
            meta: {
                tier: 'free',
                platform: urlResult.platform,
                rateLimit: '10 requests per minute',
                endpoint: '/api/v1/publicservices'
            }
        });

    } catch (error) {
        console.error('[API v1 PublicServices] Error:', error);

        return NextResponse.json(
            { 
                success: false, 
                error: error instanceof Error ? error.message : 'Internal server error',
                meta: {
                    tier: 'free',
                    endpoint: '/api/v1/publicservices'
                }
            },
            { status: 500 }
        );
    }
}

// Support OPTIONS for CORS
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
