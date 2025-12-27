/**
 * Facebook Extraction Helpers
 * 
 * Pre-compiled regex patterns and single-pass extraction functions
 * for optimized Facebook scraping performance.
 * 
 * @module fb-extractor
 */

import { utilDecodeUrl, utilDecodeHtml } from '@/lib/utils';
import { httpPost, DESKTOP_USER_AGENT } from '@/lib/http';
import type { MediaFormat } from '@/lib/types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Extracted video URLs with quality variants */
export interface FbVideoResult {
    hd?: string;
    sd?: string;
    thumbnail?: string;
}

/** Extracted metadata from Facebook content */
export interface FbMetadata {
    thumbnail?: string;
    author?: string;
    title?: string;
    description?: string;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    postedAt?: string;
}

/** Story media item */
export interface FbStoryItem {
    type: 'video' | 'image';
    url: string;
    thumbnail?: string;
    quality?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-COMPILED PATTERNS (faster than creating new RegExp each time)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Combined video URL pattern - matches all Facebook video URL formats in single pass
 * Captures: browser_native_hd_url, browser_native_sd_url, playable_url_quality_hd, 
 *           playable_url, hd_src, sd_src, hd_src_no_ratelimit, sd_src_no_ratelimit
 */
export const FB_VIDEO_PATTERN = /"(?:browser_native_(?:hd|sd)_url|playable_url(?:_quality_hd)?|(?:hd|sd)_src(?:_no_ratelimit)?)":"(https:[^"]+)"/g;

/**
 * Individual patterns for specific extractions
 */
export const FB_PATTERNS = {
    // Thumbnail patterns
    thumbnail: /"(?:previewImage|thumbnailImage|poster_image|preferred_thumbnail)"[^}]*?"uri":"(https:[^"]+)"/,
    storyThumbnail: /"(?:previewImage|story_thumbnail|poster_image)":\{"uri":"(https:[^"]+)"/,
    
    // Author patterns
    author: /"(?:owning_profile|owner)"[^}]*?"name":"([^"]+)"/,
    authorAlt: /"actors":\[\{"__typename":"User","name":"([^"]+)"/,
    authorReels: /"name":"([^"]+)","enable_reels_tab_deeplink":true/,
    
    // Engagement patterns
    likes: /"reaction_count":\{"count":(\d+)/,
    likesAlt: /"i18n_reaction_count":"([\d,\.KMkm]+)"/,
    comments: /"comment_count":\{"total_count":(\d+)/,
    commentsAlt: /"comments":\{"total_count":(\d+)/,
    shares: /"share_count":\{"count":(\d+)/,
    sharesAlt: /"reshares":\{"count":(\d+)/,
    views: /"video_view_count":(\d+)/,
    viewsAlt: /"play_count":(\d+)/,
    
    // Content patterns - more specific to avoid UI text
    // Primary: message in comet_sections (actual post content)
    messageComet: /"comet_sections"[^}]*?"message":\{"text":"([^"]{3,})"/,
    // Secondary: message near story/post context
    messageStory: /"story"[^}]{0,200}"message":\{"text":"([^"]{3,})"/,
    // Tertiary: generic message (may catch UI text)
    message: /"message":\{"text":"([^"]{10,})"/,
    // Caption fallback
    caption: /"caption":"([^"]{10,})"/,
    creationTime: /"(?:creation|created|publish)_time":(\d{10})/,
    
    // Story video patterns - PRIORITIZE MUXED AUDIO
    // Pattern with quality metadata (progressive_url with HD/SD) - HAS AUDIO
    storyVideo: /"progressive_url":"(https:[^"]+\.mp4[^"]*)","failure_reason":null,"metadata":\{"quality":"(HD|SD)"\}/g,
    storyVideoFallback: /"progressive_url":"(https:[^"]+\.mp4[^"]*)"/g,
    
    // Additional story video patterns for better audio coverage
    storyPlayableUrl: /"playable_url":"(https:[^"]+\.mp4[^"]*)"/g,
    storyVideoData: /"video":\{[^}]*"playable_url":"(https:[^"]+\.mp4[^"]*)"/g,
    unifiedStoryVideo: /"unified_stories"[^}]*"playable_url":"(https:[^"]+\.mp4[^"]*)"/g,
    
    // Story image pattern (t51.82787 = story image type)
    storyImage: /https:\/\/scontent[^"'\s<>\\]+t51\.82787[^"'\s<>\\]+\.jpg[^"'\s<>\\]*/gi,
    
    // Post image patterns
    viewerImage: /"viewer_image":\{"height":(\d+),"width":(\d+),"uri":"(https:[^"]+)"/g,
    photoImage: /"photo_image":\{"uri":"(https:[^"]+)"/g,
    imageUri: /"image":\{"uri":"(https:[^"]+t39\.30808[^"]+)"/g,
    
    // Subattachments (multi-image posts)
    subattachments: /"all_subattachments":\{"count":(\d+)/,
    
    // DASH video format
    dashVideo: /"height":(\d+)[^}]*?"base_url":"(https:[^"]+\.mp4[^"]*)"/g,
} as const;

/** Skip SIDs - profile pictures, avatars, etc. */
const SKIP_SIDS = ['bd9a62', '23dd7b', '50ce42', '9a7156', '1d2534', 'e99d92', 'a6c039', '72b077', 'ba09c1', 'f4d7c3', '0f7a8c', '3c5e9a', 'd41d8c'];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clean escaped characters from URL/string
 */
const clean = (s: string): string => s.replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');

/**
 * Check if URL is a valid Facebook media URL
 */
const isValidMedia = (url: string): boolean => url?.length > 30 && /fbcdn|scontent/.test(url) && !/<|>/.test(url);

/**
 * Check if image should be skipped (profile pics, avatars, emojis, etc.)
 */
const isSkipImage = (url: string): boolean => 
    SKIP_SIDS.some(s => url.includes(`_nc_sid=${s}`)) || 
    /emoji|sticker|static|rsrc|profile|avatar|\/cp0\/|\/[ps]\d+x\d+\/|_s\d+x\d+|\.webp\?/i.test(url);

/**
 * Check if URL is a muted video (no audio)
 * Facebook sometimes returns muted versions for geo-restricted content
 * Common patterns: muted_shared_audio, _nc_vs=...muted
 */
