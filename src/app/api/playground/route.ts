/**
 * Guest Playground API
 * Rate-limited endpoint for testing without auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectPlatform } from '@/core/config';
import { scrapeFacebook, scrapeInstagram, scrapeTwitter, scrapeTikTok, scrapeWeibo } from '@/lib/services';
import { logger } from '@/lib/services/helper/logger';
import { isPlatformEnabled, isMaintenanceMode, getMaintenanceMessage, getPlatformDisabledMessage, getPlaygroundRateLimit, loadConfigFromDB, getServiceConfig, type PlatformId } from '@/lib/services/helper/service-config';
import { getAdminCookie, markCookieSuccess, markCookieCooldown, markCookieExpired } from '@/lib/utils/admin-cookie';
import type { CookiePlatform } from '@/lib/utils/cookie-parser';
import { trackDownload, trackError, getCountryFromHeaders } from '@/lib/supabase';
import { prepareUrl } from '@/lib/url';
import { getCacheByKey, setCacheByKey } from '@/lib/services/helper/cache';
import type { MediaData } from '@/lib/types';

type Platform = 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo';

// In-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const urlCacheMap = new Map<string, { urls: Set<string>; resetAt: number }>();

function getClientIP(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
           request.headers.get('x-real-ip') || 'unknown';
}

function rateLimit(ip: string, limit: number): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const windowMs = 120_000; // 2 minutes
    const entry = rateLimitMap.get(ip);
    
    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, resetIn: windowMs };
    }
    
    if (entry.count >= limit) {
        return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
    }
    
    entry.count++;
    return { allowed: true, remaining: limit - entry.count, resetIn: entry.resetAt - now };
}

function normalizeUrlForCache(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\/$/, '');
    } catch { return url.toLowerCase(); }
}

function isUrlCached(ip: string, url: string): boolean {
    const entry = urlCacheMap.get(ip);
    return !!(entry && entry.resetAt > Date.now() && entry.urls.has(normalizeUrlForCache(url)));
}

function cacheUrl(ip: string, url: string): void {
    const normalized = normalizeUrlForCache(url);
    let entry = urlCacheMap.get(ip);
    if (!entry || entry.resetAt < Date.now()) {
        entry = { urls: new Set(), resetAt: Date.now() + 120_000 };
        urlCacheMap.set(ip, entry);
    }
    entry.urls.add(normalized);
}


async function handlePlaygroundRequest(request: NextRequest, url: string): Promise<NextResponse> {
    const startTime = Date.now();
    const clientIP = getClientIP(request);

    await loadConfigFromDB();
    const config = getServiceConfig();
    const maxRequests = config.playgroundRateLimit || 5;

    if (!config.playgroundEnabled) {
        return NextResponse.json({ success: false, error: 'Guest playground is disabled.' }, { status: 503 });
    }
    
    if (isMaintenanceMode()) {
        return NextResponse.json({ success: false, error: getMaintenanceMessage() }, { status: 503 });
    }

    if (!url) {
        return NextResponse.json({ success: false, error: 'URL required', rateLimit: { remaining: maxRequests, limit: maxRequests } }, { status: 400 });
    }

    const platform = detectPlatform(url);
    if (!platform) {
        return NextResponse.json({ 
            success: false, 
            error: 'Unsupported URL. Supported: Facebook, Instagram, Twitter, TikTok, Weibo', 
            supported: ['facebook', 'instagram', 'twitter', 'tiktok', 'weibo'],
            rateLimit: { remaining: maxRequests, limit: maxRequests } 
        }, { status: 400 });
    }

    // URL Pipeline
    const urlResult = await prepareUrl(url, { timeout: 5000 });
    const resolvedUrl = urlResult.resolvedUrl || url;
    const resolvedPlatform = (urlResult.platform || platform) as Platform;

    // Check if URL was already requested (don't count against rate limit)
    const isCached = isUrlCached(clientIP, url);
    let rateCheck = { allowed: true, remaining: maxRequests, resetIn: 120_000 };
    
    if (!isCached) {
        rateCheck = rateLimit(clientIP, maxRequests);
    }
    
    if (!rateCheck.allowed) {
        const resetIn = Math.ceil(rateCheck.resetIn / 1000);
        return NextResponse.json({ 
            success: false, 
            error: `Rate limit exceeded. Try again in ${resetIn}s`, 
            rateLimit: { remaining: 0, resetIn, limit: maxRequests } 
        }, { status: 429 });
    }

    if (!isPlatformEnabled(resolvedPlatform as PlatformId)) {
        return NextResponse.json({ 
            success: false, 
            error: getPlatformDisabledMessage(resolvedPlatform as PlatformId), 
            platform: resolvedPlatform, 
            rateLimit: { remaining: rateCheck.remaining, limit: maxRequests } 
        }, { status: 503 });
    }

    logger.debug('playground', `Guest request: ${resolvedPlatform} from ${clientIP}`);

    // Check cache
    const cacheKey = `result:${urlResult.cacheKey || resolvedPlatform + ':' + resolvedUrl}`;
    const cachedResult = await getCacheByKey<MediaData>(cacheKey);
    
    if (cachedResult && cachedResult.formats && cachedResult.formats.length > 0) {
        const responseTime = Date.now() - startTime;
        return NextResponse.json({
            success: true,
            platform: resolvedPlatform,
            cached: true,
            data: { ...cachedResult, responseTime },
            rateLimit: { remaining: rateCheck.remaining, limit: maxRequests }
        });
    }

    // Get cookie
    const cookiePlatforms: CookiePlatform[] = ['facebook', 'instagram', 'twitter', 'weibo'];
    let cookie: string | undefined;
    if (cookiePlatforms.includes(resolvedPlatform as CookiePlatform)) {
        cookie = await getAdminCookie(resolvedPlatform as CookiePlatform) || undefined;
    }

    let result: { success: boolean; data?: { usedCookie?: boolean; formats?: unknown[] }; error?: string } | undefined;
    let usedCookie = false;

    switch (resolvedPlatform) {
        case 'facebook':
            result = await scrapeFacebook(resolvedUrl, cookie ? { cookie } : undefined);
            if (result.success && result.data?.usedCookie) usedCookie = true;
            break;
        case 'instagram':
            result = await scrapeInstagram(resolvedUrl, cookie ? { cookie } : undefined);
            if (result.success && result.data?.usedCookie) usedCookie = true;
            break;
        case 'twitter':
            result = await scrapeTwitter(resolvedUrl);
            if (!result.success && cookie) { 
                result = await scrapeTwitter(resolvedUrl, { cookie }); 
                if (result.success) usedCookie = true; 
            }
            break;
        case 'tiktok':
            result = await scrapeTikTok(resolvedUrl);
            break;
        case 'weibo':
            if (!cookie) result = { success: false, error: 'Weibo requires cookie' };
            else { result = await scrapeWeibo(resolvedUrl, { cookie }); usedCookie = true; }
            break;
    }

    // Cache successful result
    if (result?.success && result.data) {
        const resultData = result.data as { formats?: unknown[] };
        if (resultData.formats && Array.isArray(resultData.formats) && resultData.formats.length > 0) {
            setCacheByKey(cacheKey, resolvedPlatform as PlatformId, result.data as MediaData);
        }
    }

    const responseTime = Date.now() - startTime;
    const country = getCountryFromHeaders(request.headers);

    // Cookie status tracking
    if (usedCookie && cookie) {
        if (result?.success) markCookieSuccess().catch(() => {});
        else if (result?.error) {
            const err = result.error.toLowerCase();
            if (err.includes('verification') || err.includes('checkpoint') || err.includes('login')) {
                markCookieExpired(result.error).catch(() => {});
            } else if (err.includes('rate limit') || err.includes('429')) {
                markCookieCooldown(30, result.error).catch(() => {});
            }
        }
    }

    if (result?.success && result.data) {
        if (!isCached) cacheUrl(clientIP, url);
        
        trackDownload({
            platform: resolvedPlatform,
            quality: 'unknown',
            source: 'playground',
            country,
            success: true,
        });
        
        return NextResponse.json({
            success: true,
            platform: resolvedPlatform,
            cached: isCached,
            data: { ...(result.data as object), usedCookie, responseTime },
            rateLimit: { remaining: rateCheck.remaining, limit: maxRequests }
        });
    }

    const errorMsg = result?.error || 'Could not extract media';
    trackDownload({
        platform: resolvedPlatform,
        quality: 'unknown',
        source: 'playground',
        country,
        success: false,
        error_type: errorMsg.substring(0, 50),
    });
    trackError({
        platform: resolvedPlatform,
        source: 'playground',
        country,
        error_type: 'playground_failed',
        error_message: errorMsg,
    });

    return NextResponse.json({ 
        success: false, 
        platform: resolvedPlatform, 
        error: errorMsg, 
        responseTime, 
        rateLimit: { remaining: rateCheck.remaining, limit: maxRequests } 
    }, { status: 400 });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        return handlePlaygroundRequest(request, body.url);
    } catch (error) {
        const limit = getPlaygroundRateLimit();
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Request failed', 
            rateLimit: { remaining: limit, limit } 
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    if (url) return handlePlaygroundRequest(request, url);

    await loadConfigFromDB();
    const config = getServiceConfig();
    
    return NextResponse.json({
        success: true,
        data: {
            name: 'XTFetch Guest Playground API',
            enabled: config.playgroundEnabled,
            limit: config.playgroundRateLimit || 5,
            supported: ['facebook', 'instagram', 'twitter', 'tiktok', 'weibo']
        }
    });
}
