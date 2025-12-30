// engines/risuncode.ts - HTML parsing based Facebook scraper engine (original logic)
import { httpGet, httpResolveUrl } from '@/lib/http/client';
import { extractContent, detectIssue, ISSUES } from '../extractor';
import { optimizeUrls } from '../cdn';
import type { ScraperResult, ScraperOptions } from '@/core/scrapers/types';
import { ScraperErrorCode, createError } from '@/core/scrapers/types';
import type { FbContentType, MediaFormat } from '../types';
import { logger } from '../../shared/logger';
import { cookiePoolMarkExpired, cookiePoolMarkError, cookiePoolGetRotating } from '@/lib/cookies';

const TIMEOUT = { resolve: 2500, fetch: 8000 };
const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;

const MEDIA = ['"all_subattachments"', '"photo_image"', '"viewer_image"', '"full_image"', '"progressive_url"', '"playable_url"'];
const AGE = ['"is_age_restricted":true', 'age-restricted', 'AgeGate', '"age_gate"'];

const has = (h: string, p: string[]) => p.some(x => h.includes(x));
const hasMedia = (h: string): boolean => !!(h && has(h, MEDIA));
const isAgeGated = (h: string) => has(h, AGE);
// needsLogin: true if login form present (regardless of media - media could be from suggested content)
const needsLogin = (h: string) => !h || h.includes('id="login_form"');
const isValid = (h: string | null): h is string => !!h && h.length > 5000 && hasMedia(h) && !needsLogin(h);

/**
 * Convert any cookie format to simple HTTP header format (name=value; name2=value2)
 * Supports: Netscape format, JSON format, simple string
 */
function normalizeToHttpCookie(cookieInput: string): string {
    const trimmed = cookieInput.trim();
    
    // Check if Netscape format (starts with # or has tab-separated lines)
    if (trimmed.startsWith('#') || trimmed.includes('\t')) {
        const cookies: string[] = [];
        const lines = trimmed.split('\n');
        for (const line of lines) {
            if (line.startsWith('#') || !line.trim()) continue;
            const parts = line.split('\t');
            if (parts.length >= 7) {
                // Netscape format: domain, subdom, path, secure, expiry, name, value
                const name = parts[5];
                const value = parts[6];
                if (name && value) {
                    cookies.push(`${name}=${value}`);
                }
            }
        }
        return cookies.join('; ');
    }
    
    // Check if JSON format
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            return arr
                .filter((c: any) => c.name && c.value)
                .map((c: any) => `${c.name}=${c.value}`)
                .join('; ');
        } catch {
            // Not valid JSON, return as-is
        }
    }
    
    // Already simple format or unknown - return as-is
    return trimmed;
}

type UrlType = 'story' | 'reel' | 'watch' | 'video' | 'photo' | 'post' | 'group_post' | 'unknown';
type ResolveResult = { url: string; type: UrlType; needsCookie: boolean; wasLogin: boolean };

function detectType(url: string): UrlType {
    if (url.includes('/stories/')) return 'story';
    if (url.includes('/reel/')) return 'reel';
    if (url.includes('/watch')) return 'watch';
    if (url.includes('/videos/')) return 'video';
    if (url.includes('/groups/') && url.includes('/permalink/')) return 'group_post';
    if (url.includes('/photo') || url.includes('fbid=')) return 'photo';
    if (url.includes('/posts/') || url.includes('/permalink.php')) return 'post';
    if (url.includes('/share/r/')) return 'reel';
    if (url.includes('/share/s/')) return 'story';
    if (url.includes('/share/p/')) return 'post';
    return 'unknown';
}

