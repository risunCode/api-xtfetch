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

// Fetch with retry - uses httpGet which handles UA rotation from browser pool
async function fetchWithRetry(url: string, options: ScraperOptions): Promise<string | null> {
    const timeout = options.timeout || sysConfigScraperTimeout('facebook');
    const cookie = options.cookie;

    // Custom headers for Facebook
    const customHeaders: Record<string, string> = {
        'Sec-Fetch-Site': 'none',
    };

    // Step 1: First fetch
    try {
        const res = await httpGet(url, { 
            platform: 'facebook', 
            cookie, 
            timeout,
            headers: customHeaders,
        });

        if (res.data && res.data.length > 100000) {
            return res.data;
        }
        
        // Check if login page or too small
        const hasLoginForm = res.data?.includes('id="login_form"') || res.data?.includes('name="login"');
        const isLoginPage = hasLoginForm || res.data?.includes('Log in to Facebook');
        
        if (isLoginPage || (res.data?.length || 0) < 100000) {
            // Step 2: Wait 4s and retry with cookie
            if (cookie) {
                await new Promise(r => setTimeout(r, 4000));
                
                const retryRes = await httpGet(url, { 
                    platform: 'facebook', 
                    cookie, 
                    timeout,
                    headers: customHeaders,
                });
                
                if (retryRes.data && retryRes.data.length > 30000) {
                    return retryRes.data;
                }
            }
        }
        
        return res.data || null;
        
    } catch (e: unknown) {
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
    // Log: processing
    console.log(`[FB] -> Processing: ${url}`);

    // 1. Validate URL
    if (!isValidFbUrl(url)) {
        return createError(ScraperErrorCode.INVALID_URL, 'URL tidak valid');
    }

    // 2. Fetch page with retry
    const html = await fetchWithRetry(url, options);
    if (!html) {
        return createError(ScraperErrorCode.NETWORK_ERROR, 'Gagal mengambil halaman');
    }

    // 3. Check for issues (login required, unavailable, etc)
    const issue = detectIssue(html);
    if (issue) {
        console.log(`[FB] x Issue: ${issue.code}`);
        return createError(mapErrorCode(issue.code), issue.message);
    }

    // 3.5. Check if we got a login page
    const hasLoginForm = html.includes('id="login_form"') || html.includes('name="login"');
    const hasLoginText = html.includes('Log in to Facebook') || html.includes('Log Into Facebook');
    const needsLogin = html.length < 30000 && (hasLoginForm || hasLoginText) && !html.includes('"actorID"');
    if (needsLogin) {
        console.log(`[FB] x Login required`);
        return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Konten memerlukan login');
    }

    // 4. Detect content type
    const contentType = detectContentType(url, html);

    // 5. Extract content (logging handled inside extractContent)
    const { formats, metadata } = extractContent(html, contentType, url);

    if (formats.length === 0) {
        console.log(`[FB] x No media found`);
        return createError(ScraperErrorCode.NO_MEDIA, 'Tidak ada media ditemukan');
    }

    // 6. Optimize URLs (CDN selection + sorting)
    const optimized = optimizeUrls(formats);

    // Log CDN selection
    if (optimized[0]) {
        logCdnSelection(optimized[0].url);
    }

    // 7. Clean up internal fields and build ScraperData
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
