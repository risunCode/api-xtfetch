/**
 * Free Homepage API v1 - Public Services
 * POST /api/v1/publicservices
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/core/scrapers';
import { prepareUrl } from '@/lib/url';
import { logger } from '@/lib/services/helper/logger';

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

        // Prepare URL and detect platform
        const urlResult = await prepareUrl(url);
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return NextResponse.json(
                { success: false, error: urlResult.assessment.errorMessage || 'Invalid URL or unsupported platform' },
                { status: 400 }
            );
        }

        // Run scraper (no API key required)
        const result = await runScraper(urlResult.platform, urlResult.resolvedUrl, {});

        // Log successful download
        if (result.success) {
            logger.complete(urlResult.platform, Date.now() - startTime);
        } else {
            logger.error(urlResult.platform, result.error || 'Unknown error');
        }

        return NextResponse.json({
            success: result.success,
            data: result.data,
            error: result.error,
            errorCode: result.errorCode,
            meta: {
                tier: 'free',
                platform: urlResult.platform,
                rateLimit: '10 requests per minute',
                endpoint: '/api/v1/publicservices',
                responseTime: `${Date.now() - startTime}ms`
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
