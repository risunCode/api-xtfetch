/**
 * Playground API v1 - Free Testing
 * GET /api/v1/playground?url={URL}
 * POST /api/v1/playground
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/core/scrapers';
import { prepareUrl } from '@/lib/url';
import { logger } from '@/lib/services/shared/logger';
import { serviceConfigLoad, serviceConfigGetPlaygroundRateLimit } from '@/core/config';
import { cookiePoolGetRotating } from '@/lib/cookies';
import { utilFetchFilesizes } from '@/lib/utils';

// GET is public - returns rate limit status only (no scraping)
export async function GET(request: NextRequest) {
    const startTime = Date.now();
    
    // Load config from DB (service_config table - synced with admin console)
    await serviceConfigLoad();
    const rateLimit = serviceConfigGetPlaygroundRateLimit();
    
    try {
        const searchParams = request.nextUrl.searchParams;
        const url = searchParams.get('url');

        // If no URL, return rate limit status (for frontend status check)
        if (!url) {
            return NextResponse.json({
                success: true,
                data: {
                    remaining: rateLimit, // From DB config
                    limit: rateLimit,
                    resetIn: 0,
                },
                meta: {
                    tier: 'playground',
                    endpoint: '/api/v1/playground',
                    note: 'Rate limit status. Add ?url= to scrape media.'
                }
            });
        }

        // Prepare URL and detect platform
        const urlResult = await prepareUrl(url);
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return NextResponse.json(
                { success: false, error: urlResult.assessment.errorMessage || 'Invalid URL or unsupported platform' },
                { status: 400 }
            );
        }

        // Get cookie from admin pool for this platform (public tier for playground)
        const poolCookie = await cookiePoolGetRotating(urlResult.platform, 'public');
        
        // Run scraper with cookie
        const result = await runScraper(urlResult.platform, urlResult.resolvedUrl, {
            cookie: poolCookie || undefined
        });

        // Fetch file sizes for formats
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

        // Log successful download
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
                tier: 'playground',
                platform: urlResult.platform,
                rateLimit: `${rateLimit} requests per 2 minutes`,
                endpoint: '/api/v1/playground',
                responseTime: `${responseTime}ms`,
                note: 'For testing purposes only. Get API key for production use.'
            }
        });

    } catch (error) {
        console.error('[API v1 Playground GET] Error:', error);

        return NextResponse.json(
            { 
                success: false, 
                error: error instanceof Error ? error.message : 'Internal server error',
                meta: {
                    tier: 'playground',
                    endpoint: '/api/v1/playground'
                }
            },
            { status: 500 }
        );
    }
}

// POST method for API integration - public but origin-restricted to DownAria frontend
export async function POST(request: NextRequest) {
    const startTime = Date.now();
    
    // Validate origin - only allow from DownAria frontend
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    
    const ALLOWED_ORIGINS = [
        'https://downaria.vercel.app',
        'http://localhost:3001', // Frontend dev
    ];
    
    // In development, allow localhost
    const isDev = process.env.NODE_ENV === 'development';
    const isAllowedOrigin = origin && (
        ALLOWED_ORIGINS.includes(origin) || 
        (isDev && origin.startsWith('http://localhost:'))
    );
    const isAllowedReferer = referer && (
        ALLOWED_ORIGINS.some(o => referer.startsWith(o)) ||
        (isDev && referer.startsWith('http://localhost:'))
    );
    
    // Must have valid origin OR referer from frontend
    if (!isAllowedOrigin && !isAllowedReferer) {
        return NextResponse.json(
            { 
                success: false, 
                error: 'Playground API is only accessible from DownAria website', 
                code: 'ORIGIN_NOT_ALLOWED' 
            },
            { status: 403 }
        );
    }
    
    // Load config from DB (service_config table - synced with admin console)
    await serviceConfigLoad();
    const rateLimit = serviceConfigGetPlaygroundRateLimit();
    
    try {
        const body = await request.json();
        const { url } = body;

        // Validate required parameters
        if (!url) {
            return NextResponse.json(
                { success: false, error: 'URL is required in request body' },
                { status: 400 }
            );
        }

        // Prepare URL and detect platform
        const urlResult = await prepareUrl(url);
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return NextResponse.json(
                { success: false, error: urlResult.assessment.errorMessage || 'Invalid URL or unsupported platform' },
                { status: 400 }
            );
        }

        // Get cookie from admin pool for this platform (public tier for playground)
        const poolCookie = await cookiePoolGetRotating(urlResult.platform, 'public');
        
        // Run scraper with cookie
        const result = await runScraper(urlResult.platform, urlResult.resolvedUrl, {
            cookie: poolCookie || undefined
        });

        // Fetch file sizes for formats
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

        // Log successful download
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
                tier: 'playground',
                platform: urlResult.platform,
                rateLimit: `${rateLimit} requests per 2 minutes`,
                endpoint: '/api/v1/playground',
                responseTime: `${responseTime}ms`,
                note: 'For testing purposes only. Get API key for production use.'
            }
        });

    } catch (error) {
        console.error('[API v1 Playground POST] Error:', error);

        return NextResponse.json(
            { 
                success: false, 
                error: error instanceof Error ? error.message : 'Internal server error',
                meta: {
                    tier: 'playground',
                    endpoint: '/api/v1/playground'
                }
            },
            { status: 500 }
        );
    }
}

// Support OPTIONS for CORS - use same origin validation as middleware
export async function OPTIONS(request: NextRequest) {
    const origin = request.headers.get('Origin');
    
    // Allowed origins (should match middleware ALLOWED_ORIGINS)
    const ALLOWED_ORIGINS = [
        'https://downaria.vercel.app',
        'https://api-xtfetch.vercel.app',
        'https://xtfetch-api-production.up.railway.app',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
    ];
    
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // Only set CORS origin if it's in the allowed list
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
    } else if (process.env.NODE_ENV === 'development' && origin?.startsWith('http://localhost:')) {
        // Allow localhost in development
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
    }
    // If no valid origin, don't set CORS headers (browser will block)
    
    return new NextResponse(null, {
        status: 200,
        headers,
    });
}