const isMutedUrl = (url: string): boolean => 
    /muted|_nc_vs=.*muted|muted_shared_audio/i.test(url);

/**
 * Parse engagement number string (handles K, M suffixes)
 */
const parseEngagement = (s: string): number => {
    const n = parseFloat(s.replace(/,/g, ''));
    if (isNaN(n)) return 0;
    if (/[kK]$/.test(s)) return Math.round(n * 1000);
    if (/[mM]$/.test(s)) return Math.round(n * 1000000);
    return Math.round(n);
};

/**
 * Decode unicode escape sequences in string
 */
const decodeUnicode = (s: string): string => 
    s.replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE-PASS VIDEO EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Video URL patterns with priority (higher = better, usually has audio)
 * 
 * AUDIO PRIORITY ORDER:
 * 1. progressive_url (85) - Regional CDN, muxed ✅ HAS AUDIO (FAST!)
 * 2. playable_url_quality_hd (100) - HD muxed (video+audio) ✅ HAS AUDIO
 * 3. playable_url (90) - SD muxed (video+audio) ✅ HAS AUDIO
 * 4. hd_src / sd_src (50-40) - legacy, usually muxed ✅ HAS AUDIO
 * 5. browser_native_hd_url (10) - HD video-only ❌ NO AUDIO
 * 6. browser_native_sd_url (5) - SD video-only ❌ NO AUDIO
 * 
 * IMPORTANT: browser_native_* URLs are VIDEO-ONLY streams without audio!
 * Always prefer playable_url/progressive_url variants which contain muxed video+audio.
 * 
 * CDN NOTE: progressive_url often comes from regional CDN (e.g. scontent.fbdj2-1.fna = Singapore)
 * while playable_url may come from US CDN (video-bos5-1 = Boston). Prefer regional for speed!
 */
const VIDEO_URL_PATTERNS = [
    // MUXED (video+audio) - HIGHEST PRIORITY
    { pattern: /"playable_url_quality_hd":"(https:[^"]+)"/, quality: 'hd', priority: 100, hasMuxedAudio: true },
    { pattern: /"playable_url":"(https:[^"]+)"/, quality: 'sd', priority: 90, hasMuxedAudio: true },
    
    // Legacy src patterns - usually muxed
    { pattern: /"hd_src_no_ratelimit":"(https:[^"]+)"/, quality: 'hd', priority: 60, hasMuxedAudio: true },
    { pattern: /"sd_src_no_ratelimit":"(https:[^"]+)"/, quality: 'sd', priority: 55, hasMuxedAudio: true },
    { pattern: /"hd_src":"(https:[^"]+)"/, quality: 'hd', priority: 50, hasMuxedAudio: true },
    { pattern: /"sd_src":"(https:[^"]+)"/, quality: 'sd', priority: 45, hasMuxedAudio: true },
    
    // VIDEO-ONLY - LOWEST PRIORITY (only use if no muxed available)
    { pattern: /"browser_native_hd_url":"(https:[^"]+)"/, quality: 'hd', priority: 10, hasMuxedAudio: false },
    { pattern: /"browser_native_sd_url":"(https:[^"]+)"/, quality: 'sd', priority: 5, hasMuxedAudio: false },
];

/**
 * Check if URL is from regional CDN (faster for Asia servers)
 * Regional CDNs: fbdj2 (Singapore), hkg (Hong Kong), nrt (Tokyo), etc.
 * US CDNs: bos5 (Boston), iad (Virginia), lax (LA), sjc (San Jose)
 */
const isRegionalCdn = (url: string): boolean => 
    /fbdj|fna\.fbcdn|hkg|nrt|sin|sgp/i.test(url);

const isUsCdn = (url: string): boolean =>
    /bos\d|iad\d|lax\d|sjc\d|video-.*\.xx\.fbcdn/i.test(url);

/**
 * Extract video URLs from HTML with audio priority
 * 
 * Prioritizes playable_url (muxed video+audio) over browser_native_* 
 * which often contains video-only streams without audio.
 * Also detects and deprioritizes muted URLs (geo-restricted content).
 * 
 * NEW: Also extracts progressive_url which often comes from regional CDN!
 * 
 * @param html - HTML content to search
 * @returns Object with HD and SD video URLs if found
 */
