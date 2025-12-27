// scraper.ts - Main Facebook scraper logic
import { httpGet } from '@/lib/http/client';
import { sysConfigScraperTimeout } from '@/lib/config/system';
import { extractContent, detectIssue } from './extractor';
import { optimizeUrls, logCdnSelection } from './cdn';
import type { ScraperResult, ScraperOptions } from '@/core/scrapers/types';
import { ScraperErrorCode, createError } from '@/core/scrapers/types';
import type { FbContentType, MediaFormat } from './index';

// URL validation
const FB_DOMAINS = /facebook\.com|fb\.watch|fb\.com|fbwat\.ch/i;
const isValidFbUrl = (url: string): boolean => FB_DOMAINS.test(url);

// Normalize Facebook URL - use web.facebook.com for stories (works better with cookies)
function normalizeUrl(url: string): string {
    // Stories work better with web.facebook.com (www redirects to login)
    if (/\/stories\/|\/share\/s\//.test(url)) {
        return url.replace(/(?:www|m)\.facebook\.com/, 'web.facebook.com');
    }
    return url;
}

// Content type detection
const TYPE_PATTERNS: [RegExp, FbContentType][] = [
    [/\/stories\/|\/share\/s\//, 'story'],
    [/\/reel\/|\/share\/r\//, 'reel'],
    [/\/watch|\/videos?\/|fb\.watch|fbwat\.ch/, 'video'],
    [/\/groups\//, 'group'],
    [/\/photo|fbid=/, 'photo'],
];

function detectContentType(url: string, html: string): FbContentType {
    for (const [pattern, type] of TYPE_PATTERNS) {
        if (pattern.test(url)) return type;
    }
    
    // Check HTML content - prioritize image posts over video
    // Key indicators for image posts (from yt-dlp patterns)
    const hasSubattachments = html.includes('"all_subattachments"');
    const hasPhotoImage = html.includes('"photo_image"');
    const hasFullImage = html.includes('"full_image"');
    const hasLargeShare = html.includes('"large_share"');
    const hasViewerImage = html.includes('"viewer_image"');
    
    // Video indicators
    const hasVideoId = html.includes('"video_id"');
    const hasPlayableUrl = html.includes('"playable_url"');
    const hasProgressiveUrl = html.includes('"progressive_url"');
    
    // If has subattachments (multi-image post) or photo patterns without video, treat as post
    const hasImageIndicators = hasSubattachments || hasPhotoImage || hasFullImage || hasLargeShare || hasViewerImage;
    const hasVideoIndicators = hasVideoId || hasPlayableUrl || hasProgressiveUrl;
    
    // Prioritize image posts - if has image indicators but no clear video, it's a post
    if (hasImageIndicators && !hasVideoIndicators) return 'post';
    if (hasSubattachments) return 'post'; // Multi-image posts always have this
    if (hasVideoIndicators) return 'video';
    
    return 'post';
}

// Resolve shortlink URL - for /share/r/, /share/v/, fb.watch
// Note: Facebook shortlinks need login, so we just normalize and let fetchWithRetry handle with cookie
async function resolveUrl(url: string): Promise<string> {
    const isShortlink = /\/share\/[rvs]\/|fb\.watch|fbwat\.ch/i.test(url);
    if (!isShortlink) return url;
    
    console.log(`[FB] -> Shortlink detected (needs cookie)`);
    return url;
}

// Detect if HTML is a login page
function isLoginPage(html: string): boolean {
    if (!html || html.length < 1000) return true;
    
    // Strong indicators of login page
    const loginIndicators = [
        'id="login_form"',
        'name="login"',
        'Log in to Facebook',
        'Log Into Facebook', 
        'You must log in to continue',
        'must log in',
        '/login/?next=',
    ];
    
    // Check for login indicators
    for (const indicator of loginIndicators) {
        if (html.includes(indicator)) {
            // But also check if we have video data (logged in view can have login form in header)
            const hasVideoData = html.includes('"progressive_url"') || 
                                html.includes('"playable_url"') ||
                                html.includes('"browser_native');
            if (hasVideoData) return false; // Has video data, not a login page
            return true;
        }
    }
    
    return false;
}

// Fetch with retry - uses httpGet which handles UA rotation from browser pool
async function fetchWithRetry(url: string, options: ScraperOptions, contentType?: FbContentType): Promise<string | null> {
    const timeout = options.timeout || sysConfigScraperTimeout('facebook');
    const cookie = options.cookie;
    const isStory = contentType === 'story' || url.includes('/stories/') || url.includes('/share/s/');
    const isShortlink = /\/share\/[rvs]\/|fb\.watch|fbwat\.ch/i.test(url);

    // Don't set Referer/Origin - let it be a fresh navigation request
    // Setting platform causes httpGet to add Referer which Facebook may reject
    const customHeaders: Record<string, string> = {
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
    };

    // Step 1: First fetch - shortlinks NEED cookie, direct URLs try without first
    try {
        const useCookieFirst = isShortlink || isStory;
        const firstCookie = useCookieFirst ? cookie : undefined;
        
        console.log(`[FB] -> Fetch ${useCookieFirst ? 'with' : 'without'} cookie...`);
        
        // Don't pass platform to avoid Referer/Origin being set
        const res = await httpGet(url, { 
            cookie: firstCookie, 
            timeout,
            headers: customHeaders,
        });

        // Check if we got good data
        if (res.data && res.data.length > 100000 && !isLoginPage(res.data)) {
            return res.data;
        }
        
        // Check if login page
        if (isLoginPage(res.data || '')) {
            console.log(`[FB] -> Login page detected`);
            
            // If we didn't use cookie, retry with cookie
            if (!useCookieFirst && cookie) {
                console.log(`[FB] -> Retry with cookie...`);
                await new Promise(r => setTimeout(r, 3000));
                
                const retryRes = await httpGet(url, { 
                    cookie, 
                    timeout,
                    headers: customHeaders,
                });
                
                if (retryRes.data && !isLoginPage(retryRes.data)) {
                    return retryRes.data;
                }
                
                // Still login page after cookie
                console.log(`[FB] -> Still login page, cookie may be expired`);
            } else if (useCookieFirst) {
                // Already used cookie but still login page
                console.log(`[FB] -> Cookie expired or invalid`);
            }
        }
        
        // Return whatever we got (might be small but valid)
        return res.data || null;
        
    } catch (e: unknown) {
        console.log(`[FB] -> Fetch error: ${e instanceof Error ? e.message : 'unknown'}`);
        return null;
    }
}

// Map internal error codes to ScraperErrorCode
function mapErrorCode(code: string): ScraperErrorCode {
    const map: Record<string, ScraperErrorCode> = {
        'INVALID_URL': ScraperErrorCode.INVALID_URL,
        'NETWORK_ERROR': ScraperErrorCode.NETWORK_ERROR,
        'CHECKPOINT': ScraperErrorCode.CHECKPOINT_REQUIRED,
        'LOGIN_REQUIRED': ScraperErrorCode.COOKIE_REQUIRED,
        'UNAVAILABLE': ScraperErrorCode.NOT_FOUND,
        'NOT_FOUND': ScraperErrorCode.NOT_FOUND,
        'PRIVATE': ScraperErrorCode.PRIVATE_CONTENT,
        'DELETED': ScraperErrorCode.DELETED,
        'NO_MEDIA': ScraperErrorCode.NO_MEDIA,
    };
    return map[code] || ScraperErrorCode.UNKNOWN;
}


// Main scraper function
export async function scrapeFacebook(url: string, options: ScraperOptions = {}): Promise<ScraperResult> {
    // 1. Validate URL first
    if (!isValidFbUrl(url)) {
        return createError(ScraperErrorCode.INVALID_URL, 'URL tidak valid');
    }

    // 2. Resolve shortlinks (share/r/, share/v/, fb.watch)
    const resolvedUrl = await resolveUrl(url);
    
    // 3. Normalize URL (use web.facebook.com for stories)
    const normalizedUrl = normalizeUrl(resolvedUrl);
    
    // Log: processing
    console.log(`[FB] -> Processing: ${normalizedUrl}`);

    // 4. Pre-detect content type from URL (for better fetch handling)
    const isStoryUrl = /\/stories\/|\/share\/s\//.test(normalizedUrl);
    const isReelUrl = /\/reel\/|\/share\/r\//.test(normalizedUrl);
    const preContentType: FbContentType | undefined = isStoryUrl ? 'story' : isReelUrl ? 'reel' : undefined;

    // 5. Fetch page with retry (pass content type for type-specific handling)
    const html = await fetchWithRetry(normalizedUrl, options, preContentType);
    if (!html) {
        // For stories/shortlinks, give more specific error
        if (isStoryUrl || /\/share\/[rvs]\//.test(normalizedUrl)) {
            return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Konten memerlukan cookie yang valid');
        }
        return createError(ScraperErrorCode.NETWORK_ERROR, 'Gagal mengambil halaman');
    }

    // 6. Check for issues (login required, unavailable, etc)
    const issue = detectIssue(html);
    if (issue) {
        console.log(`[FB] x Issue: ${issue.code}`);
        return createError(mapErrorCode(issue.code), issue.message);
    }

    // 7. Final login check - if still login page after all retries
    if (isLoginPage(html)) {
        console.log(`[FB] x Login required (final check)`);
        return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Konten memerlukan login. Cookie mungkin expired.');
    }

    // 8. Detect content type
    const contentType = detectContentType(normalizedUrl, html);

    // 9. Extract content (logging handled inside extractContent)
    const { formats, metadata } = extractContent(html, contentType, normalizedUrl);

    if (formats.length === 0) {
        console.log(`[FB] x No media found`);
        // For stories, give more specific error
        if (contentType === 'story') {
            return createError(ScraperErrorCode.NO_MEDIA, 'Story tidak ditemukan atau sudah expired (24 jam)');
        }
        return createError(ScraperErrorCode.NO_MEDIA, 'Tidak ada media ditemukan');
    }

    // 10. Optimize URLs (CDN selection + sorting)
    const optimized = optimizeUrls(formats);

    // Log CDN selection
    if (optimized[0]) {
        logCdnSelection(optimized[0].url);
    }

    // 11. Clean up internal fields and build ScraperData
    const cleaned: MediaFormat[] = optimized.map(({ _priority, ...f }) => f);
    const thumbnail = cleaned.find(f => f.thumbnail)?.thumbnail || cleaned[0]?.url || '';
    const hasVideo = cleaned.some(f => f.type === 'video');
    const hasImage = cleaned.some(f => f.type === 'image');

    return {
        success: true,
        data: {
            title: metadata.title || 'Facebook Media',
            thumbnail,
            author: metadata.author || 'Unknown',
            description: metadata.description,
            formats: cleaned,
            url,
            postedAt: metadata.timestamp,
            engagement: metadata.engagement,
            type: hasVideo && hasImage ? 'mixed' : hasVideo ? 'video' : 'image',
        },
    };
}

// Platform check helper (for external use)
export function platformMatches(url: string): boolean {
    return isValidFbUrl(url);
}
