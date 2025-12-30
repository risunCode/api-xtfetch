// router.ts - URL resolver and content type router for Facebook hybrid scraper
import { httpResolveUrl } from '@/lib/http/client';
import { logger } from '../shared/logger';
import type { FbContentType, RouteDecision, ResolveResult, EngineType } from './types';

const FB_DOMAINS = /facebook\.com|fb\.watch|fb\.com|fbwat\.ch/i;
const RESOLVE_TIMEOUT = 2500;

// URL pattern to content type mapping
const URL_PATTERNS: [RegExp, FbContentType][] = [
    // Direct patterns (high confidence)
    [/\/stories\//, 'story'],
    [/\/reel\/\d+/, 'reel'],
    [/\/watch\?v=/, 'watch'],
    [/\/watch\/?\?/, 'watch'],
    [/\/videos\/\d+/, 'video'],
    [/\/photo/, 'photo'],
    [/fbid=/, 'photo'],
    
    // Share patterns
    [/\/share\/r\//, 'reel'],
    [/\/share\/v\//, 'video'],
    [/\/share\/p\//, 'post'],  // Could be photo or video
    [/\/share\/s\//, 'story'],
    
    // Ambiguous patterns
    [/\/posts\//, 'post'],
    [/\/groups\/.*\/permalink\//, 'group'],
    [/\/groups\//, 'group'],
    [/\/permalink/, 'post'],
];

/**
 * Detect content type from URL
 */
export function detectContentType(url: string): FbContentType {
    for (const [pattern, type] of URL_PATTERNS) {
        if (pattern.test(url)) return type;
    }
    return 'unknown';
}

/**
 * Extract content ID from URL (pfbid or numeric)
 */
export function extractContentId(url: string): string | null {
    // pfbid format
    const pfbidMatch = url.match(/pfbid[A-Za-z0-9]+/);
    if (pfbidMatch) return pfbidMatch[0];
    
    // Numeric ID patterns
    const patterns = [
        /[?&]v=(\d+)/,           // ?v=123
        /\/videos\/(\d+)/,       // /videos/123
        /\/reel\/(\d+)/,         // /reel/123
        /\/posts\/(\d+)/,        // /posts/123
        /story_fbid=(\d+)/,      // story_fbid=123
        /\/permalink\/(\d+)/,    // /permalink/123
        /fbid=(\d+)/,            // fbid=123
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    
    return null;
}

/**
 * Extract actual URL from login redirect
 */
function extractFromLoginRedirect(url: string): string | null {
    try {
        const nextParam = new URL(url).searchParams.get('next');
        return nextParam ? decodeURIComponent(nextParam) : null;
    } catch {
        return null;
    }
}

/**
 * Clean reel URL (remove extra params)
 */
function cleanReelUrl(url: string): string {
    const match = url.match(/(https:\/\/[^\/]+\/reel\/\d+)/);
    return match ? match[1] : url;
}

/**
 * Check if URL needs resolution (short URLs, share URLs)
 */
function needsResolution(url: string): boolean {
    // Already resolved patterns - skip resolution
    if (/\/reel\/\d+|\/videos\/\d+|\/watch\/?\?v=|\/groups\/.*\/permalink\/|\/posts\/\d+/.test(url)) {
        return false;
    }
    if (url.includes('/stories/')) return false;
    
    // Share URLs - ALWAYS resolve to get actual content type
    // /share/r/ = reel (video), /share/v/ = video, /share/p/ = post (could be photo OR video!)
    // /share/s/ = story, /share/{id} = generic
    if (/\/share\//.test(url)) return true;
    
    // fb.watch short URLs
    if (/fb\.watch/.test(url)) return true;
    
    return false;
}

/**
 * Resolve Facebook URL and detect content type
 * Strategy: Try without cookie first, retry with cookie if fails or gets login redirect
 */
export async function resolveUrl(url: string, cookie?: string): Promise<ResolveResult> {
    const originalType = detectContentType(url);
    
    // Skip resolution for already-resolved URLs
    if (!needsResolution(url)) {
        logger.debug('facebook', `[Router] Skip resolve: ${originalType}`);
        return {
            originalUrl: url,
            resolvedUrl: url,
            contentType: originalType,
            contentId: extractContentId(url),
            needsCookie: originalType === 'story',
        };
    }
    
    // All /share/ URLs need resolution to determine actual content type
    logger.debug('facebook', `[Router] Resolving ${originalType}...`);
    
    // Helper to process resolved URL
    const processResolved = (finalUrl: string, usedCookie: boolean): ResolveResult | null => {
        // Check if it's a login redirect
        if (finalUrl.includes('/login')) {
            const actualUrl = extractFromLoginRedirect(finalUrl);
            if (actualUrl) {
                const resolvedType = detectContentType(actualUrl);
                const cleanUrl = actualUrl.includes('/reel/') ? cleanReelUrl(actualUrl) : actualUrl;
                logger.debug('facebook', `[Router] Login redirect -> ${resolvedType}`);
                return {
                    originalUrl: url,
                    resolvedUrl: cleanUrl,
                    contentType: resolvedType,
                    contentId: extractContentId(cleanUrl),
                    needsCookie: true,
                };
            }
            return null; // Need to retry with cookie
        }
        
        // Check if resolved to same URL (might need cookie for age-restricted)
        if (finalUrl === url && !usedCookie) {
            return null; // Try with cookie
        }
        
        // Successfully resolved
        const resolvedType = detectContentType(finalUrl);
        const cleanUrl = finalUrl.includes('/reel/') ? cleanReelUrl(finalUrl) : finalUrl;
        logger.debug('facebook', `[Router] Resolved: ${resolvedType} -> ${cleanUrl.substring(0, 80)}`);
        
        return {
            originalUrl: url,
            resolvedUrl: cleanUrl,
            contentType: resolvedType,
            contentId: extractContentId(cleanUrl),
            needsCookie: usedCookie || resolvedType === 'story',
        };
    };
    
    try {
        // Step 1: Try resolve WITHOUT cookie first
        const r1 = await httpResolveUrl(url, { 
            platform: 'facebook', 
            timeout: RESOLVE_TIMEOUT 
        });
        
        const result1 = processResolved(r1.resolved || url, false);
        if (result1) return result1;
        
        // Step 2: First resolve failed or got login redirect - retry WITH cookie
        if (cookie) {
            logger.debug('facebook', `[Router] Retry resolve with cookie...`);
            const r2 = await httpResolveUrl(url, { 
                platform: 'facebook', 
                timeout: RESOLVE_TIMEOUT, 
                cookie 
            });
            
            if (r2.resolved && r2.resolved !== url) {
                const result2 = processResolved(r2.resolved, true);
                if (result2) return result2;
            }
        }
        
        // Couldn't resolve - return original URL with unknown type
        logger.debug('facebook', `[Router] Could not resolve, using original`);
        return {
            originalUrl: url,
            resolvedUrl: url,
            contentType: originalType,
            contentId: null,
            needsCookie: true,
        };
        
    } catch (err) {
        // Step 3: If first resolve throws error, try with cookie
        logger.debug('facebook', `[Router] Resolve error: ${err instanceof Error ? err.message : 'Unknown'}`);
        
        if (cookie) {
            try {
                logger.debug('facebook', `[Router] Retry resolve with cookie after error...`);
                const r2 = await httpResolveUrl(url, { 
                    platform: 'facebook', 
                    timeout: RESOLVE_TIMEOUT, 
                    cookie 
                });
                
                if (r2.resolved && r2.resolved !== url) {
                    const result2 = processResolved(r2.resolved, true);
                    if (result2) return result2;
                }
            } catch (err2) {
                logger.debug('facebook', `[Router] Cookie resolve also failed: ${err2 instanceof Error ? err2.message : 'Unknown'}`);
            }
        }
        
        return {
            originalUrl: url,
            resolvedUrl: url,
            contentType: originalType,
            contentId: extractContentId(url),
            needsCookie: true,
        };
    }
}

/**
 * Get routing decision based on content type
 * 
 * yt-dlp supports: reel, video, watch
 * Risuncode supports: ALL (story, photo, post, group, etc)
 */
export function getRouteDecision(contentType: FbContentType): RouteDecision {
    switch (contentType) {
        // yt-dlp primary (video content - fast & accurate)
        case 'reel':
        case 'video':
        case 'watch':
            return {
                primaryEngine: 'ytdlp',
                fallbackEngine: 'risuncode',
                reason: 'Video content - yt-dlp faster and more accurate',
            };
        
        // Risuncode ONLY - yt-dlp does NOT support these
        case 'photo':
            return {
                primaryEngine: 'risuncode',
                fallbackEngine: null,
                reason: 'Photo content - yt-dlp does not support',
            };
        
        case 'story':
            return {
                primaryEngine: 'risuncode',
                fallbackEngine: null,
                reason: 'Story content - yt-dlp does not support',
            };
        
        case 'group':
            return {
                primaryEngine: 'risuncode',
                fallbackEngine: null,
                reason: 'Group content - yt-dlp unreliable for groups',
            };
        
        // Post could be photo or video - try Risuncode first (more reliable)
        // yt-dlp often fails or returns wrong metadata for posts
        case 'post':
            return {
                primaryEngine: 'risuncode',
                fallbackEngine: 'ytdlp',
                reason: 'Post content - Risuncode more reliable, fallback to yt-dlp for video posts',
            };
        
        // Unknown - try Risuncode first (safer)
        case 'unknown':
        default:
            return {
                primaryEngine: 'risuncode',
                fallbackEngine: 'ytdlp',
                reason: 'Unknown content - Risuncode safer, fallback to yt-dlp',
            };
    }
}

/**
 * Check if URL matches Facebook domain
 */
export function platformMatches(url: string): boolean {
    return FB_DOMAINS.test(url);
}
