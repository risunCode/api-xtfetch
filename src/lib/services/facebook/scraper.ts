// scraper.ts - Facebook scraper (optimized)
import { httpGet, httpResolveUrl } from '@/lib/http/client';
import { extractContent, detectIssue, ISSUES } from './extractor';
import { optimizeUrls } from './cdn';
import type { ScraperResult, ScraperOptions } from '@/core/scrapers/types';
import { ScraperErrorCode, createError } from '@/core/scrapers/types';
import type { FbContentType, MediaFormat } from './index';
import { logger } from '../shared/logger';
import { getNextDesktopUA } from '@/lib/http/headers';
import { cookiePoolMarkExpired, cookiePoolMarkError } from '@/lib/cookies';

const TIMEOUT = { resolve: 2500, fetch: 8000 };
const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;
const FB_DOMAINS = /facebook\.com|fb\.watch|fb\.com|fbwat\.ch/i;

const MEDIA = ['"all_subattachments"', '"photo_image"', '"viewer_image"', '"full_image"', '"progressive_url"', '"playable_url"'];
// Use ISSUES patterns for LOGIN detection to avoid duplication
const LOGIN_PATTERNS = ISSUES.filter(([_, code]) => code === 'LOGIN_REQUIRED' || code === 'NOT_FOUND').map(([p]) => p);
const AGE = ['"is_age_restricted":true', 'age-restricted', 'AgeGate', '"age_gate"'];

const has = (h: string, p: string[]) => p.some(x => h.includes(x));
const hasMedia = (h: string): boolean => !!(h && has(h, MEDIA));
const isAgeGated = (h: string) => has(h, AGE);
const needsLogin = (h: string) => !h || (LOGIN_PATTERNS.some(p => h.includes(p)) && !hasMedia(h));
const isValid = (h: string | null): h is string => !!h && h.length > 5000 && hasMedia(h) && !needsLogin(h);

type UrlType = 'story' | 'reel' | 'watch' | 'video' | 'photo' | 'post' | 'group_post' | 'unknown';
type ResolveResult = { url: string; type: UrlType; needsCookie: boolean; wasLogin: boolean };

// Detect type from RESOLVED URL path (not input URL!)
function detectType(url: string): UrlType {
    if (url.includes('/stories/')) return 'story';
    if (url.includes('/reel/')) return 'reel';
    if (url.includes('/watch')) return 'watch';
    if (url.includes('/videos/')) return 'video';
    if (url.includes('/groups/') && url.includes('/permalink/')) return 'group_post';
    if (url.includes('/photo') || url.includes('fbid=')) return 'photo';
    if (url.includes('/posts/') || url.includes('/permalink.php')) return 'post';
    // Share prefixes only used before resolution
    if (url.includes('/share/r/')) return 'reel';
    if (url.includes('/share/s/')) return 'story';
    return 'unknown';
}

// Type-based cookie strategy
// STORY: always needs cookie (100% private)
// GROUP_POST: usually needs cookie (group privacy)
// REEL/VIDEO/POST/PHOTO: try without cookie first (often public)
function typeCookieStrategy(type: UrlType): 'always' | 'try_first' | 'optional' {
    switch (type) {
        case 'story': return 'always';      // Stories ALWAYS need cookie
        case 'group_post': return 'try_first'; // Groups often need cookie, try first
        default: return 'optional';          // Others: try without cookie first
    }
}

const TYPE_MAP: Record<UrlType, FbContentType> = {
    story: 'story', reel: 'reel', watch: 'video', video: 'video',
    photo: 'photo', group_post: 'group', post: 'post', unknown: 'post'
};

const cleanReel = (url: string) => url.match(/(https:\/\/[^\/]+\/reel\/\d+)/)?.[1] || url;

const extractNext = (url: string) => {
    try { return decodeURIComponent(new URL(url).searchParams.get('next') || ''); }
    catch { return ''; }
};

