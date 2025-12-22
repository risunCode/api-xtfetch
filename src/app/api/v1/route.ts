/**
 * Premium API v1 - Main Download Endpoint
 * GET /api/v1?key={API_KEY}&url={URL}
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/core/scrapers';
import { prepareUrl } from '@/lib/url';
import { logger } from '@/lib/services/helper/logger';

// Simple API key validation (will be replaced with Supabase)
async function validateApiKey(apiKey: string) {
    // TODO: Implement proper API key validation with Supabase
    // For now, accept any key starting with 'xtf_'
    return {
        valid: apiKey.startsWith('xtf_'),
        rateLimit: 100
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
                { success: false, error: 'Invalid or expired API key' },
                { status: 401 }
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

        // Run scraper
        const result = await runScraper(urlResult.platform, urlResult.resolvedUrl, {});

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