function typeCookieStrategy(type: UrlType): 'always' | 'try_first' | 'optional' {
    switch (type) {
        case 'story': return 'always';      // Stories ALWAYS need cookie
        // Group posts: try without cookie first (many are public)
        case 'group_post': return 'optional';
        default: return 'optional';
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
    
    // Skip resolution for already-resolved URLs (no /share/ pattern)
    // Router already resolved share URLs, so we get direct URLs here
    if (!url.includes('/share/')) {
        const strategy = typeCookieStrategy(preType);
        return { url, type: preType, needsCookie: strategy === 'always' || strategy === 'try_first', wasLogin: false };
    }
    
    // Legacy: handle /share/ URLs that somehow got here unresolved
    if (url.includes('/share/r/')) {
        return { url, type: 'reel', needsCookie: false, wasLogin: false };
    }
    if (url.includes('/share/s/')) {
        return { url, type: 'story', needsCookie: true, wasLogin: false };
    }
    
    const { resolved } = await httpResolveUrl(url, { platform: 'facebook', timeout: TIMEOUT.resolve });
    const finalUrl = resolved || url;
    
    if (finalUrl.includes('/login')) {
        const actual = extractNext(finalUrl);
        if (actual) {
            const t = detectType(actual);
            return { 
                url: actual.includes('/reel/') ? cleanReel(actual) : actual, 
                type: t, 
                needsCookie: true,
                wasLogin: true 
            };
        }
        if (cookie) {
            const r2 = await httpResolveUrl(url, { platform: 'facebook', timeout: TIMEOUT.resolve, cookie });
            if (r2.resolved && !r2.resolved.includes('/login')) {
                const t = detectType(r2.resolved);
                return { url: r2.resolved.includes('/reel/') ? cleanReel(r2.resolved) : r2.resolved, type: t, needsCookie: true, wasLogin: true };
            }
        }
        return { url, type: 'unknown', needsCookie: true, wasLogin: true };
    }
    
    const t = detectType(finalUrl);
    const strategy = typeCookieStrategy(t);
    return { 
        url: finalUrl.includes('/reel/') ? cleanReel(finalUrl) : finalUrl, 
        type: t, 
        needsCookie: strategy === 'always' || strategy === 'try_first',
        wasLogin: false 
    };
}

async function fetchWithRetry(url: string, res: ResolveResult, opts: ScraperOptions) {
    const { cookie } = opts;
    const strategy = typeCookieStrategy(res.type);
    const mustCookie = strategy === 'always' || (strategy === 'try_first' && res.needsCookie);
    
    // Facebook uses FIXED iPad UA - no desktop fallback needed
    const get = async (useCookie: boolean) => {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await httpGet(url, 'facebook', { cookie: useCookie ? cookie : undefined, timeout: TIMEOUT.fetch });
            } catch (e) {
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                } else {
                    throw e;
                }
            }
        }
        return httpGet(url, 'facebook', { cookie: useCookie ? cookie : undefined, timeout: TIMEOUT.fetch });
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
        // STORY/GROUP: Cookie first
        if (mustCookie && cookie) {
            const r1 = await get(true);
            if (isValid(r1.data)) return { html: r1.data, usedCookie: true, usedFallback: false, ageGated: false };
            return { html: r1.data, usedCookie: true, usedFallback: false, ageGated: isAgeGated(r1.data || '') };
        }
        
        // Others: Try without cookie first
        const r1 = await get(false);
        if (isValid(r1.data)) return { html: r1.data, usedCookie: false, usedFallback: false, ageGated: false };
        
        const r = reason(r1.data);
        if (!r || !cookie) return { html: r1.data, usedCookie: false, usedFallback: false, ageGated: isAgeGated(r1.data || '') };
        
        // Retry with cookie (same iPad UA)
        const r2 = await get(true);
        if (isValid(r2.data)) return { html: r2.data, usedCookie: true, usedFallback: false, ageGated: false };
        
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

/**
 * Risuncode engine - scrape Facebook using HTML parsing
 */
