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
 * 5. Fetch file sizes for formats
 * 6. Cache result
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/core/scrapers';
import { prepareUrl, prepareUrlSync } from '@/lib/url';
import { logger } from '@/lib/services/shared/logger';
import { cookiePoolGetRotating } from '@/lib/cookies';
import { platformDetect, type PlatformId } from '@/core/config';
import { utilFetchFilesizes } from '@/lib/utils';
import { recordDownloadStat, getCountryFromHeaders } from '@/lib/database';
import {
    cacheGetQuick,
    cacheGetWithFallback,
    cacheSetWithAlias,
    cacheDelete,
    type ContentType
} from '@/lib/cache';
import type { ScraperResult } from '@/core/scrapers/types';

// Origin whitelist - comma separated in env
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim().toLowerCase())
    .filter(Boolean);



/**
 * Parse and extract hostname from origin/URL string
 * Returns null if parsing fails
 */
function parseOriginHostname(origin: string): string | null {
    try {
        const url = new URL(origin);
        return url.hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Check if origin hostname matches an allowed origin (exact match only)
 * No subdomain wildcards - must be exact hostname match
 */
function isOriginAllowed(originHostname: string, allowedOrigins: string[]): boolean {
    return allowedOrigins.some(allowed => {
        const allowedHostname = parseOriginHostname(allowed);
        if (!allowedHostname) {
            // If allowed origin is just a hostname without protocol, compare directly
            return originHostname === allowed.toLowerCase();
        }
        // Exact hostname match only - no subdomain matching
        return originHostname === allowedHostname;
    });
}

function isRequestAllowed(request: NextRequest): boolean {
    // Allow internal requests from Telegram bot (same server)
    const internalRequest = request.headers.get('x-internal-request');
    if (internalRequest === 'telegram-bot') {
        console.log('[publicservices] Internal request from telegram-bot allowed');
        return true;
    }

    // SECURITY: Require explicit whitelist in production
    // If no whitelist configured, block all requests (fail-safe)
    if (ALLOWED_ORIGINS.length === 0) {
        return false;
    }

    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');

    // Check origin header (browser requests)
    if (origin) {
        const originHostname = parseOriginHostname(origin);
        if (!originHostname) return false;
        return isOriginAllowed(originHostname, ALLOWED_ORIGINS);
    }

    // Fallback to referer (for same-origin requests without Origin header)
    if (referer) {
        const refererHostname = parseOriginHostname(referer);
        if (!refererHostname) return false;
        return isOriginAllowed(refererHostname, ALLOWED_ORIGINS);
    }

    // No origin/referer = direct API call (block in production)
    return false;
}

export async function POST(request: NextRequest) {
    // Origin check
    if (!isRequestAllowed(request)) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized origin' },
            { status: 403 }
        );
    }
    const startTime = Date.now();
    try {
        const body = await request.json();
        const { url, cookie: bodyCookie, skipCache } = body;

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

        // Log incoming request
        if (detectedPlatform) {
            logger.request(detectedPlatform, 'web');
        }

        // Step 2: Quick cache check BEFORE URL resolution (fastest path)
        // Skip cache if skipCache flag is set
        if (detectedPlatform && !skipCache) {
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
                recordDownloadStat(detectedPlatform, true, responseTime, country, 'web').catch(() => { });

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

        // Step 3: Get cookie early for platforms that need it for URL resolution
        const earlyPlatform = detectedPlatform || platformDetect(url);
        let poolCookie: string | null = null;
        if (earlyPlatform) {
            poolCookie = bodyCookie || await cookiePoolGetRotating(earlyPlatform, 'public');
            console.log(`[publicservices] Early cookie fetch for ${earlyPlatform}: ${poolCookie ? 'found' : 'NOT FOUND'}`);
        }

        // Step 4: URL resolution (only if cache miss) - pass cookie for platforms that need auth
        const urlResult = await prepareUrl(url, { cookie: poolCookie || undefined });
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return NextResponse.json(
                { success: false, error: urlResult.assessment.errorMessage || 'Invalid URL or unsupported platform' },
                { status: 400 }
            );
        }

        // Refresh cookie if platform changed after resolution
        if (urlResult.platform !== earlyPlatform && !bodyCookie) {
            poolCookie = await cookiePoolGetRotating(urlResult.platform, 'public');
        }

        // Step 5: Check cache with resolved URL (if URL was resolved and skipCache not set)
        if (urlResult.wasResolved && !skipCache) {
            let resolvedCache: { hit: boolean; data?: ScraperResult; source?: string } = { hit: false, data: undefined };
            try {
                // Use the unified helper that handles alias backfill automatically
                resolvedCache = await cacheGetWithFallback<ScraperResult>(urlResult.platform, url, urlResult.resolvedUrl);
            } catch (cacheError) {
                logger.warn('cache', `Cache read failed for resolved URL, proceeding without cache: ${cacheError}`);
            }
            if (resolvedCache.hit && resolvedCache.data?.success) {
                logger.cache(urlResult.platform, true);

                const responseTime = Date.now() - startTime;

                // Track cache hit as successful request
                const country = getCountryFromHeaders(request.headers);
                recordDownloadStat(urlResult.platform, true, responseTime, country, 'web').catch(() => { });

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

        // Step 6: Run scraper (cache miss) - with retry on failure
        logger.cache(urlResult.platform, false);
        let result = await runScraper(urlResult.platform, urlResult.resolvedUrl, {
            cookie: poolCookie || undefined,
        });

        // If scrape failed, clear cache and retry once with fresh data
        if (!result.success && !skipCache) {
            console.log(`[publicservices] Scrape failed, clearing cache and retrying...`);
            await cacheDelete(urlResult.platform, url);
            if (urlResult.resolvedUrl !== url) {
                await cacheDelete(urlResult.platform, urlResult.resolvedUrl);
            }
            
            // Retry scrape
            result = await runScraper(urlResult.platform, urlResult.resolvedUrl, {
                cookie: poolCookie || undefined,
            });
            
            if (result.success) {
                console.log(`[publicservices] Retry successful!`);
            }
        }

        // Step 7: Fetch file sizes for formats (skip for gallery-dl platforms - their CDNs often timeout)
        // Gallery-dl platforms: erome, pixiv - skip filesize fetching
        const SKIP_FILESIZE_PLATFORMS: PlatformId[] = ['erome', 'pixiv'];
        if (result.success && result.data?.formats && !SKIP_FILESIZE_PLATFORMS.includes(urlResult.platform)) {
            try {
                // Only fetch for formats that don't already have filesize
                const formatsNeedingSize = result.data.formats.filter(f => !f.filesize);
                if (formatsNeedingSize.length > 0) {
                    const sizesResult = await utilFetchFilesizes(formatsNeedingSize, urlResult.platform);
                    // Merge back sizes
                    const sizeMap = new Map(sizesResult.map(f => [f.url, f.filesize]));
                    result.data.formats = result.data.formats.map(f => ({
                        ...f,
                        filesize: f.filesize || sizeMap.get(f.url)
                    }));
                }
            } catch (e) {
                // Non-critical - continue without sizes
                logger.warn(urlResult.platform, `Failed to fetch file sizes: ${e}`);
            }
        }

        // Step 8: Cache successful result (using unified helper)
        if (result.success && result.data) {
            const contentType = (result.data.type as ContentType) || 'unknown';
            try {
                await cacheSetWithAlias(urlResult.platform, url, urlResult.resolvedUrl, result, contentType);
            } catch (cacheError) {
                logger.warn('cache', `Cache write failed: ${cacheError}`);
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
        recordDownloadStat(urlResult.platform, result.success, responseTime, country, 'web').catch(() => { });

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
