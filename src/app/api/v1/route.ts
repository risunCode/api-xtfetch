/**
 * Premium API v1 - Main Download Endpoint
 * GET /api/v1?key={API_KEY}&url={URL}
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
import { authVerifyApiKey } from '@/lib/auth';
import { platformDetect } from '@/core/config';
import { cookiePoolGetRotating } from '@/lib/cookies';
import { utilFetchFilesizes } from '@/lib/utils';
import { recordDownloadStat, getCountryFromHeaders } from '@/lib/supabase';
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

// API key validation using Supabase
async function validateApiKey(apiKey: string) {
    const result = await authVerifyApiKey(apiKey);
    return {
        valid: result.valid,
        rateLimit: result.rateLimit || 100,
        error: result.error
    };
}

export async function GET(request: NextRequest) {
    const startTime = Date.now();
    try {
        const searchParams = request.nextUrl.searchParams;
        const apiKey = searchParams.get('key');
        const url = searchParams.get('url');

        // Validate required parameters
        if (!apiKey) {
            return NextResponse.json(
                { success: false, error: 'API key is required. Get yours at: https://xt-fetch.vercel.app/admin/access' },
                { status: 401 }
            );
        }

        if (!url) {
            return NextResponse.json(
                { success: false, error: 'URL parameter is required' },
                { status: 400 }
            );
        }

        // Verify API key
        const keyValidation = await validateApiKey(apiKey);
        if (!keyValidation.valid) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: keyValidation.error || 'Invalid or expired API key',
                    meta: {
                        tier: 'premium',
                        endpoint: '/api/v1'
                    }
                },
                { status: 401 }
            );
        }

        // Step 1: Quick platform detection (no HTTP)
        const quickParse = prepareUrlSync(url);
        const detectedPlatform = quickParse.platform || platformDetect(url);
        
        // Log incoming request
        if (detectedPlatform) {
            logger.request(detectedPlatform, 'api');
        }
        
        // Step 2: Quick cache check BEFORE URL resolution (fastest path)
        if (detectedPlatform) {
            let quickCache: { hit: boolean; data?: ScraperResult; source?: string } = { hit: false, data: undefined };
            try {
                quickCache = await cacheGetQuick<ScraperResult>(detectedPlatform, url);
            } catch (cacheError) {
                logger.warn('cache', `Cache read failed, proceeding without cache: ${cacheError}`);
            }
            if (quickCache.hit && quickCache.data?.success) {
                logger.cache(detectedPlatform, true);
                const responseTime = Date.now() - startTime;
                
                // Track cache hit as successful request
                const country = getCountryFromHeaders(request.headers);
                recordDownloadStat(detectedPlatform, true, responseTime, country, 'api').catch(() => {});
                
                return NextResponse.json({
                    success: true,
                    data: quickCache.data.data ? { ...quickCache.data.data, responseTime } : quickCache.data.data,
                    cached: true,
                    cacheSource: quickCache.source,
                    meta: {
                        tier: 'premium',
                        platform: detectedPlatform,
                        apiKey: apiKey.substring(0, 8) + '...',
                        rateLimit: keyValidation.rateLimit,
                        endpoint: '/api/v1'
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
            let resolvedCache: { hit: boolean; data?: ScraperResult; source?: string } = { hit: false, data: undefined };
            try {
                resolvedCache = await cacheGet<ScraperResult>(urlResult.platform, urlResult.resolvedUrl);
            } catch (cacheError) {
                logger.warn('cache', `Cache read failed for resolved URL, proceeding without cache: ${cacheError}`);
            }
            if (resolvedCache.hit && resolvedCache.data?.success) {
                logger.cache(urlResult.platform, true);
                
                // Backfill alias for short URL → content ID mapping
                const contentId = cacheExtractContentId(urlResult.platform, urlResult.resolvedUrl);
                if (contentId && cacheIsShortUrl(url)) {
                    try {
                        await cacheSetAlias(url, urlResult.platform, contentId);
                    } catch (cacheError) {
                        logger.warn('cache', `Cache alias write failed: ${cacheError}`);
                    }
                }
                
                const responseTime = Date.now() - startTime;
                
                // Track cache hit as successful request
                const country = getCountryFromHeaders(request.headers);
                recordDownloadStat(urlResult.platform, true, responseTime, country, 'api').catch(() => {});
                
                return NextResponse.json({
                    success: true,
                    data: resolvedCache.data.data ? { ...resolvedCache.data.data, responseTime } : resolvedCache.data.data,
                    cached: true,
                    cacheSource: resolvedCache.source,
                    meta: {
                        tier: 'premium',
                        platform: urlResult.platform,
                        apiKey: apiKey.substring(0, 8) + '...',
                        rateLimit: keyValidation.rateLimit,
                        endpoint: '/api/v1'
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

        // Step 7: Fetch file sizes for formats
        if (result.success && result.data?.formats) {
            try {
                const formatsNeedingSize = result.data.formats.filter(f => !f.filesize);
                if (formatsNeedingSize.length > 0) {
                    const sizesResult = await utilFetchFilesizes(formatsNeedingSize, urlResult.platform);
                    const sizeMap = new Map(sizesResult.map(f => [f.url, f.filesize]));
                    result.data.formats = result.data.formats.map(f => ({
                        ...f,
                        filesize: f.filesize || sizeMap.get(f.url)
                    }));
                }
            } catch (e) {
                logger.warn(urlResult.platform, `Failed to fetch file sizes: ${e}`);
            }
        }

        // Step 8: Cache successful result
        if (result.success && result.data) {
            const contentType = (result.data.type as ContentType) || 'unknown';
            try {
                await cacheSet(urlResult.platform, urlResult.resolvedUrl, result, contentType);
            } catch (cacheError) {
                logger.warn('cache', `Cache write failed: ${cacheError}`);
            }
            
            // Set alias for short URLs
            const contentId = cacheExtractContentId(urlResult.platform, urlResult.resolvedUrl);
            if (contentId && cacheIsShortUrl(url)) {
                try {
                    await cacheSetAlias(url, urlResult.platform, contentId);
                } catch (cacheError) {
                    logger.warn('cache', `Cache alias write failed: ${cacheError}`);
                }
            }
        }

        // Log result
        if (result.success) {
            logger.complete(urlResult.platform, Date.now() - startTime);
        } else {
            logger.scrapeError(urlResult.platform, result.errorCode || 'UNKNOWN', result.error);
        }

        const responseTime = Date.now() - startTime;

        // Track download stat (async, don't wait)
        const country = getCountryFromHeaders(request.headers);
        recordDownloadStat(urlResult.platform, result.success, responseTime, country, 'api').catch(() => {});

        return NextResponse.json({
            success: result.success,
            data: result.data ? { ...result.data, responseTime } : result.data,
            error: result.error,
            errorCode: result.errorCode,
            meta: {
                tier: 'premium',
                platform: urlResult.platform,
                apiKey: apiKey.substring(0, 8) + '...',
                rateLimit: keyValidation.rateLimit,
                endpoint: '/api/v1'
            }
        });

    } catch (error) {
        console.error('[API v1] Error:', error);

        return NextResponse.json(
            { 
                success: false, 
                error: error instanceof Error ? error.message : 'Internal server error',
                meta: {
                    tier: 'premium',
                    endpoint: '/api/v1'
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
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        },
    });
}