export async function scrapeWithRisuncode(url: string, options: ScraperOptions = {}): Promise<ScraperResult> {
    const t0 = Date.now();
    
    // Get cookie from pool if not provided, normalize to HTTP format
    let cookie = options.cookie || await cookiePoolGetRotating('facebook') || undefined;
    if (cookie) {
        cookie = normalizeToHttpCookie(cookie);
    }
    const opts: ScraperOptions = { ...options, cookie };

    const res = await resolveUrl(url, cookie);
    let { html, usedCookie, usedFallback, ageGated } = await fetchWithRetry(res.url, res, opts);
    
    if (!html) return createError(ScraperErrorCode.NETWORK_ERROR, 'Gagal mengambil halaman');

    let issue = detectIssue(html);
    const isCheckpoint = html.includes('/checkpoint/');
    
    // ═══════════════════════════════════════════════════════════════
    // RETRY LOGIC: If NOT_FOUND or UNAVAILABLE without cookie, retry WITH cookie
    // Many "not found" errors are actually age-restricted or login-required content
    // ═══════════════════════════════════════════════════════════════
    if (issue && !usedCookie && cookie) {
        const shouldRetry = issue.code === 'NOT_FOUND' || issue.code === 'UNAVAILABLE' || issue.code === 'LOGIN_REQUIRED';
        if (shouldRetry) {
            logger.debug('facebook', `[Risuncode] ${issue.code} without cookie, retrying with cookie...`);
            // Force retry with cookie
            const retryRes = { ...res, needsCookie: true };
            const retry = await fetchWithRetry(res.url, retryRes, { ...opts, cookie });
            if (retry.html && retry.html.length > html.length) {
                html = retry.html;
                usedCookie = retry.usedCookie;
                usedFallback = retry.usedFallback;
                ageGated = retry.ageGated;
                issue = detectIssue(html);
            }
        }
    }
    
    if (isCheckpoint && usedCookie) cookiePoolMarkExpired('Checkpoint').catch(() => {});
    if (issue) {
        if (usedCookie && (issue.code === 'CHECKPOINT' || issue.code === 'LOGIN_REQUIRED'))
            cookiePoolMarkExpired(issue.code).catch(() => {});
        // If still NOT_FOUND after cookie retry, return PRIVATE instead
        if (issue.code === 'NOT_FOUND' && usedCookie) {
            return createError(ScraperErrorCode.PRIVATE_CONTENT, 'Konten privat atau tidak tersedia');
        }
        return createError(ERR[issue.code] || ScraperErrorCode.UNKNOWN, issue.message);
    }
    if (needsLogin(html)) {
        if (usedCookie) cookiePoolMarkError('Cookie not working').catch(() => {});
        return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Konten memerlukan login');
    }
    if (ageGated) {
        return createError(ScraperErrorCode.AGE_RESTRICTED, cookie ? 'Konten dibatasi usia' : 'Konten dibatasi usia. Gunakan cookie.');
    }

    const contentType = res.type !== 'unknown' ? TYPE_MAP[res.type] : detectContentType(res.url, html);
    const { formats, metadata } = extractContent(html, contentType, res.url);
    if (!formats.length) {
        // No media found - if we didn't use cookie, try with cookie
        if (!usedCookie && cookie) {
            logger.debug('facebook', `[Risuncode] No media without cookie, retrying with cookie...`);
            const retryRes = { ...res, needsCookie: true };
            const retry = await fetchWithRetry(res.url, retryRes, { ...opts, cookie });
            if (retry.html && retry.html.length > 5000) {
                const retryContent = extractContent(retry.html, contentType, res.url);
                if (retryContent.formats.length > 0) {
                    const cleaned: MediaFormat[] = optimizeUrls(retryContent.formats).map(({ _priority, ...f }) => f);
                    const vids = cleaned.filter(f => f.type === 'video');
                    const imgs = cleaned.filter(f => f.type === 'image');
                    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
                    logger.debug('facebook', `[Risuncode] Done ${elapsed}s (retry), ${vids.length}v/${imgs.length}i`);
                    return {
                        success: true,
                        data: {
                            title: retryContent.metadata.title || 'Facebook Media',
                            thumbnail: cleaned.find(f => f.thumbnail)?.thumbnail || cleaned[0]?.url || '',
                            author: retryContent.metadata.author || 'Unknown',
                            description: retryContent.metadata.description,
                            formats: cleaned,
                            url,
                            postedAt: retryContent.metadata.timestamp,
                            engagement: retryContent.metadata.engagement,
                            type: vids.length && imgs.length ? 'mixed' : vids.length ? 'video' : 'image',
                            groupName: retryContent.metadata.groupName,
                            usedCookie: true,
                        },
                    };
                }
            }
        }
        return createError(ScraperErrorCode.NO_MEDIA, 'Tidak ada media');
    }

    const cleaned: MediaFormat[] = optimizeUrls(formats).map(({ _priority, ...f }) => f);
    const vids = cleaned.filter(f => f.type === 'video');
    const imgs = cleaned.filter(f => f.type === 'image');

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    logger.debug('facebook', `[Risuncode] Done ${elapsed}s, ${vids.length}v/${imgs.length}i`);

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
            usedCookie,
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