export function fbExtractVideos(html: string): FbVideoResult {
    const result: FbVideoResult = {};
    
    // Collect all found URLs with their priority and audio info
    const hdCandidates: { url: string; priority: number; hasMuxedAudio: boolean; isMuted: boolean; isRegional: boolean }[] = [];
    const sdCandidates: { url: string; priority: number; hasMuxedAudio: boolean; isMuted: boolean; isRegional: boolean }[] = [];
    
    // First, extract from standard patterns
    for (const { pattern, quality, priority, hasMuxedAudio } of VIDEO_URL_PATTERNS) {
        const match = html.match(pattern);
        if (match?.[1]) {
            const url = utilDecodeUrl(match[1]);
            const muted = isMutedUrl(url);
            const regional = isRegionalCdn(url);
            // Reduce priority significantly if URL is muted
            // BOOST priority if regional CDN (faster!)
            let adjustedPriority = muted ? priority - 50 : priority;
            if (regional && !muted) adjustedPriority += 15; // Boost regional CDN
            
            if (quality === 'hd') {
                hdCandidates.push({ url, priority: adjustedPriority, hasMuxedAudio, isMuted: muted, isRegional: regional });
            } else {
                sdCandidates.push({ url, priority: adjustedPriority, hasMuxedAudio, isMuted: muted, isRegional: regional });
            }
        }
    }
    
    // NEW: Extract progressive_url (often regional CDN with audio!)
    // Pattern: "progressive_url":"https://..." with optional quality metadata
    const progressivePattern = /"progressive_url":"(https:[^"]+\.mp4[^"]*)"/g;
    let progMatch;
    const seenUrls = new Set(hdCandidates.map(c => c.url).concat(sdCandidates.map(c => c.url)));
    
    while ((progMatch = progressivePattern.exec(html)) !== null) {
        const url = utilDecodeUrl(progMatch[1]);
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        
        const muted = isMutedUrl(url);
        const regional = isRegionalCdn(url);
        const isHD = /720|1080|_hd|gen2_720/i.test(url);
        
        // Progressive URLs have audio and often from regional CDN
        // Base priority 85, boost if regional
        let priority = 85;
        if (regional && !muted) priority += 15; // Regional boost
        if (muted) priority -= 50;
        
        const candidate = { url, priority, hasMuxedAudio: true, isMuted: muted, isRegional: regional };
        
        if (isHD) {
            hdCandidates.push(candidate);
        } else {
            sdCandidates.push(candidate);
        }
    }
    
    // Also check DASH videos (base_url pattern) - often regional
    const dashPattern = /"height":(\d+)[^}]*?"base_url":"(https:[^"]+\.mp4[^"]*)"/g;
    let dashMatch;
    while ((dashMatch = dashPattern.exec(html)) !== null) {
        const height = parseInt(dashMatch[1]);
        const url = utilDecodeUrl(dashMatch[2]);
        if (seenUrls.has(url) || height < 360) continue;
        seenUrls.add(url);
        
        const muted = isMutedUrl(url);
        const regional = isRegionalCdn(url);
        const isHD = height >= 720;
        
        let priority = 70;
        if (regional && !muted) priority += 15;
        if (muted) priority -= 50;
        
        const candidate = { url, priority, hasMuxedAudio: true, isMuted: muted, isRegional: regional };
        
        if (isHD) {
            hdCandidates.push(candidate);
        } else {
            sdCandidates.push(candidate);
        }
    }
    // Sort by priority (highest first) - regional CDN preferred
    // Priority already boosted for regional, but add secondary sort for same priority
    hdCandidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        // Prefer regional CDN at same priority
        if (a.isRegional !== b.isRegional) return a.isRegional ? -1 : 1;
        if (a.isMuted !== b.isMuted) return a.isMuted ? 1 : -1;
        return (b.hasMuxedAudio ? 1 : 0) - (a.hasMuxedAudio ? 1 : 0);
    });
    sdCandidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (a.isRegional !== b.isRegional) return a.isRegional ? -1 : 1;
        if (a.isMuted !== b.isMuted) return a.isMuted ? 1 : -1;
        return (b.hasMuxedAudio ? 1 : 0) - (a.hasMuxedAudio ? 1 : 0);
    });
    
    // Log selected URL for debugging
    if (hdCandidates.length > 0) {
        const best = hdCandidates[0];
        console.log(`[Facebook.Extract] HD selected: ${best.isRegional ? 'REGIONAL' : 'US'} CDN, priority=${best.priority}, muxed=${best.hasMuxedAudio}`);
        result.hd = best.url;
    }
    if (sdCandidates.length > 0 && sdCandidates[0].url !== result.hd) {
        result.sd = sdCandidates[0].url;
    }
    
    // If only SD found but it's high quality, use as HD
    if (!result.hd && result.sd) {
        result.hd = result.sd;
        result.sd = undefined;
    }
    
    // Extract thumbnail
    const thumbMatch = html.match(FB_PATTERNS.thumbnail);
    if (thumbMatch && /scontent|fbcdn/.test(thumbMatch[1])) {
        result.thumbnail = clean(thumbMatch[1]);
    }
    
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TARGETED BLOCK FINDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find the relevant video block in HTML to reduce search area
 * 
 * Instead of parsing entire 500KB+ HTML, this finds the ~20KB block
 * containing the video data, significantly improving performance.
 * 
 * @param html - Full HTML content
 * @param videoId - Optional video ID to target specific content
 * @returns Substring of HTML containing video data
 * 
 * @example
 * ```typescript
 * const block = fbFindVideoBlock(html, '123456789');
 * const { hd, sd } = fbExtractVideos(block);
 * ```
 */
export function fbFindVideoBlock(html: string, videoId?: string): string {
    const MAX_BLOCK_SIZE = 25000;
    const CONTEXT_BEFORE = 2000;
    const CONTEXT_AFTER = 20000;
    
    // Priority keys to search for
    const videoKeys = [
        '"browser_native_hd_url":',
        '"browser_native_sd_url":',
        '"playable_url_quality_hd":',
        '"playable_url":',
        '"videoPlayerOriginData"',
    ];
    
    // If videoId provided, try to find it first
    if (videoId) {
        const idPatterns = [
            `"video_id":"${videoId}"`,
            `"id":"${videoId}"`,
            `/videos/${videoId}`,
            `/reel/${videoId}`,
        ];
        
        for (const pattern of idPatterns) {
            const pos = html.indexOf(pattern);
            if (pos > -1) {
                // Search around the video ID for video URLs
                const searchStart = Math.max(0, pos - 5000);
                const searchEnd = Math.min(html.length, pos + 50000);
                const searchArea = html.substring(searchStart, searchEnd);
                
                // Check if this area has video URLs
                for (const key of videoKeys) {
                    if (searchArea.includes(key)) {
                        return searchArea;
                    }
                }
            }
        }
    }
    
    // Find first occurrence of video URL keys
    for (const key of videoKeys) {
        const pos = html.indexOf(key);
        if (pos > -1) {
            const start = Math.max(0, pos - CONTEXT_BEFORE);
            const end = Math.min(html.length, pos + CONTEXT_AFTER);
            return html.substring(start, end);
        }
    }
    
    // Fallback: return first 100KB
    return html.substring(0, 100000);
}

/**
 * Find the relevant post/image block in HTML
 * 
 * @param html - Full HTML content
 * @param postId - Optional post ID to target specific content
 * @returns Substring of HTML containing post data
 */