async function resolveUrl(url: string, cookie?: string): Promise<ResolveResult> {
    const preType = detectType(url);
    
    // Already resolved URLs - skip resolution
    if (/\/reel\/\d+|\/videos\/\d+|\/watch\/\?v=|\/groups\/.*\/permalink\/|\/posts\//.test(url) || url.includes('/stories/')) {
        const strategy = typeCookieStrategy(preType);
        logger.debug('facebook', `[Resolve] Skip (${preType}) -> ${strategy}`);
        return { url, type: preType, needsCookie: strategy === 'always' || strategy === 'try_first', wasLogin: false };
    }
    
    // Share URLs with known prefix - skip resolution for /r/ (reel)
    if (url.includes('/share/r/')) {
        logger.debug('facebook', `[Resolve] Skip (/share/r/ -> reel)`);
        return { url, type: 'reel', needsCookie: false, wasLogin: false };
    }
    if (url.includes('/share/s/')) {
        logger.debug('facebook', `[Resolve] Skip (/share/s/ -> story)`);
        return { url, type: 'story', needsCookie: true, wasLogin: false };
    }
    
    // Need resolution: generic /share/, /share/v/, /share/p/, fb.watch, etc
    logger.debug('facebook', `[Resolve] Resolving...`);
    const { resolved } = await httpResolveUrl(url, { platform: 'facebook', timeout: TIMEOUT.resolve });
    const finalUrl = resolved || url;
    
    // Handle login redirect - extract actual URL from ?next=
    if (finalUrl.includes('/login')) {
        const actual = extractNext(finalUrl);
        if (actual) {
            const t = detectType(actual);
            const strategy = typeCookieStrategy(t);
            logger.debug('facebook', `[Resolve] Login -> ${t.toUpperCase()} (${strategy})`);
            return { 
                url: actual.includes('/reel/') ? cleanReel(actual) : actual, 
                type: t, 
                needsCookie: true, // Login redirect = definitely needs cookie
                wasLogin: true 
            };
        }
        // Couldn't extract, try with cookie
        if (cookie) {
            const r2 = await httpResolveUrl(url, { platform: 'facebook', timeout: TIMEOUT.resolve, cookie });
            if (r2.resolved && !r2.resolved.includes('/login')) {
                const t = detectType(r2.resolved);
                logger.debug('facebook', `[Resolve] Cookie -> ${t.toUpperCase()}`);
                return { url: r2.resolved.includes('/reel/') ? cleanReel(r2.resolved) : r2.resolved, type: t, needsCookie: true, wasLogin: true };
            }
        }
        return { url, type: 'unknown', needsCookie: true, wasLogin: true };
    }
    
    // Resolved successfully - determine cookie strategy based on type
    const t = detectType(finalUrl);
    const strategy = typeCookieStrategy(t);
    logger.debug('facebook', `[Resolve] OK -> ${t.toUpperCase()} (${strategy})`);
    return { 
        url: finalUrl.includes('/reel/') ? cleanReel(finalUrl) : finalUrl, 
        type: t, 
        needsCookie: strategy === 'always' || strategy === 'try_first',
        wasLogin: false 
    };
}

const DESKTOP_HEADERS = { 'Sec-Ch-Ua': '"Google Chrome";v="131"', 'Sec-Ch-Ua-Mobile': '?0', 'Sec-Ch-Ua-Platform': '"Windows"' };

