/**
 * Unified API Endpoint
 * Auto-detect platform from URL and route to appropriate scraper
 * 
 * Supported: Facebook, Instagram, Twitter/X, TikTok, Weibo
 */

import { NextRequest, NextResponse } from 'next/server';
import { scrapeFacebook, scrapeInstagram, scrapeTwitter, scrapeTikTok, scrapeWeibo } from '@/lib/services';
import { logger } from '@/lib/services/helper/logger';
import { getAdminCookie, markCookieSuccess, markCookieCooldown, markCookieExpired } from '@/lib/utils/admin-cookie';
import { parseCookie, type CookiePlatform } from '@/lib/utils/cookie-parser';
import type { MediaData } from '@/lib/types';
import type { ScraperData } from '@/core/scrapers/types';
import {
    isPlatformEnabled, isMaintenanceMode, getMaintenanceMessage, getPlatformDisabledMessage,
    recordRequest, getGlobalRateLimit, loadConfigFromDB, getPlatformConfig, type PlatformId
} from '@/lib/services/helper/service-config';
import { extractApiKey, validateApiKey, recordKeyUsage } from '@/lib/services/helper/api-keys';
import { trackDownload, trackError, getCountryFromHeaders } from '@/lib/supabase';
import { prepareUrl } from '@/lib/url';
import { getCacheByKey, setCacheByKey } from '@/lib/services/helper/cache';

type Platform = 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo' | 'youtube';

// Rate limiting (in-memory for now)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string, limit: number): { allowed: boolean; resetIn: number } {
    const now = Date.now();
    const windowMs = 60_000;
    const entry = rateLimitMap.get(ip);
    
    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
        return { allowed: true, resetIn: windowMs };
    }
    
    if (entry.count >= limit) {
        return { allowed: false, resetIn: entry.resetAt - now };
    }
    
    entry.count++;
    return { allowed: true, resetIn: entry.resetAt - now };
}

function getClientIP(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
           request.headers.get('x-real-ip') ||
           'unknown';
}

function successResponse(platform: string, data: MediaData) {
    return NextResponse.json({ success: true, platform, data });
}

function errorResponse(platform: string, error: string, status = 400) {
    return NextResponse.json({ success: false, platform, error }, { status });
}