export function fbFindPostBlock(html: string, postId?: string): string {
    const MAX_SEARCH = 150000;
    const CONTEXT_BEFORE = 2000;
    const CONTEXT_AFTER = 50000;
    
    // Strategy 1: If postId provided, find the block containing that ID
    if (postId) {
        const idPatterns = [
            `"post_id":"${postId}"`,
            `"id":"${postId}"`,
            `story_fbid=${postId}`,
            `/posts/${postId}`,
            `"fbid":"${postId}"`,
            `pfbid${postId.substring(0, 10)}`, // pfbid partial match
        ];
        
        for (const pattern of idPatterns) {
            const pos = html.indexOf(pattern);
            if (pos > -1) {
                const start = Math.max(0, pos - CONTEXT_BEFORE);
                const end = Math.min(html.length, pos + CONTEXT_AFTER);
                const block = html.substring(start, end);
                
                // Verify this block has media content
                if (block.includes('all_subattachments') || block.includes('viewer_image') || block.includes('photo_image')) {
                    return block;
                }
            }
        }
    }
    
    // Strategy 2: Find "comet_sections" which contains the main post content
    // This is more reliable than just looking for subattachments
    const cometKey = '"comet_sections"';
    const cometPos = html.indexOf(cometKey);
    if (cometPos > -1) {
        // Look for subattachments or viewer_image near comet_sections
        const searchArea = html.substring(cometPos, Math.min(html.length, cometPos + 80000));
        
        const subKey = '"all_subattachments":{"count":';
        const subPos = searchArea.indexOf(subKey);
        if (subPos > -1) {
            const absolutePos = cometPos + subPos;
            const nodesStart = html.indexOf('"nodes":[', absolutePos);
            if (nodesStart > -1 && nodesStart - absolutePos < 100) {
                let depth = 1, nodesEnd = nodesStart + 9;
                for (let i = nodesStart + 9; i < html.length && i < nodesStart + 50000; i++) {
                    if (html[i] === '[') depth++;
                    if (html[i] === ']') { depth--; if (depth === 0) { nodesEnd = i + 1; break; } }
                }
                return html.substring(Math.max(0, absolutePos - 500), nodesEnd);
            }
        }
        
        // Look for viewer_image in comet_sections area
        const viewerPos = searchArea.indexOf('"viewer_image":');
        if (viewerPos > -1) {
            const absolutePos = cometPos + viewerPos;
            return html.substring(Math.max(0, absolutePos - 500), Math.min(html.length, absolutePos + 30000));
        }
    }
    
    // Strategy 3: Look for "story" object which contains post data
    const storyKey = '"story":{"';
    let storyPos = html.indexOf(storyKey);
    // Skip if it's too early (likely header/nav data)
    if (storyPos > -1 && storyPos < 50000) {
        storyPos = html.indexOf(storyKey, 50000);
    }
    if (storyPos > -1) {
        const searchArea = html.substring(storyPos, Math.min(html.length, storyPos + 80000));
        if (searchArea.includes('all_subattachments') || searchArea.includes('viewer_image')) {
            return searchArea;
        }
    }
    
    // Strategy 4: Fallback - look for subattachments anywhere (original logic)
    const subKey = '"all_subattachments":{"count":';
    const subPos = html.indexOf(subKey);
    if (subPos > -1) {
        const nodesStart = html.indexOf('"nodes":[', subPos);
        if (nodesStart > -1 && nodesStart - subPos < 100) {
            let depth = 1, nodesEnd = nodesStart + 9;
            for (let i = nodesStart + 9; i < html.length && i < nodesStart + 50000; i++) {
                if (html[i] === '[') depth++;
                if (html[i] === ']') { depth--; if (depth === 0) { nodesEnd = i + 1; break; } }
            }
            return html.substring(Math.max(0, subPos - 500), nodesEnd);
        }
    }
    
    // Strategy 5: Look for viewer_image
    const viewerKey = '"viewer_image":';
    const viewerPos = html.indexOf(viewerKey);
    if (viewerPos > -1) {
        return html.substring(Math.max(0, viewerPos - 500), Math.min(html.length, viewerPos + 30000));
    }
    
    // Fallback
    return html.length > MAX_SEARCH ? html.substring(0, MAX_SEARCH) : html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAHOE API FALLBACK
// ═══════════════════════════════════════════════════════════════════════════════

const FB_TAHOE_URL = 'https://www.facebook.com/video/tahoe/async/';

/**
 * Try to extract video via Facebook Tahoe API
 * More reliable than HTML scraping for video-only content
 * 
 * @param videoId - Facebook video ID (numeric)
 * @param cookie - Optional cookie for authenticated requests
 * @returns Video URLs or null if failed
 */
export async function fbTryTahoe(
    videoId: string, 
    cookie?: string
): Promise<FbVideoResult | null> {
    if (!videoId || !/^\d+$/.test(videoId)) return null;
    
    const url = `${FB_TAHOE_URL}${videoId}/?chain=true&isvideo=true&payloadtype=primary`;
    
    try {
        const res = await httpPost(url, new URLSearchParams({ '__a': '1' }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': DESKTOP_USER_AGENT,
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                ...(cookie ? { 'Cookie': cookie } : {}),
            },
            timeout: 10000,
        });
        
        if (!res.data) return null;
        
        // Response format: "for (;;);" + JSON
        const jsonStr = typeof res.data === 'string' 
            ? res.data.replace(/^for\s*\(\s*;\s*;\s*\)\s*;/, '')
            : JSON.stringify(res.data);
        const data = JSON.parse(jsonStr);
        
        // Extract from jsmods.instances
        const instances = data?.jsmods?.instances || [];
        for (const instance of instances) {
            const config = instance[1];
            const params = instance[2];
            if (config?.[0] === 'VideoConfig' && params?.[0]?.videoData) {
                const vd = params[0].videoData;
                return {
                    hd: vd.hd_src || vd.hd_src_no_ratelimit || vd.playable_url_quality_hd,
                    sd: vd.sd_src || vd.sd_src_no_ratelimit || vd.playable_url,
                    thumbnail: vd.thumbnail_src || vd.poster,
                };
            }
        }
        
        // Alternative: check payload directly
        const payload = data?.payload;
        if (payload?.video) {
            return {
                hd: payload.video.hd_src || payload.video.browser_native_hd_url,
                sd: payload.video.sd_src || payload.video.browser_native_sd_url,
                thumbnail: payload.video.thumbnail_src,
            };
        }
        
        return null;
    } catch {
        return null;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// METADATA EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract metadata from Facebook HTML
 * 
 * Extracts author, engagement stats, thumbnail, and other metadata
 * in a single pass through the HTML.
 * 
 * @param html - HTML content to parse
 * @returns Extracted metadata object
 */
export function fbExtractMetadata(html: string): FbMetadata {
    const result: FbMetadata = {
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
    };
    
    // Extract thumbnail
    const thumbMatch = html.match(FB_PATTERNS.thumbnail);
    if (thumbMatch && /scontent|fbcdn/.test(thumbMatch[1])) {
        result.thumbnail = clean(thumbMatch[1]);
    }
    
    // Extract author (try multiple patterns)
    const authorPatterns = [FB_PATTERNS.authorReels, FB_PATTERNS.author, FB_PATTERNS.authorAlt];
    for (const pattern of authorPatterns) {
        const match = html.match(pattern);
        if (match?.[1] && match[1] !== 'Facebook' && !/^(User|Page|Video|Photo|Post)$/i.test(match[1])) {
            result.author = decodeUnicode(match[1]);
            break;
        }
    }
    
    // Extract engagement - likes
    const likeMatch = html.match(FB_PATTERNS.likes) || html.match(FB_PATTERNS.likesAlt);
    if (likeMatch) result.likes = parseEngagement(likeMatch[1]);
    
    // Extract engagement - comments
    const commentMatch = html.match(FB_PATTERNS.comments) || html.match(FB_PATTERNS.commentsAlt);
    if (commentMatch) result.comments = parseEngagement(commentMatch[1]);
    
    // Extract engagement - shares
    const shareMatch = html.match(FB_PATTERNS.shares) || html.match(FB_PATTERNS.sharesAlt);
    if (shareMatch) result.shares = parseEngagement(shareMatch[1]);
    
    // Extract engagement - views
    const viewMatch = html.match(FB_PATTERNS.views) || html.match(FB_PATTERNS.viewsAlt);
    if (viewMatch) result.views = parseEngagement(viewMatch[1]);
    
    // Extract description/message - prioritize more specific patterns
    // to avoid catching UI text like "Upload photo and try image creation..."
    let description: string | undefined;
    
    // Priority 1: comet_sections message (actual post content)
    const cometMatch = html.match(FB_PATTERNS.messageComet);
    if (cometMatch?.[1] && cometMatch[1].length >= 10) {
        description = cometMatch[1];
    }
    
    // Priority 2: story context message
    if (!description) {
        const storyMatch = html.match(FB_PATTERNS.messageStory);
        if (storyMatch?.[1] && storyMatch[1].length >= 10) {
            description = storyMatch[1];
        }
    }
    
    // Priority 3: generic message (filter out known UI text)
    if (!description) {
        const msgMatch = html.match(FB_PATTERNS.message);
        if (msgMatch?.[1] && msgMatch[1].length >= 10) {
            const text = msgMatch[1];
            // Skip known Facebook UI text patterns
            const isUIText = /^(Unggah foto|Upload photo|Try image|Coba pembuatan|Create with AI|Buat dengan)/i.test(text);
            if (!isUIText) {
                description = text;
            }
        }
    }
    
    // Priority 4: caption fallback
    if (!description) {
        const captionMatch = html.match(FB_PATTERNS.caption);
        if (captionMatch?.[1] && captionMatch[1].length >= 10) {
            const text = captionMatch[1];
            const isUIText = /^(Unggah foto|Upload photo|Try image|Coba pembuatan|Create with AI|Buat dengan)/i.test(text);
            if (!isUIText) {
                description = text;
            }
        }
    }
    
    if (description) {
        result.description = decodeUnicode(description.replace(/\\n/g, '\n'));
    }
    
    // Extract posted time
    const timeMatch = html.match(FB_PATTERNS.creationTime);
    if (timeMatch) {
        result.postedAt = new Date(parseInt(timeMatch[1]) * 1000).toISOString();
    }
    
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract stories (videos and images) from Facebook HTML
 * 
 * Stories have a different structure than regular posts, using
 * progressive_url for videos and t51.82787 pattern for images.
 * 
 * AUDIO FIX: Prioritizes playable_url and progressive_url patterns
 * which contain muxed video+audio over browser_native URLs.
 * Also detects and deprioritizes muted URLs (geo-restricted content).
 * 
 * @param html - HTML content to parse
 * @returns Array of MediaFormat objects for story items
 */
export function fbExtractStories(html: string): MediaFormat[] {
    const formats: MediaFormat[] = [];
    const seenUrls = new Set<string>();
    let m;
    
    // Collect video-thumbnail pairs with audio priority
    // isMuted flag helps deprioritize muted URLs when better alternatives exist
    const storyBlocks: { videoUrl: string; isHD: boolean; thumbnail?: string; position: number; hasMuxedAudio: boolean; isMuted: boolean }[] = [];
    
    // Pattern 1: progressive_url with quality metadata (HAS AUDIO)
    // Collect ALL patterns first, then sort by audio quality
    FB_PATTERNS.storyVideo.lastIndex = 0;
    while ((m = FB_PATTERNS.storyVideo.exec(html)) !== null) {
        const url = utilDecodeUrl(m[1]);
        if (!seenUrls.has(url)) {
            seenUrls.add(url);
            const searchStart = Math.max(0, m.index - 2000);
            const nearbyHtml = html.substring(searchStart, m.index + m[0].length);
            const thumbMatch = nearbyHtml.match(FB_PATTERNS.storyThumbnail);
            storyBlocks.push({
                videoUrl: url,
                isHD: m[2] === 'HD',
                thumbnail: thumbMatch ? clean(thumbMatch[1]) : undefined,
                position: m.index,
                hasMuxedAudio: true, // progressive_url has audio
                isMuted: isMutedUrl(url),
            });
        }
    }
    
    // Pattern 2: playable_url in story context (HAS AUDIO)
    FB_PATTERNS.storyPlayableUrl.lastIndex = 0;
    while ((m = FB_PATTERNS.storyPlayableUrl.exec(html)) !== null) {
        const url = utilDecodeUrl(m[1]);
        if (!seenUrls.has(url) && /scontent|fbcdn/.test(url)) {
            seenUrls.add(url);
            const searchStart = Math.max(0, m.index - 2000);
            const nearbyHtml = html.substring(searchStart, m.index + m[0].length);
            const thumbMatch = nearbyHtml.match(FB_PATTERNS.storyThumbnail);
            storyBlocks.push({
                videoUrl: url,
                isHD: /720|1080|_hd/i.test(url),
                thumbnail: thumbMatch ? clean(thumbMatch[1]) : undefined,
                position: m.index,
                hasMuxedAudio: true, // playable_url has audio
                isMuted: isMutedUrl(url),
            });
        }
    }
    
    // Pattern 3: video.playable_url in story data (HAS AUDIO)
    FB_PATTERNS.storyVideoData.lastIndex = 0;
    while ((m = FB_PATTERNS.storyVideoData.exec(html)) !== null) {
        const url = utilDecodeUrl(m[1]);
        if (!seenUrls.has(url) && /scontent|fbcdn/.test(url)) {
            seenUrls.add(url);
            storyBlocks.push({
                videoUrl: url,
                isHD: /720|1080|_hd/i.test(url),
                thumbnail: undefined,
                position: m.index,
                hasMuxedAudio: true,
                isMuted: isMutedUrl(url),
            });
        }
    }
    
    // Pattern 4: Fallback - any progressive_url (HAS AUDIO)
    FB_PATTERNS.storyVideoFallback.lastIndex = 0;
    while ((m = FB_PATTERNS.storyVideoFallback.exec(html)) !== null) {
        const url = utilDecodeUrl(m[1]);
        if (!seenUrls.has(url) && /scontent|fbcdn/.test(url)) {
            seenUrls.add(url);
            const searchStart = Math.max(0, m.index - 2000);
            const nearbyHtml = html.substring(searchStart, m.index + m[0].length);
            const thumbMatch = nearbyHtml.match(FB_PATTERNS.storyThumbnail);
            storyBlocks.push({
                videoUrl: url,
                isHD: /720|1080|_hd/i.test(url),
                thumbnail: thumbMatch ? clean(thumbMatch[1]) : undefined,
                position: m.index,
                hasMuxedAudio: true, // progressive_url has audio
                isMuted: isMutedUrl(url),
            });
        }
    }
    
    // Pattern 5: LAST RESORT - browser_native URLs (NO AUDIO)
    // Only use if absolutely nothing else found
    const browserNativePattern = /"browser_native_(?:hd|sd)_url":"(https:[^"]+\.mp4[^"]*)"/g;
    while ((m = browserNativePattern.exec(html)) !== null) {
        const url = utilDecodeUrl(m[1]);
        if (!seenUrls.has(url) && /scontent|fbcdn/.test(url)) {
            seenUrls.add(url);
            storyBlocks.push({
                videoUrl: url,
                isHD: /hd_url/.test(m[0]),
                thumbnail: undefined,
                position: m.index,
                hasMuxedAudio: false, // browser_native has NO audio
                isMuted: isMutedUrl(url),
            });
        }
    }
    
    // Sort by audio quality: non-muted with audio > muted with audio > no audio
    // This ensures we prefer URLs with actual audio over muted versions
    storyBlocks.sort((a, b) => {
        // Priority 1: Non-muted with audio (best)
        const aScore = a.hasMuxedAudio && !a.isMuted ? 3 : a.hasMuxedAudio ? 2 : 1;
        const bScore = b.hasMuxedAudio && !b.isMuted ? 3 : b.hasMuxedAudio ? 2 : 1;
        if (bScore !== aScore) return bScore - aScore;
        // Priority 2: HD over SD
        if (a.isHD !== b.isHD) return a.isHD ? -1 : 1;
        // Priority 3: Position (earlier in HTML = more relevant)
        return a.position - b.position;
    });
    
    // If all URLs are muted, log warning (for debugging)
    const allMuted = storyBlocks.length > 0 && storyBlocks.every(b => b.isMuted);
    if (allMuted) {
        // All URLs are muted - this is a geo-restriction issue
        // The video will play but without audio
        console.warn('[FB Story] All video URLs are muted (geo-restricted content)');
    }
    
    // Collect all thumbnails as fallback
    const allThumbs: string[] = [];
    const thumbRe = /"(?:previewImage|story_thumbnail|poster_image)":\{"uri":"(https:[^"]+)"/g;
    while ((m = thumbRe.exec(html)) !== null) {
        const url = clean(m[1]);
        if (isValidMedia(url) && !allThumbs.includes(url)) allThumbs.push(url);
    }
    
    // Filter to get best non-muted URLs first
    const nonMutedBlocks = storyBlocks.filter(b => !b.isMuted && b.hasMuxedAudio);
    const mutedBlocks = storyBlocks.filter(b => b.isMuted || !b.hasMuxedAudio);
    
    // Use non-muted if available, otherwise fall back to muted
    const blocksToUse = nonMutedBlocks.length > 0 ? nonMutedBlocks : mutedBlocks;
    
    let videoIdx = 0;
    let fallbackThumbIdx = 0;
    
    // Group HD/SD pairs if both exist
    if (blocksToUse.some(v => v.isHD) && blocksToUse.some(v => !v.isHD)) {
        const count = Math.ceil(blocksToUse.length / 2);
        for (let i = 0; i < count; i++) {
            const pair = blocksToUse.slice(i * 2, i * 2 + 2);
            const best = pair.find(v => v.isHD) || pair[0];
            if (best) {
                const thumb = best.thumbnail || pair.find(p => p.thumbnail)?.thumbnail || allThumbs[fallbackThumbIdx++];
                formats.push({
                    quality: `Story ${++videoIdx}`,
                    type: 'video',
                    url: best.videoUrl,
                    format: 'mp4',
                    itemId: `story-v-${videoIdx}`,
                    thumbnail: thumb,
                });
            }
        }
    } else if (blocksToUse.length > 0) {
        blocksToUse.forEach((v) => {
            const thumb = v.thumbnail || allThumbs[fallbackThumbIdx++];
            formats.push({
                quality: `Story ${++videoIdx}`,
                type: 'video',
                url: v.videoUrl,
                format: 'mp4',
                itemId: `story-v-${videoIdx}`,
                thumbnail: thumb,
            });
        });
    }
    
    // Extract story images (t51.82787 pattern)
    FB_PATTERNS.storyImage.lastIndex = 0;
    const storyImages: string[] = [];
    while ((m = FB_PATTERNS.storyImage.exec(html)) !== null) {
        const url = clean(utilDecodeUrl(m[0]));
        // Only high-res images
        if (/s(1080|1440|2048)x/.test(url) && !seenUrls.has(url) && !storyImages.includes(url)) {
            storyImages.push(url);
        }
    }
    
    storyImages.forEach((url, i) => {
        seenUrls.add(url);
        formats.push({
            quality: `Story Image ${i + 1}`,
            type: 'image',
            url,
            format: 'jpg',
            itemId: `story-img-${i + 1}`,
            thumbnail: url,
        });
    });
    
    return formats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract images from Facebook post HTML
 * 
 * Handles multiple image sources:
 * - all_subattachments (multi-image posts)
 * - viewer_image (single/gallery images)
 * - photo_image (photo posts)
 * 
 * @param html - HTML content to parse
 * @param targetPostId - Optional post ID to target specific content
 * @returns Array of MediaFormat objects for images
 */
export function fbExtractImages(html: string, targetPostId?: string): MediaFormat[] {
    const formats: MediaFormat[] = [];
    const seenPaths = new Set<string>();
    let idx = 0;
    
    const decoded = utilDecodeHtml(html);
    const target = fbFindPostBlock(decoded, targetPostId);
    
    /**
     * Add image to formats if not duplicate
     */
    const addImage = (imgUrl: string): boolean => {
        const path = imgUrl.split('?')[0];
        if (isSkipImage(imgUrl) || seenPaths.has(path)) return false;
        // Skip profile pictures (t39.30808-1)
        if (/t39\.30808-1\//.test(imgUrl)) return false;
        
        // Debug: log the URL being added
        console.log(`[Facebook.Image] Adding: ${imgUrl.substring(0, 100)}... (has query: ${imgUrl.includes('?')})`);
        
        seenPaths.add(path);
        formats.push({
            quality: `Image ${++idx}`,
            type: 'image',
            url: imgUrl,
            format: 'jpg',
            itemId: `img-${idx}`,
            thumbnail: imgUrl,
        });
        return true;
    };
    
    let m;
    
    // Strategy 1: Extract from all_subattachments (multi-image posts)
    const subMatch = target.match(FB_PATTERNS.subattachments);
    if (subMatch) {
        const expectedCount = parseInt(subMatch[1]) || 0;
        const nodesStart = target.indexOf('"nodes":[', target.indexOf('"all_subattachments"'));
        
        if (nodesStart > -1) {
            // Find the end of nodes array
            let depth = 1, nodesEnd = nodesStart + 9;
            for (let i = nodesStart + 9; i < target.length && i < nodesStart + 30000; i++) {
                if (target[i] === '[') depth++;
                if (target[i] === ']') { depth--; if (depth === 0) { nodesEnd = i + 1; break; } }
            }
            
            const nodesBlock = target.substring(nodesStart, nodesEnd);
            
            // Extract viewer_image from nodes
            FB_PATTERNS.viewerImage.lastIndex = 0;
            while ((m = FB_PATTERNS.viewerImage.exec(nodesBlock)) !== null) {
                const url = clean(m[3]);
                if (/scontent|fbcdn/.test(url) && /t39\.30808|t51\.82787/.test(url)) {
                    addImage(url);
                }
            }
            
            // If we got expected count, return early
            if (idx >= expectedCount && idx > 0) return formats;
        }
    }
    
    // Strategy 2: Extract viewer_image (single/gallery images)
    if (idx === 0) {
        const candidates: { url: string; size: number }[] = [];
        FB_PATTERNS.viewerImage.lastIndex = 0;
        
        while ((m = FB_PATTERNS.viewerImage.exec(target)) !== null) {
            const height = parseInt(m[1]);
            const width = parseInt(m[2]);
            const url = clean(m[3]);
            
            if (/scontent|fbcdn/.test(url) && height >= 400 && width >= 400) {
                if (/t39\.30808|t51\.82787/.test(url) && !/\/[ps]\d{2,3}x\d{2,3}\/|\/cp0\//.test(url)) {
                    candidates.push({ url, size: height * width });
                }
            }
        }
        
        // Sort by size (largest first) and dedupe
        candidates.sort((a, b) => b.size - a.size);
        const addedUrls = new Set<string>();
        for (const c of candidates) {
            const basePath = c.url.split('?')[0].replace(/_n\.jpg$/, '');
            if (!addedUrls.has(basePath)) {
                addedUrls.add(basePath);
                addImage(c.url);
            }
        }
    }
    
    // Strategy 3: Extract photo_image (use target block, not full HTML)
    if (idx === 0) {
        FB_PATTERNS.photoImage.lastIndex = 0;
        const photoUrls: string[] = [];
        
        while ((m = FB_PATTERNS.photoImage.exec(target)) !== null && photoUrls.length < 5) {
            const url = clean(m[1]);
            if (/scontent|fbcdn/.test(url) && /t39\.30808-6/.test(url) && !photoUrls.includes(url)) {
                photoUrls.push(url);
            }
        }
        
        for (const url of photoUrls) addImage(url);
    }
    
    // Strategy 4: Extract from preload links (only if in target block context)
    if (idx === 0) {
        const preloadRe = /<link[^>]+rel="preload"[^>]+href="(https:\/\/scontent[^"]+_nc_sid=127cfc[^"]+)"/i;
        const preloadMatch = target.match(preloadRe);
        if (preloadMatch) addImage(clean(preloadMatch[1]));
    }
    
    // Strategy 5: Extract image URIs (use target block)
    if (idx === 0) {
        FB_PATTERNS.imageUri.lastIndex = 0;
        while ((m = FB_PATTERNS.imageUri.exec(target)) !== null && idx < 3) {
            const url = clean(m[1]);
            if (/scontent|fbcdn/.test(url) && !/\/[ps]\d{2,3}x\d{2,3}\/|\/cp0\//.test(url)) {
                addImage(url);
            }
        }
    }
    
    // Strategy 6: Fallback - raw t39.30808 URLs (use target block to avoid ads/suggested)
    if (idx === 0) {
        const t39Re = /https:\/\/scontent[^"'\s<>\\]+t39\.30808-6[^"'\s<>\\]+\.jpg/gi;
        let count = 0;
        while ((m = t39Re.exec(target)) !== null && count < 5) {
            const url = utilDecodeUrl(m[0]);
            if (!/\/[ps]\d{2,3}x\d{2,3}\/|\/cp0\/|_s\d+x\d+|\/s\d{2,3}x\d{2,3}\//.test(url)) {
                if (addImage(url)) count++;
            }
        }
    }
    
    return formats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASH VIDEO EXTRACTION (for high-quality variants)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract DASH video variants with height information
 * 
 * DASH videos have explicit height metadata, useful for getting
 * specific quality variants (1080p, 720p, etc.)
 * 
 * @param html - HTML content to parse
 * @returns Array of video objects with height and URL
 */
export function fbExtractDashVideos(html: string): { height: number; url: string }[] {
    const videos: { height: number; url: string }[] = [];
    let m;
    
    FB_PATTERNS.dashVideo.lastIndex = 0;
    while ((m = FB_PATTERNS.dashVideo.exec(html)) !== null) {
        const height = parseInt(m[1]);
        if (height >= 360) {
            videos.push({
                height,
                url: utilDecodeUrl(m[2]),
            });
        }
    }
    
    // Sort by height (highest first)
    videos.sort((a, b) => b.height - a.height);
    
    return videos;
}

/**
 * Get quality label from video height
 * 
 * @param height - Video height in pixels
 * @returns Quality label string
 */
export function fbGetQualityLabel(height: number): string {
    if (height >= 1080) return 'HD 1080p';
    if (height >= 720) return 'HD 720p';
    if (height >= 480) return 'SD 480p';
    if (height >= 360) return 'SD 360p';
    return `${height}p`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT TYPE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Facebook content types */
export type FbContentType = 'post' | 'video' | 'reel' | 'story' | 'group' | 'photo' | 'unknown';

/**
 * Detect content type from Facebook URL
 * 
 * @param url - Facebook URL
 * @returns Content type
 */
export function fbDetectContentType(url: string): FbContentType {
    if (/\/stories\//.test(url)) return 'story';
    if (/\/groups\//.test(url)) return 'group';
    if (/\/reel\/|\/share\/r\//.test(url)) return 'reel';
    if (/\/videos?\/|\/watch\/|\/share\/v\//.test(url)) return 'video';
    if (/\/photos?\//.test(url)) return 'photo';
    if (/\/posts\/|permalink|\/share\/p\//.test(url)) return 'post';
    // story.php with story_fbid is typically a reel/video shared via short link
    if (/story\.php\?.*story_fbid=/.test(url)) return 'post';
    return 'unknown';
}

/**
 * Extract video ID from Facebook URL
 * 
 * @param url - Facebook URL
 * @returns Video ID or null
 */
export function fbExtractVideoId(url: string): string | null {
    const match = url.match(/\/(?:reel|videos?)\/(\d+)/);
    return match ? match[1] : null;
}

/**
 * Extract post ID from Facebook URL
 * 
 * @param url - Facebook URL
 * @returns Post ID or null
 */
export function fbExtractPostId(url: string): string | null {
    const patterns = [
        /\/groups\/[^/]+\/permalink\/(\d+)/,
        /\/groups\/[^/]+\/posts\/(\d+)/,
        /\/posts\/(pfbid[a-zA-Z0-9]+)/,
        /\/posts\/(\d+)/,
        /\/permalink\/(\d+)/,
        /story_fbid=(pfbid[a-zA-Z0-9]+)/,
        /story_fbid=(\d+)/,
        /\/photos?\/[^/]+\/(\d+)/,
        /\/share\/p\/([a-zA-Z0-9]+)/,
        /fbid=(\d+)/,
    ];
    
    for (const re of patterns) {
        const m = url.match(re);
        if (m) return m[1];
    }
    
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE VIDEO DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if content is a live broadcast (not downloadable)
 */
export function fbIsLiveVideo(html: string): boolean {
    return html.includes('"is_live_streaming":true') || 
           html.includes('"broadcast_status":"LIVE"') ||
           html.includes('"is_live":true') ||
           html.includes('LiveVideoStatus');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Age-restricted content patterns */
const AGE_RESTRICTED_PATTERNS = [
    'You must be 18 years or older',
    'age-restricted',
    'AdultContentWarning',
    '"is_adult_content":true',
    'content_age_gate',
];

/** Private/unavailable content patterns */
const PRIVATE_CONTENT_PATTERNS = [
    "This content isn't available",
    "content isn't available right now",
    "Sorry, this content isn't available",
    'The link you followed may be broken',
    'This video is no longer available',
    'video may have been removed',
];

/** Content issue types */
export type FbContentIssue = 'age_restricted' | 'private' | 'login_required' | null;

/**
 * Detect content access issues in HTML
 * 
 * @param html - HTML content to check
 * @returns Issue type or null if no issues
 */
export function fbDetectContentIssue(html: string): FbContentIssue {
    const lower = html.toLowerCase();
    
    // Check if there's actual media content (skip error detection if media exists)
    const hasMediaPatterns = 
        html.includes('browser_native') || 
        html.includes('all_subattachments') || 
        html.includes('viewer_image') || 
        html.includes('playable_url') || 
        html.includes('photo_image');
    
    if (hasMediaPatterns) return null;
    
    // Check for age restriction
    for (const p of AGE_RESTRICTED_PATTERNS) {
        if (html.includes(p) || lower.includes(p.toLowerCase())) {
            return 'age_restricted';
        }
    }
    
    // Check for private content
    for (const p of PRIVATE_CONTENT_PATTERNS) {
        const idx = html.indexOf(p);
        if (idx > -1 && idx < 50000) {
            return 'private';
        }
    }
    
    // Check for login requirement
    if (html.length < 500000 && (html.includes('login_form') || html.includes('Log in to Facebook'))) {
        return 'login_required';
    }
    
    return null;
}

/**
 * Check if content has unavailable attachment (deleted shared content)
 * 
 * @param html - HTML content to check
 * @returns True if attachment is unavailable
 */
export function fbHasUnavailableAttachment(html: string): boolean {
    return html.includes('"UnavailableAttachment"') || 
           html.includes('"unavailable_attachment_style"') || 
           (html.includes("This content isn't available") && html.includes('attachment'));
}
