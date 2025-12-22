/**
 * Debug Scrape API
 * POST /api/v1/debug/scrape
 * 
 * Test scraper with debug info
 * Shows cookie usage, headers, timing
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/core/scrapers';
import { prepareUrl } from '@/lib/url';
import { getRotatingCookie, getCookiesByPlatform } from '@/lib/cookies';

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    
    try {
        const body = await request.json();
        const { url, forceCookie = false, debug = true } = body;

        if (!url) {
            return NextResponse.json({
                success: false,
                error: 'URL is required',
            }, { status: 400 });
        }

        // Prepare URL
        const urlResult = await prepareUrl(url);
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return NextResponse.json({
                success: false,
                error: urlResult.assessment.errorMessage || 'Invalid URL',
                debug: debug ? {
                    urlResult,
                    timing: `${Date.now() - startTime}ms`,
                } : undefined,
            }, { status: 400 });
        }

        const platform = urlResult.platform;

        // Check cookie availability
        const cookieCheck = {
            platform,
            poolCookies: await getCookiesByPlatform(platform),
            rotatingCookie: null as string | null,
            cookieUsed: false,
        };

        // Try to get rotating cookie
        try {
            const cookie = await getRotatingCookie(platform);
            cookieCheck.rotatingCookie = cookie ? `[FOUND: ${cookie.length} chars]` : null;
            cookieCheck.cookieUsed = !!cookie;
        } catch (e) {
            cookieCheck.rotatingCookie = `[ERROR: ${e instanceof Error ? e.message : 'unknown'}]`;
        }

        // Run scraper
        const scraperStart = Date.now();
        const result = await runScraper(platform, urlResult.resolvedUrl, {
            skipCache: true, // Always skip cache for debug
        });
        const scraperTime = Date.now() - scraperStart;

        // Build response
        const response: Record<string, unknown> = {
            success: result.success,
            data: result.data,
            error: result.error,
            errorCode: result.errorCode,
        };

        if (debug) {
            response.debug = {
                timing: {
                    total: `${Date.now() - startTime}ms`,
                    scraper: `${scraperTime}ms`,
                },
                url: {
                    input: url,
                    resolved: urlResult.resolvedUrl,
                    platform,
                },
                cookie: {
                    poolCount: cookieCheck.poolCookies.length,
                    poolStatus: cookieCheck.poolCookies.map(c => ({
                        id: c.id.substring(0, 8),
                        status: c.status,
                        enabled: c.enabled,
                        uses: c.use_count,
                        errors: c.error_count,
                    })),
                    rotatingCookieFound: !!cookieCheck.rotatingCookie,
                    cookieUsedInRequest: result.data?.usedCookie || false,
                },
                mediaFound: {
                    total: result.data?.formats?.length || 0,
                    videos: result.data?.formats?.filter((f: { type: string }) => f.type === 'video').length || 0,
                    images: result.data?.formats?.filter((f: { type: string }) => f.type === 'image').length || 0,
                },
            };
        }

        response.meta = {
            endpoint: '/api/v1/debug/scrape',
            timestamp: new Date().toISOString(),
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error('[Debug Scrape] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal error',
            debug: {
                timing: `${Date.now() - startTime}ms`,
                errorType: error instanceof Error ? error.constructor.name : 'Unknown',
            },
        }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