async function handleRequest(request: NextRequest, url: string, userCookie?: string, skipCache = false) {
    const startTime = Date.now();
    const clientIP = getClientIP(request);

    // Load config from DB first
    await loadConfigFromDB();

    if (isMaintenanceMode()) {
        return NextResponse.json({ success: false, error: getMaintenanceMessage() }, { status: 503 });
    }

    // API key validation (optional)
    let validatedKey: { id: string; rateLimit?: number } | null = null;
    const apiKey = extractApiKey(request);
    if (apiKey) {
        const validation = await validateApiKey(apiKey);
        if (!validation.valid) {
            return NextResponse.json({ 
                success: false, 
                error: validation.error || 'Invalid API key',
                remaining: validation.remaining ?? 0
            }, { status: validation.error?.includes('Rate limit') ? 429 : 401 });
        }
        if (validation.key) {
            validatedKey = { id: validation.key.id, rateLimit: validation.key.rateLimit };
        }
    }

    // Rate limiting (only for guests without API key)
    if (!validatedKey) {
        const rl = rateLimit(clientIP, getGlobalRateLimit());
        if (!rl.allowed) {
            const resetIn = Math.ceil(rl.resetIn / 1000);
            return NextResponse.json({ success: false, error: `Rate limit exceeded. Try again in ${resetIn}s.`, resetIn }, { status: 429 });
        }
    }

    if (!url) {
        return NextResponse.json({
            name: 'XTFetch Unified API',
            version: '2.0',
            supported: ['Facebook', 'Instagram', 'Twitter/X', 'TikTok', 'Weibo'],
            usage: { method: 'GET or POST', params: '?url=<social_media_url>', body: { url: 'required', cookie: 'optional' } },
        });
    }

    // URL Pipeline
    const urlResult = await prepareUrl(url, { timeout: 5000 });
    if (!urlResult.assessment.isValid || !urlResult.platform) {
        return NextResponse.json({ success: false, error: urlResult.assessment.errorMessage || 'Unsupported URL' }, { status: 400 });
    }

    const platform = urlResult.platform as Platform;
    const resolvedUrl = urlResult.resolvedUrl;
    const cacheKey = urlResult.cacheKey;

    if (!isPlatformEnabled(platform as PlatformId)) {
        return errorResponse(platform, getPlatformDisabledMessage(platform as PlatformId), 503);
    }

    // Per-platform rate limiting (for guests only)
    if (!validatedKey) {
        const platformConfig = getPlatformConfig(platform as PlatformId);
        if (platformConfig?.rateLimit) {
            const platformRl = rateLimit(`${clientIP}:${platform}`, platformConfig.rateLimit);
            if (!platformRl.allowed) {
                const resetIn = Math.ceil(platformRl.resetIn / 1000);
                return NextResponse.json({ 
                    success: false, 
                    error: `Rate limit exceeded for ${platform}. Try again in ${resetIn}s.`, 
                    resetIn,
                    platform 
                }, { status: 429 });
            }
        }
    }

    // Cache check
    const fullCacheKey = `result:${cacheKey}`;
    
    if (!skipCache) {
        const cached = await getCacheByKey<MediaData>(fullCacheKey);
        
        if (cached && cached.formats && cached.formats.length > 0) {
            const totalTime = Date.now() - startTime;
            logger.redis(platform, true, fullCacheKey);
            recordRequest(platform as PlatformId, true, totalTime);
            if (validatedKey) recordKeyUsage(validatedKey.id, true);
            return successResponse(platform, { ...cached, cached: true, responseTime: totalTime });
        }
        
        if (cached) {
            logger.warn(platform, `Cache entry has no formats [${fullCacheKey}], re-scraping`);
        } else {
            logger.redis(platform, false, fullCacheKey);
        }
    } else {
        logger.debug(platform, 'Skip cache enabled, fetching fresh data');
    }

    logger.url(platform, resolvedUrl);

    // Get cookie
    const cookiePlatforms: CookiePlatform[] = ['facebook', 'instagram', 'twitter', 'weibo'];
    let cookie = userCookie ? parseCookie(userCookie, platform as CookiePlatform) : null;
    if (!cookie && cookiePlatforms.includes(platform as CookiePlatform)) {
        const adminCookie = await getAdminCookie(platform as CookiePlatform);
        if (adminCookie) cookie = parseCookie(adminCookie, platform as CookiePlatform);
    }

    let result: { success: boolean; data?: ScraperData; error?: string } | undefined;
    let usedCookie = false;
    let usedAdminCookie = false;

    try {
        switch (platform) {
            case 'facebook':
            case 'instagram': {
                const scraper = platform === 'instagram' ? scrapeInstagram : scrapeFacebook;
                result = await scraper(resolvedUrl, cookie ? { cookie, skipCache } : { skipCache });
                if (result.success && result.data?.usedCookie) {
                    usedCookie = true;
                    usedAdminCookie = !userCookie;
                }
                break;
            }
            case 'twitter': {
                result = await scrapeTwitter(resolvedUrl, { skipCache });
                if (!result.success && cookie) {
                    result = await scrapeTwitter(resolvedUrl, { cookie, skipCache });
                    if (result.success) { usedCookie = true; usedAdminCookie = !userCookie; }
                }
                break;
            }
            case 'tiktok': {
                const tikResult = await scrapeTikTok(resolvedUrl, { skipCache });
                result = tikResult.success && tikResult.data
                    ? { success: true, data: { ...tikResult.data, url: resolvedUrl } }
                    : { success: false, error: tikResult.error || 'TikTok fetch failed' };
                break;
            }
            case 'weibo': {
                if (!cookie) {
                    result = { success: false, error: 'Weibo requires cookie' };
                } else {
                    result = await scrapeWeibo(resolvedUrl, { cookie, skipCache });
                    usedCookie = true;
                    usedAdminCookie = !userCookie;
                }
                break;
            }
        }
    } catch (e) {
        result = { success: false, error: e instanceof Error ? e.message : 'Scrape failed' };
    }

    // Cookie status tracking
    if (usedAdminCookie && result) {
        if (result.success) markCookieSuccess().catch(() => {});
        else if (result.error) {
            const err = result.error.toLowerCase();
            if (err.includes('verification') || err.includes('checkpoint') || err.includes('login')) markCookieExpired(result.error).catch(() => {});
            else if (err.includes('rate limit') || err.includes('429')) markCookieCooldown(30, result.error).catch(() => {});
        }
    }

    const responseTime = Date.now() - startTime;
    const country = getCountryFromHeaders(request.headers);
    const source = validatedKey ? 'api' : 'web';

    if (result?.success && result.data) {
        const mediaData: MediaData = {
            title: result.data.title || 'Untitled',
            thumbnail: result.data.thumbnail || '',
            author: result.data.author,
            duration: result.data.duration,
            views: result.data.views,
            description: result.data.description,
            formats: result.data.formats || [],
            url: result.data.url || resolvedUrl,
            engagement: result.data.engagement,
            usedCookie: usedCookie || undefined,
            cached: false,
            responseTime,
        };
        
        // Only cache if we have valid formats
        if (mediaData.formats.length > 0) {
            setCacheByKey(fullCacheKey, platform as PlatformId, mediaData);
        }
        
        recordRequest(platform as PlatformId, true, responseTime);
        if (validatedKey) recordKeyUsage(validatedKey.id, true);
        
        // Track successful download
        trackDownload({
            platform,
            quality: (mediaData.formats[0]?.quality || 'unknown') as 'HD' | 'SD' | 'audio' | 'original' | 'unknown',
            source,
            country,
            success: true,
        });
        
        return successResponse(platform, mediaData);
    }

    recordRequest(platform as PlatformId, false, responseTime);
    if (validatedKey) recordKeyUsage(validatedKey.id, false);
    
    // Track failed download
    const errorMsg = result?.error || 'Could not extract media';
    trackDownload({
        platform,
        quality: 'unknown',
        source,
        country,
        success: false,
        error_type: errorMsg.substring(0, 50),
    });
    trackError({
        platform,
        source,
        country,
        error_type: 'scrape_failed',
        error_message: errorMsg,
    });
    
    return errorResponse(platform, errorMsg);
}

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url') || '';
    const cookie = request.nextUrl.searchParams.get('cookie') || undefined;
    const skipCache = request.nextUrl.searchParams.get('skipCache') === 'true';
    return handleRequest(request, url, cookie, skipCache);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        return handleRequest(request, body.url, body.cookie, body.skipCache === true);
    } catch (error) {
        const safeMessage = error instanceof SyntaxError 
            ? 'Invalid JSON in request body' 
            : 'Invalid request format';
        return NextResponse.json({ success: false, error: safeMessage }, { status: 400 });
    }
}