async function fetchWithRetry(url: string, res: ResolveResult, opts: ScraperOptions) {
    const { cookie } = opts;
    const strategy = typeCookieStrategy(res.type);
    const mustCookie = strategy === 'always' || (strategy === 'try_first' && res.needsCookie);
    
    logger.debug('facebook', `[Fetch] ${res.type.toUpperCase()}, strategy=${strategy}, cookie=${mustCookie ? 'yes' : 'try_without'}`);
    
    const get = async (useCookie: boolean, desktop = false) => {
        const headers = desktop ? { ...DESKTOP_HEADERS, 'User-Agent': getNextDesktopUA() } : undefined;
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await httpGet(url, 'facebook', { cookie: useCookie ? cookie : undefined, timeout: TIMEOUT.fetch, headers });
                return result;
            } catch (e) {
                logger.debug('facebook', `[Fetch] Attempt ${attempt}/${MAX_RETRIES} failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                } else {
                    throw e;
                }
            }
        }
        // This should never be reached due to throw in loop, but TypeScript needs it
        return httpGet(url, 'facebook', { cookie: useCookie ? cookie : undefined, timeout: TIMEOUT.fetch, headers });
    };
    
    const reason = (h: string | null) => {
        if (!h) return 'EMPTY';
        if (h.includes('id="login_form"')) return 'LOGIN';
        if (h.includes('/checkpoint/')) return 'CHECKPOINT';
        if (isAgeGated(h)) return 'AGE';
        if (!hasMedia(h)) return 'NO_MEDIA';
        return null;
    };

    try {
        // STORY/GROUP: Cookie first (always or try_first)
        if (mustCookie && cookie) {
            logger.debug('facebook', `[Fetch] Attempt 1: with cookie (${res.type})`);
            const r1 = await get(true);
            if (isValid(r1.data)) return { html: r1.data, usedCookie: true, usedFallback: false, ageGated: false };
            
            const r = reason(r1.data);
            logger.debug('facebook', `[Fetch] Result: ${r || 'OK but no media'}`);
            
            // Desktop fallback for checkpoint/login
            if (r === 'LOGIN' || r === 'CHECKPOINT') {
                logger.debug('facebook', `[Fetch] Attempt 2: desktop UA fallback`);
                const r2 = await get(true, true);
                return { html: r2.data || r1.data, usedCookie: true, usedFallback: true, ageGated: isAgeGated(r2.data || '') };
            }
            return { html: r1.data, usedCookie: true, usedFallback: false, ageGated: isAgeGated(r1.data || '') };
        }
        
        // REEL/VIDEO/POST/PHOTO: Try without cookie first (save cookies!)
        logger.debug('facebook', `[Fetch] Attempt 1: no cookie (${res.type})`);
        const r1 = await get(false);
        if (isValid(r1.data)) return { html: r1.data, usedCookie: false, usedFallback: false, ageGated: false };
        
        const r = reason(r1.data);
        logger.debug('facebook', `[Fetch] Result: ${r || 'OK but no media'}`);
        
        // No retry if no reason or no cookie available
        if (!r || !cookie) return { html: r1.data, usedCookie: false, usedFallback: false, ageGated: isAgeGated(r1.data || '') };
        
        // Retry with cookie
        logger.debug('facebook', `[Fetch] Attempt 2: with cookie (retry for ${r})`);
        const r2 = await get(true);
        if (isValid(r2.data)) return { html: r2.data, usedCookie: true, usedFallback: false, ageGated: false };
        
        // Desktop fallback for persistent login/checkpoint
        if (r === 'LOGIN' || r === 'CHECKPOINT') {
            logger.debug('facebook', `[Fetch] Attempt 3: desktop UA fallback`);
            const r3 = await get(true, true);
            return { html: r3.data || r2.data, usedCookie: true, usedFallback: true, ageGated: isAgeGated(r3.data || '') };
        }
        return { html: r2.data, usedCookie: true, usedFallback: false, ageGated: isAgeGated(r2.data || '') };
    } catch (e) {
        logger.error('facebook', e);
        return { html: null, usedCookie: false, usedFallback: false, ageGated: false };
    }
}

const ERR: Record<string, ScraperErrorCode> = {
    CHECKPOINT: ScraperErrorCode.CHECKPOINT_REQUIRED,
    LOGIN_REQUIRED: ScraperErrorCode.COOKIE_REQUIRED,
    UNAVAILABLE: ScraperErrorCode.NOT_FOUND,
    NOT_FOUND: ScraperErrorCode.NOT_FOUND,
    PRIVATE: ScraperErrorCode.PRIVATE_CONTENT,
    DELETED: ScraperErrorCode.DELETED,
    NO_MEDIA: ScraperErrorCode.NO_MEDIA,
};

export async function scrapeFacebook(url: string, options: ScraperOptions = {}): Promise<ScraperResult> {
    const t0 = Date.now();
    if (!FB_DOMAINS.test(url)) return createError(ScraperErrorCode.INVALID_URL, 'URL tidak valid');

    const res = await resolveUrl(url, options.cookie);
    const { html, usedCookie, usedFallback, ageGated } = await fetchWithRetry(res.url, res, options);
    
    if (!html) return createError(ScraperErrorCode.NETWORK_ERROR, 'Gagal mengambil halaman');
    logger.debug('facebook', `[HTML] len=${html.length}, media=${hasMedia(html)}`);

    const issue = detectIssue(html);
    const isCheckpoint = html.includes('/checkpoint/');
    
    if (isCheckpoint && usedCookie) cookiePoolMarkExpired('Checkpoint').catch(() => {});
    if (issue) {
        if (usedCookie && (issue.code === 'CHECKPOINT' || issue.code === 'LOGIN_REQUIRED'))
            cookiePoolMarkExpired(issue.code).catch(() => {});
        return createError(ERR[issue.code] || ScraperErrorCode.UNKNOWN, issue.message);
    }
    if (needsLogin(html)) {
        if (usedCookie) cookiePoolMarkError('Cookie not working').catch(() => {});
        return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Konten memerlukan login');
    }
    if (ageGated) {
        return createError(ScraperErrorCode.AGE_RESTRICTED, options.cookie ? 'Konten dibatasi usia' : 'Konten dibatasi usia. Gunakan cookie.');
    }

    const contentType = res.type !== 'unknown' ? TYPE_MAP[res.type] : detectContentType(res.url, html);
    const { formats, metadata } = extractContent(html, contentType, res.url);
    if (!formats.length) return createError(ScraperErrorCode.NO_MEDIA, 'Tidak ada media');

    const cleaned: MediaFormat[] = optimizeUrls(formats).map(({ _priority, ...f }) => f);
    const vids = cleaned.filter(f => f.type === 'video');
    const imgs = cleaned.filter(f => f.type === 'image');

    logger.debug('facebook', `[Done] ${((Date.now() - t0) / 1000).toFixed(1)}s, ${vids.length}v/${imgs.length}i${usedCookie ? ' +cookie' : ''}${usedFallback ? ' +desktop' : ''}`);

    return {
        success: true,
        data: {
            title: metadata.title || 'Facebook Media',
            thumbnail: cleaned.find(f => f.thumbnail)?.thumbnail || cleaned[0]?.url || '',
            author: metadata.author || 'Unknown',
            description: metadata.description,
            formats: cleaned,
            url,
            postedAt: metadata.timestamp,
            engagement: metadata.engagement,
            type: vids.length && imgs.length ? 'mixed' : vids.length ? 'video' : 'image',
            groupName: metadata.groupName,
        },
    };
}

function detectContentType(url: string, html: string): FbContentType {
    if (/\/stories\//.test(url)) return 'story';
    if (/\/reel\//.test(url)) return 'reel';
    if (/\/watch|\/videos?\/|fb\.watch/.test(url)) return 'video';
    if (/\/groups\//.test(url)) return 'group';
    if (/\/photo|fbid=/.test(url)) return 'photo';
    return (html.includes('"playable_url"') || html.includes('"progressive_url"')) ? 'video' : 'post';
}

export const platformMatches = (url: string) => FB_DOMAINS.test(url);
