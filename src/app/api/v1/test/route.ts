/**
 * Test Endpoint - NO AUTH (Development Only!)
 * GET /api/v1/test?url={URL}
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/core/scrapers';
import { prepareUrl } from '@/lib/url';
import { platformDetect } from '@/core/config';

export async function GET(request: NextRequest) {
    // Block in production
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ success: false, error: 'Test endpoint disabled in production' }, { status: 403 });
    }

    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
        return NextResponse.json({ success: false, error: 'URL required' }, { status: 400 });
    }

    try {
        const urlResult = await prepareUrl(url);
        if (!urlResult.assessment.isValid || !urlResult.platform) {
            return NextResponse.json({ success: false, error: 'Invalid URL' }, { status: 400 });
        }

        const result = await runScraper(urlResult.platform, urlResult.resolvedUrl, { skipCache: true });

        return NextResponse.json({
            success: result.success,
            platform: urlResult.platform,
            data: result.data,
            error: result.error,
        });
    } catch (error) {
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}
