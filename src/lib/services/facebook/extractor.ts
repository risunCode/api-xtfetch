// extractor.ts - Media extraction for Facebook scraper
import { getCdnInfo } from './cdn';
import type { MediaFormat, FbContentType, FbMetadata } from './index';

// Decode escaped strings - SINGLE function (replaces clean() and utilDecodeUrl)
const DECODE: [RegExp, string][] = [
    [/\\\//g, '/'], [/\\u0025/g, '%'], [/\\u0026/g, '&'],
    [/\\u003C/g, '<'], [/\\u003E/g, '>'], [/\\u002F/g, '/'],
    [/\\"/g, '"'], [/&amp;/g, '&'], [/&#x2F;/g, '/'], [/&#39;/g, "'"],
    [/\\n/g, ''], [/\\t/g, ''],
];

// Decode unicode escape sequences like \u00e0 -> à
function decodeUnicode(s: string): string {
    return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
    );
}

export const decode = (s: string): string => {
    let result = DECODE.reduce((r, [p, v]) => r.replace(p, v), s);
    // Decode unicode escapes for text content (names, titles)
    result = decodeUnicode(result);
    return result;
};

// Consolidated patterns - SINGLE source of truth
const P = {
    video: {
        // Progressive URLs array format (reels/videos)
        progressiveWithQuality: /"progressive_url":"(https:[^"]+\.mp4[^"]*)","failure_reason":null,"metadata":\{"quality":"(HD|SD)"\}/g,
        progressive: /"progressive_url":"(https:[^"]+\.mp4[^"]*)"/g,
        playableHd: /"playable_url_quality_hd":"(https:[^"]+\.mp4[^"]*)"/g,
        playable: /"playable_url":"(https:[^"]+\.mp4[^"]*)"/g,
        browserHd: /"browser_native_hd_url":"(https:[^"]+\.mp4[^"]*)"/g,
        browserSd: /"browser_native_sd_url":"(https:[^"]+\.mp4[^"]*)"/g,
        dash: /"base_url":"(https:[^"]+\.mp4[^"]*)"/g,
        hdSrc: /"hd_src":"(https:[^"]+\.mp4[^"]*)"/g,
        sdSrc: /"sd_src":"(https:[^"]+\.mp4[^"]*)"/g,
    },
    image: {
        // High priority - specific image contexts (same as manual extractor)
        viewerImage: /"viewer_image":\{"height":\d+,"width":\d+,"uri":"(https:[^"]+)"/g,
        imageWithSize: /"image":\{"height":\d+,"width":\d+,"uri":"(https:[^"]+)"/g,
        photoImage: /"photo_image":\{"uri":"(https:[^"]+)"/g,
        fullWidthImage: /"full_width_image":\{"uri":"(https:[^"]+)"/g,
        fullImage: /"full_image":\{"uri":"(https:[^"]+)"/g,
        largeShare: /"large_share":\{"uri":"(https:[^"]+)"/g,
        // Medium priority - generic image URIs
        imageUri: /"uri":"(https:\/\/scontent[^"]+)"/g,
        // Fallback - raw URLs in HTML
        rawImage: /https:\/\/scontent[^"'\s<>\\]+\.(?:jpg|jpeg)[^"'\s<>\\]*/g,
    },
    meta: {
        author: /"owning_profile":\{[^}]*"name":"([^"]+)"/,
        authorAlt: /"owner":\{[^}]*"name":"([^"]+)"/,
        authorName: /"name":"([^"]+)"[^}]*"__typename":"(?:User|Page)"/,
        timestamp: /"publish_time":(\d+)/,
        title: /"title":\{"text":"([^"]+)"/,
    },
    thumb: /"(?:preferred_thumbnail|previewImage|thumbnailImage)":\{(?:"image":\{)?"uri":"(https:[^"]+)"/,
};

// Block finding - find relevant HTML section (larger blocks for better extraction)
const BLOCK_KEYS: Record<FbContentType, string[]> = {
    video: ['"progressive_urls"', '"progressive_url":', '"playable_url":', '"browser_native'],
    reel: ['"progressive_urls"', '"progressive_url":', '"playable_url":', '"browser_native', '"unified_stories"'],
    story: ['"story_bucket_owner"', '"story_card_seen_state"', '"attachments"'],
    post: ['"all_subattachments"', '"photo_image"', '"full_image"', '"large_share"', '"viewer_image"'],
    group: ['"group_feed"', '"all_subattachments"', '"full_image"', '"viewer_image"'],
    photo: ['"photo_image"', '"full_image"', '"viewer_image"'],
    watch: ['"progressive_urls"', '"progressive_url":', '"playable_url":', '"browser_native'],
    unknown: ['"all_subattachments"', '"photo_image"', '"full_image"', '"progressive_url":'],
};

function findBlock(html: string, type: FbContentType): string {
    const keys = BLOCK_KEYS[type] || BLOCK_KEYS.post;

    // For posts, search for all_subattachments first (multi-image posts)
    if (type === 'post' || type === 'group' || type === 'photo') {
        const subAttachPos = html.indexOf('"all_subattachments"');
        if (subAttachPos > -1) {
            // Get a large block around subattachments to capture all images
            return html.substring(Math.max(0, subAttachPos - 5000), Math.min(html.length, subAttachPos + 100000));
        }
    }

    for (const key of keys) {
        const pos = html.indexOf(key);
        if (pos > -1) {
            // Larger block for posts/groups to capture all images
            const blockSize = (type === 'post' || type === 'group' || type === 'photo') ? 100000 : 35000;
            return html.substring(Math.max(0, pos - 5000), Math.min(html.length, pos + blockSize));
        }
    }
    // Fallback: search larger area for images
    return html.substring(0, 200000);
}

// Issue detection - patterns must be specific to avoid false positives
// Exported so scraper can use for LOGIN detection
export const ISSUES: [string, string, string][] = [
    ['/checkpoint/', 'CHECKPOINT', 'Akun memerlukan verifikasi'],
    ['id="login_form"', 'LOGIN_REQUIRED', 'Konten memerlukan login'],
    ['"UnavailableAttachment"', 'UNAVAILABLE', 'Konten tidak tersedia'],
    ["content isn't available", 'NOT_FOUND', 'Konten tidak ditemukan'],
    ['This video is private', 'PRIVATE', 'Video ini privat'],
    ['This content is no longer available', 'DELETED', 'Konten sudah dihapus'],
];

export function detectIssue(html: string): { code: string; message: string } | null {
    for (const [pattern, code, message] of ISSUES) {
        if (html.includes(pattern)) return { code, message };
    }
    return null;
}

// Video extraction - SINGLE pass
interface VideoCandidate {
    url: string;
    quality: 'HD' | 'SD';
    hasMuxedAudio: boolean;
    priority: number;
    assetId?: string; // xpv_asset_id from efg parameter
}

// Extract xpv_asset_id from URL's efg parameter (base64 encoded JSON)
function extractAssetId(url: string): string | undefined {
    try {
        const efgMatch = url.match(/efg=([^&]+)/);
        if (!efgMatch) return undefined;

        // Decode URL encoding then base64
        const efgEncoded = decodeURIComponent(efgMatch[1]);
        const efgJson = Buffer.from(efgEncoded, 'base64').toString('utf-8');
        const efg = JSON.parse(efgJson);
        return efg.xpv_asset_id?.toString();
    } catch {
        return undefined;
    }
}

// Detect quality from URL patterns and bitrate
function detectQuality(url: string): 'HD' | 'SD' {
    // HD indicators (720p+)
    const hdPatterns = [
        /720p/i, /1080p/i, /_720p/i, /_1080p/i,
        /dash_h264-basic-gen2_720p/i,
        /dash_baseline_1_v1/i, // Usually 720p
        /gen2_720p/i,
        /quality_hd/i,
        /hd_src/i,
        /browser_native_hd/i,
    ];

    // SD indicators (360p, 480p, sve_sd)
    const sdPatterns = [
        /360p/i, /480p/i, /_360p/i, /_480p/i,
        /sve_sd/i, // Facebook's SD tag
        /gen2_360p/i,
        /progressive_h264-basic-gen2_360p/i,
        /quality_sd/i,
        /sd_src/i,
        /browser_native_sd/i,
    ];

    // Check SD first (more specific)
    for (const p of sdPatterns) {
        if (p.test(url)) return 'SD';
    }

    // Check HD
    for (const p of hdPatterns) {
        if (p.test(url)) return 'HD';
    }

    // Fallback: check bitrate from URL
    const bitrateMatch = url.match(/bitrate=(\d+)/);
    if (bitrateMatch) {
        const bitrate = parseInt(bitrateMatch[1]);
        // < 600kbps = SD, >= 600kbps = HD
        return bitrate < 600000 ? 'SD' : 'HD';
    }

    // Default to HD if can't determine
    return 'HD';
}

/**
 * Check if URL has muted audio track (no sound)
 * 
 * Rules:
 * 1. Progressive URLs (tag=progressive_*) = ALWAYS have audio
 * 2. DASH URLs with _nc_vs containing "dash_muted" = NO audio
 * 3. DASH URLs with _nc_vs containing "passthrough_everstore" = HAS audio
 * 4. URLs without _nc_vs = likely progressive = HAS audio
 */
function hasMutedAudio(url: string): boolean {
    // Rule 1: Progressive tag = always has audio
    if (url.includes('tag=progressive')) {
        return false; // NOT muted
    }

    // Rule 4: No _nc_vs = progressive URL = has audio
    if (!url.includes('_nc_vs=')) {
        return false; // NOT muted
    }

    // Rule 2 & 3: Check _nc_vs content
    // Direct check for muted indicators in URL
    if (url.includes('dash_muted') || url.includes('ZGFzaF9tdXRlZA')) {
        return true; // MUTED
    }

    // Try to decode _nc_vs and check for muted indicator
    try {
        const ncvsMatch = url.match(/_nc_vs=([^&]+)/);
        if (ncvsMatch) {
            const decoded = Buffer.from(decodeURIComponent(ncvsMatch[1]), 'base64').toString('utf-8');
            if (decoded.includes('dash_muted') || decoded.includes('muted_shared_audio')) {
                return true; // MUTED
            }
            // passthrough_everstore = has real audio
            if (decoded.includes('passthrough_everstore')) {
                return false; // NOT muted
            }
        }
    } catch {
        // Decode failed - assume not muted if no obvious indicators
    }

    return false; // Default: assume has audio
}

function extractVideos(html: string, filterToFirstAsset: boolean = false): VideoCandidate[] {
    const candidates: VideoCandidate[] = [];
    const seen = new Set<string>();

    // Helper to add candidate
    const addCandidate = (url: string, quality: 'HD' | 'SD', basePriority: number) => {
        const urlKey = url.split('?')[0];
        if (seen.has(urlKey) || !url.includes('.mp4')) return;
        seen.add(urlKey);

        const cdnBoost = getCdnInfo(url).score;
        const assetId = extractAssetId(url);
        const isMuted = hasMutedAudio(url);
        const isProgressive = url.includes('tag=progressive') || !url.includes('_nc_vs=');

        let priority = basePriority;
        priority += cdnBoost;
        if (isProgressive) priority += 30;
        if (isMuted) priority -= 80;

        candidates.push({
            url,
            quality,
            hasMuxedAudio: !isMuted,
            priority,
            assetId,
        });
    };

    // 1. Progressive URLs with quality metadata (best for reels)
    P.video.progressiveWithQuality.lastIndex = 0;
    let m;
    while ((m = P.video.progressiveWithQuality.exec(html)) !== null) {
        addCandidate(decode(m[1]), m[2] as 'HD' | 'SD', m[2] === 'HD' ? 100 : 50);
    }

    // 2. Browser native URLs (often have HD)
    P.video.browserHd.lastIndex = 0;
    while ((m = P.video.browserHd.exec(html)) !== null) {
        addCandidate(decode(m[1]), 'HD', 95);
    }

    P.video.browserSd.lastIndex = 0;
    while ((m = P.video.browserSd.exec(html)) !== null) {
        addCandidate(decode(m[1]), 'SD', 45);
    }

    // 3. Playable URLs
    P.video.playableHd.lastIndex = 0;
    while ((m = P.video.playableHd.exec(html)) !== null) {
        addCandidate(decode(m[1]), 'HD', 90);
    }

    P.video.playable.lastIndex = 0;
    while ((m = P.video.playable.exec(html)) !== null) {
        const url = decode(m[1]);
        addCandidate(url, detectQuality(url), 85);
    }

    // 4. Other patterns (fallback)
    const fallbackPatterns: { pattern: RegExp; priority: number }[] = [
        { pattern: P.video.progressive, priority: 80 },
        { pattern: P.video.hdSrc, priority: 75 },
        { pattern: P.video.sdSrc, priority: 70 },
        { pattern: P.video.dash, priority: 60 },
    ];

    for (const { pattern, priority } of fallbackPatterns) {
        pattern.lastIndex = 0;
        while ((m = pattern.exec(html)) !== null) {
            const url = decode(m[1]);
            addCandidate(url, detectQuality(url), priority);
        }
    }

    // Sort by priority
    const sorted = candidates.sort((a, b) => b.priority - a.priority);

    // Filter to first asset if requested
    if (filterToFirstAsset && sorted.length > 0) {
        const firstAssetId = sorted.find(v => v.assetId)?.assetId;
        if (firstAssetId) {
            return sorted.filter(v => v.assetId === firstAssetId);
        }
    }

    return sorted;
}

// Helper to check if URL is valid post image
function isValidImage(url: string): boolean {
    // Must be Facebook CDN
    if (!/scontent|fbcdn/.test(url)) return false;
    // Skip emoji/sticker/static resources
    if (/emoji|sticker|rsrc|static\.xx|icon|badge|reaction/i.test(url)) return false;
    // Skip profile pics (t39.30808-1) but allow post images (t39.30808-6, t51.82787)
    if (/t39\.30808-1/.test(url)) return false;
    // Skip small thumbnails (but allow stp=dst- which is just resized, not thumbnail)
    // _s.jpg and _t.jpg are small/thumbnail versions
    if (/\/p\d+x\d+\/|_s\d+x\d+|\/s\d+x\d+\/|\/c\d+\.\d+|cp0|_nc_.*=p\d+|_[st]\.jpg/.test(url)) return false;
    // Accept if has image extension OR is fbcdn/scontent URL with image type indicator
    const hasExtension = /\.(?:jpg|jpeg|png|webp)/i.test(url);
    const isFbImageType = /t39\.30808-6|t51\.82787|t51\.29350|t51\.2885-15/.test(url);
    return hasExtension || isFbImageType;
}

// Strip stp= parameter from URL to get full resolution
function stripStpParam(url: string): string {
    // Case 1: stp= is first param: ?stp=xxx&... -> ?...
    // Case 2: stp= is not first: &stp=xxx&... -> &...
    // Case 3: stp= is only param: ?stp=xxx -> (remove entirely)

    // First, try to remove ?stp=xxx& (first param with more params after)
    let result = url.replace(/\?stp=[^&]+&/, '?');
    if (result !== url) return result;

    // Then, try to remove &stp=xxx (not first param)
    result = url.replace(/&stp=[^&]+/, '');
    if (result !== url) return result;

    // Finally, try to remove ?stp=xxx (only param)
    result = url.replace(/\?stp=[^&]+$/, '');
    return result;
}

// Extract images from post - targeted extraction based on post_id
function extractPostImages(html: string): { urls: string[]; pattern: string } {
    const urls: string[] = [];
    const seen = new Set<string>();
    let patternUsed = 'none';

    const addUrl = (url: string): boolean => {
        let cleanUrl = decode(url);
        cleanUrl = stripStpParam(cleanUrl);
        cleanUrl = cleanUrl.replace(/\?\?/, '?').replace(/\?$/, '');

        const idMatch = cleanUrl.match(/(\d+_\d+_\d+)_n\.(?:jpg|webp)/) || cleanUrl.match(/(\d{10,})_/);
        const key = idMatch ? idMatch[1] : cleanUrl.split('?')[0];
        if (seen.has(key)) return false;
        if (!isValidImage(cleanUrl)) return false;
        seen.add(key);
        urls.push(cleanUrl);
        return true;
    };

    const postIdMatch = html.match(/"post_id":"(\d+)"/);
    let targetBlock = html;
    let blockType = 'full';

    // Debug: check what patterns exist
    const hasSubAttach = html.includes('"all_subattachments"');
    const hasNodes = html.includes('"nodes":[{');

    if (postIdMatch) {
        const postId = postIdMatch[1];
        const postIdPos = html.indexOf(`"post_id":"${postId}"`);
        const subAttachPos = html.indexOf('"all_subattachments"');

        if (subAttachPos > -1) {
            const nodesCheck = html.substring(subAttachPos, subAttachPos + 100);
            const hasNodes = nodesCheck.includes('"nodes":[{');

            if (hasNodes) {
                // Multi-image: increase block size to 100kb to capture all images
                targetBlock = html.substring(Math.max(0, subAttachPos - 2000), Math.min(html.length, subAttachPos + 100000));
                blockType = 'multi-image';
            } else {
                targetBlock = html.substring(Math.max(0, postIdPos - 10000), Math.min(html.length, postIdPos + 15000));
                blockType = 'single-image';
            }
        } else {
            targetBlock = html.substring(Math.max(0, postIdPos - 10000), Math.min(html.length, postIdPos + 15000));
            blockType = 'post-block';
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // MULTI-IMAGE: Extract from nodes array inside all_subattachments
    // Structure: "all_subattachments":{"nodes":[{...media...},{...media...}]}
    // Each node has: "media":{"image":{"uri":"..."}} or "media":{"viewer_image":{"uri":"..."}}
    // Index: 0, 1, 2, 3... for each image in the post
    // ═══════════════════════════════════════════════════════════════
    if (blockType === 'multi-image') {
        // Pattern untuk extract semua image dari nodes array
        // Cari semua "media" objects yang punya image/viewer_image
        
        // Pattern 1: media > image > uri (paling umum untuk multi-image)
        const mediaImageRe = /"media":\{"(?:__typename":"Photo",)?"image":\{"uri":"(https:[^"]+)"/g;
        let match;
        while ((match = mediaImageRe.exec(targetBlock)) !== null) {
            addUrl(match[1]);
        }
        
        // Pattern 2: media > viewer_image > uri
        const mediaViewerRe = /"media":\{[^}]*"viewer_image":\{[^}]*"uri":"(https:[^"]+)"/g;
        while ((match = mediaViewerRe.exec(targetBlock)) !== null) {
            addUrl(match[1]);
        }
        
        // Pattern 3: Langsung cari image dengan height/width di dalam nodes context
        // Format: "image":{"height":XXX,"width":XXX,"uri":"https://scontent..."}
        const imageWithDimRe = /"image":\{"height":\d+,"width":\d+,"uri":"(https:\/\/scontent[^"]+)"/g;
        while ((match = imageWithDimRe.exec(targetBlock)) !== null) {
            addUrl(match[1]);
        }
        
        // Pattern 4: viewer_image dengan dimensions
        const viewerWithDimRe = /"viewer_image":\{"height":\d+,"width":\d+,"uri":"(https:\/\/scontent[^"]+)"/g;
        while ((match = viewerWithDimRe.exec(targetBlock)) !== null) {
            addUrl(match[1]);
        }
        
        if (urls.length > 0) {
            patternUsed = `multi-image-nodes (${urls.length} images)`;
            return { urls, pattern: patternUsed };
        }
    }

    // Pattern 1: viewer_image
    const viewerImageRe = /"viewer_image":\{[^}]*"uri":"(https:[^"]+)"/g;
    let match;
    while ((match = viewerImageRe.exec(targetBlock)) !== null) {
        addUrl(match[1]);
    }
    if (urls.length > 0 && blockType !== 'multi-image') {
        patternUsed = `viewer_image (${blockType})`;
        return { urls, pattern: patternUsed };
    }

    // Pattern 2: photo_image
    const photoImageRe = /"photo_image":\{"uri":"([^"]+)"/g;
    while ((match = photoImageRe.exec(targetBlock)) !== null) {
        addUrl(match[1]);
    }
    if (urls.length > 0 && blockType !== 'multi-image') {
        patternUsed = `photo_image (${blockType})`;
        return { urls, pattern: patternUsed };
    }

    // Pattern 3: image with size
    const imageWithSizeRe = /"image":\{"height":\d+,"width":\d+,"uri":"([^"]+)"/g;
    while ((match = imageWithSizeRe.exec(targetBlock)) !== null) {
        addUrl(match[1]);
    }
    if (urls.length > 0 && blockType !== 'multi-image') {
        patternUsed = `image_with_size (${blockType})`;
        return { urls, pattern: patternUsed };
    }

    // Pattern 4: full_image
    const fullImageRe = /"full_image":\{"uri":"([^"]+)"/g;
    while ((match = fullImageRe.exec(targetBlock)) !== null) {
        addUrl(match[1]);
    }

    // Pattern 5: large_share
    const largeShareRe = /"large_share":\{"uri":"([^"]+)"/g;
    while ((match = largeShareRe.exec(targetBlock)) !== null) {
        addUrl(match[1]);
    }

    // Pattern 6: Generic URI for multi-image fallback
    if (blockType === 'multi-image' && urls.length < 10) {
        const genericUriRe = /"uri":"(https:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/g;
        while ((match = genericUriRe.exec(targetBlock)) !== null) {
            addUrl(match[1]);
        }
    }

    if (urls.length > 0) {
        patternUsed = `aggregated (${blockType})`;
    }

    return { urls, pattern: patternUsed };
}

// Image extraction - returns formats and pattern used
function extractImages(html: string): { formats: MediaFormat[]; pattern: string } {
    const formats: MediaFormat[] = [];
    const seen = new Set<string>();
    let imageIdx = 0;

    const addImage = (url: string): boolean => {
        const urlKey = url.split('?')[0];
        if (seen.has(urlKey) || !isValidImage(url)) return false;
        seen.add(urlKey);
        const itemId = `img-${imageIdx}`;
        formats.push({
            quality: `Image ${imageIdx + 1}`,
            type: 'image',
            url,
            format: url.includes('.png') ? 'png' : 'jpg',
            thumbnail: url,
            imageIndex: imageIdx,
            itemId, // For frontend carousel grouping
        });
        imageIdx++;
        return true;
    };

    // Priority 0: Extract from post using targeted extraction
    const { urls: postImages, pattern: postPattern } = extractPostImages(html);
    for (const url of postImages) {
        addImage(url);
    }

    if (formats.length > 0) {
        return { formats, pattern: postPattern };
    }

    // Priority 1: Structured image patterns (fallback)
    const structuredPatterns = [
        P.image.viewerImage,
        P.image.imageWithSize,
        P.image.photoImage,
        P.image.fullWidthImage,
        P.image.fullImage,
        P.image.largeShare,
    ];

    for (const pattern of structuredPatterns) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(html)) !== null) {
            addImage(decode(m[1]));
        }
    }

    if (formats.length > 0) {
        return { formats, pattern: 'structured_fallback' };
    }

    // Priority 2: Generic URI pattern
    if (formats.length < 2) {
        P.image.imageUri.lastIndex = 0;
        let m;
        while ((m = P.image.imageUri.exec(html)) !== null) {
            addImage(decode(m[1]));
        }
    }

    // Priority 3: Raw URL extraction
    if (formats.length === 0) {
        P.image.rawImage.lastIndex = 0;
        let m;
        while ((m = P.image.rawImage.exec(html)) !== null) {
            addImage(decode(m[0]));
        }
    }

    return { formats, pattern: formats.length > 0 ? 'raw_fallback' : 'none' };
}

// Story extraction - grouped by video_id with HD/SD variants
interface StoryVideo {
    videoId: string;
    quality: 'HD' | 'SD';
    url: string;
    bitrate: number;
}

// Extract story thumbnail from HTML
function extractStoryThumbnail(html: string): string | undefined {
    // Pattern 1: previewImage in story context
    const previewMatch = html.match(/"previewImage":\{[^}]*"uri":"(https:[^"]+)"/);
    if (previewMatch) return decode(previewMatch[1]);

    // Pattern 2: thumbnailImage
    const thumbMatch = html.match(/"thumbnailImage":\{[^}]*"uri":"(https:[^"]+)"/);
    if (thumbMatch) return decode(thumbMatch[1]);

    // Pattern 3: preferred_thumbnail
    const prefMatch = html.match(/"preferred_thumbnail":\{[^}]*"uri":"(https:[^"]+)"/);
    if (prefMatch) return decode(prefMatch[1]);

    // Pattern 4: story card image (scontent with story type indicator)
    const storyImgMatch = html.match(/"image":\{"uri":"(https:\/\/scontent[^"]+t51\.29350[^"]+)"/);
    if (storyImgMatch) return decode(storyImgMatch[1]);

    // Pattern 5: Any scontent image near story context
    const anyImgMatch = html.match(/"uri":"(https:\/\/scontent[^"]+\.(?:jpg|webp)[^"]*)"/);
    if (anyImgMatch) return decode(anyImgMatch[1]);

    return undefined;
}

function extractStories(html: string): { formats: MediaFormat[]; storyCount: number; thumbnail?: string } {
    const formats: MediaFormat[] = [];
    const storyVideos: StoryVideo[] = [];
    const seen = new Set<string>();

    // Extract thumbnail first
    const thumbnail = extractStoryThumbnail(html);

    // Pattern: "progressive_url":"URL","failure_reason":null,"metadata":{"quality":"HD|SD"}
    const progressiveRe = /"progressive_url":"(https:[^"]+\.mp4[^"]*)","failure_reason":null,"metadata":\{"quality":"(HD|SD)"\}/g;
    let m;

    while ((m = progressiveRe.exec(html)) !== null) {
        const url = decode(m[1]);
        const quality = m[2] as 'HD' | 'SD';
        const urlKey = url.split('?')[0];

        if (seen.has(urlKey)) continue;
        seen.add(urlKey);

        const bitrateMatch = url.match(/bitrate=(\d+)/);
        const bitrate = bitrateMatch ? parseInt(bitrateMatch[1]) : (quality === 'HD' ? 1500000 : 500000);
        storyVideos.push({ videoId: '', quality, url, bitrate });
    }

    // Group by pairs (SD + HD for same story appear consecutively)
    // No limit - show all available stories
    let storyIdx = 0;

    for (let i = 0; i < storyVideos.length; i += 2) {
        storyIdx++;
        const sdVideo = storyVideos[i];
        const hdVideo = storyVideos[i + 1];

        if (hdVideo) {
            const cdnInfo = getCdnInfo(hdVideo.url);
            const itemId = `story-${storyIdx}`;
            formats.push({
                quality: 'HD',
                type: 'video',
                url: hdVideo.url,
                format: 'mp4',
                hasMuxedAudio: true,
                thumbnail, // Add thumbnail to format
                storyIndex: storyIdx,
                itemId, // For frontend carousel grouping
                _priority: 100 + cdnInfo.score,
            } as MediaFormat & { storyIndex: number });
        }

        if (sdVideo) {
            const cdnInfo = getCdnInfo(sdVideo.url);
            const itemId = `story-${storyIdx}`;
            formats.push({
                quality: 'SD',
                type: 'video',
                url: sdVideo.url,
                format: 'mp4',
                hasMuxedAudio: true,
                thumbnail, // Add thumbnail to format
                storyIndex: storyIdx,
                itemId, // For frontend carousel grouping
                _priority: 50 + cdnInfo.score,
            } as MediaFormat & { storyIndex: number });
        }
    }

    // Image stories (fallback)
    const imagePattern = /https:\/\/scontent[^"'\s]+t51\.29350[^"'\s]+\.(?:jpg|webp)/gi;
    while ((m = imagePattern.exec(html)) !== null) {
        const url = decode(m[0]);
        const urlKey = url.split('?')[0];
        if (seen.has(urlKey)) continue;
        if (/\/s\d+x\d+\/|_s\d+x\d+/.test(url)) continue;

        seen.add(urlKey);
        formats.push({
            quality: 'Original',
            type: 'image',
            url,
            format: 'jpg',
            thumbnail: url,
        });
    }

    return { formats, storyCount: storyIdx, thumbnail };
}

// Thumbnail extraction
function extractThumbnail(html: string): string | undefined {
    const m = html.match(P.thumb);
    return m ? decode(m[1]) : undefined;
}

// Metadata extraction
function extractMeta(html: string, type?: FbContentType): FbMetadata {
    let author: string | undefined;
    let title: string | undefined;
    let description: string | undefined;
    let groupName: string | undefined;

    // ═══════════════════════════════════════════════════════════════
    // AUTHOR EXTRACTION - Prioritize owning_profile (most reliable)
    // owning_profile appears multiple times for the actual post owner
    // while actors/actor can be from suggested content
    // ═══════════════════════════════════════════════════════════════
    
    // Pattern 1: owning_profile - MOST RELIABLE for posts
    // This is the actual post owner, appears early in HTML before suggested content
    const owningMatch = html.match(/"owning_profile":\{"__typename":"(?:User|Page)"[^}]*"name":"([^"]+)"/);
    if (owningMatch) {
        author = owningMatch[1];
    }
    
    // Pattern 2: owning_profile without typename (fallback)
    if (!author) {
        const owningSimpleMatch = html.match(/"owning_profile":\{[^}]*"name":"([^"]+)"/);
        if (owningSimpleMatch) author = owningSimpleMatch[1];
    }
    
    // Pattern 3: owner with User/Page typename (for videos)
    if (!author) {
        const ownerTypeMatch = html.match(/"owner":\{"__typename":"(?:User|Page)"[^}]*"name":"([^"]+)"/);
        if (ownerTypeMatch) author = ownerTypeMatch[1];
    }
    
    // Pattern 4: creation_story > actors (for some post types)
    if (!author) {
        const creationStoryMatch = html.match(/"creation_story"[^]*?"actors":\[\{"__typename":"(?:User|Page)","id":"[^"]+","name":"([^"]+)"/);
        if (creationStoryMatch) author = creationStoryMatch[1];
    }
    
    // Pattern 5: Find post_id and extract author from BEFORE it
    // The actual post author appears before the post_id in the HTML structure
    if (!author) {
        const postIdMatch = html.match(/"post_id":"(\d+)"/);
        if (postIdMatch) {
            const postIdPos = html.indexOf(postIdMatch[0]);
            // Look BEFORE post_id for the author (actual post context)
            const beforeBlock = html.substring(Math.max(0, postIdPos - 8000), postIdPos);
            
            // Find owning_profile in block before post_id
            const owningInBlock = beforeBlock.match(/"owning_profile":\{[^}]*"name":"([^"]+)"/);
            if (owningInBlock) {
                author = owningInBlock[1];
            }
            
            // Find the LAST actor/owner in the block before post_id (closest to the post)
            if (!author) {
                const actorMatches = [...beforeBlock.matchAll(/"actor":\{[^}]*"name":"([^"]+)"/g)];
                if (actorMatches.length > 0) {
                    author = actorMatches[actorMatches.length - 1][1];
                }
            }
        }
    }
    
    // Pattern 6: og:title meta tag often contains author name for posts
    if (!author) {
        const ogTitleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
        if (ogTitleMatch) {
            // Format: "Author Name - post text..." or "Author Name posted..."
            const ogTitle = ogTitleMatch[1];
            const dashMatch = ogTitle.match(/^([^-]+)\s*-/);
            const postedMatch = ogTitle.match(/^(.+?)\s+(?:posted|shared|added)/i);
            if (dashMatch) author = dashMatch[1].trim();
            else if (postedMatch) author = postedMatch[1].trim();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // GROUP NAME EXTRACTION - For posts from Facebook Groups
    // ═══════════════════════════════════════════════════════════════
    // Pattern 1: group object with name (most reliable)
    const groupMatch = html.match(/"group":\{[^}]*"name":"([^"]+)"/);
    if (groupMatch) groupName = groupMatch[1];
    
    // Pattern 2: target_group with name
    if (!groupName) {
        const targetGroupMatch = html.match(/"target_group":\{[^}]*"name":"([^"]+)"/);
        if (targetGroupMatch) groupName = targetGroupMatch[1];
    }
    
    // Pattern 3: owning_group with name
    if (!groupName) {
        const owningGroupMatch = html.match(/"owning_group":\{[^}]*"name":"([^"]+)"/);
        if (owningGroupMatch) groupName = owningGroupMatch[1];
    }
    
    // Pattern 4: group_feed context
    if (!groupName) {
        const groupFeedMatch = html.match(/"group_feed"[^}]*"group":\{[^}]*"name":"([^"]+)"/);
        if (groupFeedMatch) groupName = groupFeedMatch[1];
    }

    // Pattern 5: __typename Group with name nearby
    if (!groupName) {
        const typeGroupMatch = html.match(/"__typename":"Group"[^}]*"name":"([^"]+)"/) ||
                               html.match(/"name":"([^"]+)"[^}]*"__typename":"Group"/);
        if (typeGroupMatch) groupName = typeGroupMatch[1];
    }

    // For stories, use story-specific patterns first
    if (type === 'story' && !author) {
        const storyOwnerMatch = html.match(/"story_bucket_owner":\{[^}]*"name":"([^"]+)"/);
        if (storyOwnerMatch) author = storyOwnerMatch[1];
        if (!author) {
            const ownerMatch = html.match(/"owner":\{[^}]*"name":"([^"]+)"/);
            if (ownerMatch) author = ownerMatch[1];
        }
        if (!author) {
            const actorMatch = html.match(/"actorID":"[^"]+","name":"([^"]+)"/);
            if (actorMatch) author = actorMatch[1];
        }
    }

    // Last fallback to general patterns (less reliable)
    if (!author) {
        author = html.match(P.meta.author)?.[1] || html.match(P.meta.authorAlt)?.[1];
    }

    const timestamp = html.match(P.meta.timestamp)?.[1];
    title = html.match(P.meta.title)?.[1];

    // ═══════════════════════════════════════════════════════════════
    // DESCRIPTION/CAPTION EXTRACTION - Multiple patterns
    // ═══════════════════════════════════════════════════════════════

    // Pattern 1: Direct message text (most reliable for posts)
    const msgPatterns = [
        /"message":\{"text":"([^"]{3,})"/,
        /"text":"([^"]{10,})"[^}]*"message"/,
    ];
    for (const p of msgPatterns) {
        const m = html.match(p);
        if (m && m[1] && !m[1].includes('\\u') && m[1].length > 5) {
            description = m[1];
            break;
        }
    }

    // Pattern 2: comet_sections message
    if (!description) {
        const cometMatch = html.match(/"comet_sections"[^}]*"message":\{"text":"([^"]+)"/);
        if (cometMatch) description = cometMatch[1];
    }

    // Pattern 3: story message text
    if (!description) {
        const storyMatch = html.match(/"story":\{[^}]*"message":\{"text":"([^"]+)"/);
        if (storyMatch) description = storyMatch[1];
    }

    // Pattern 4: creation_story message
    if (!description) {
        const creationMatch = html.match(/"creation_story"[^}]*"message":\{"text":"([^"]+)"/);
        if (creationMatch) description = creationMatch[1];
    }

    // Pattern 5: attached_story message  
    if (!description) {
        const attachedMatch = html.match(/"attached_story"[^}]*"message":\{"text":"([^"]+)"/);
        if (attachedMatch) description = attachedMatch[1];
    }

    // Pattern 6: og:description meta tag (fallback)
    if (!description) {
        const ogMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) ||
            html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i);
        if (ogMatch && ogMatch[1].length > 10) description = ogMatch[1];
    }

    // Pattern 7: Search for text near post_id (context-aware)
    if (!description) {
        const postIdMatch = html.match(/"post_id":"(\d+)"/);
        if (postIdMatch) {
            const pos = html.indexOf(postIdMatch[0]);
            const block = html.substring(Math.max(0, pos - 5000), Math.min(html.length, pos + 5000));
            const textMatch = block.match(/"text":"([^"]{15,300})"/);
            if (textMatch && !textMatch[1].startsWith('http')) {
                description = textMatch[1];
            }
        }
    }

    // Clean up description - decode unicode escapes
    if (description) {
        description = description
            .replace(/\\u[\dA-Fa-f]{4}/g, m => String.fromCharCode(parseInt(m.slice(2), 16)))
            .replace(/\\n/g, ' ')
            .replace(/\\"/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // For stories without title, use author's name
    if (!title && type === 'story' && author) {
        title = `${decode(author)}'s Story`;
    }

    // ═══════════════════════════════════════════════════════════════
    // ENGAGEMENT STATS
    // ═══════════════════════════════════════════════════════════════
    const engagement: { likes?: number; comments?: number; shares?: number; views?: number } = {};

    const reactionMatch = html.match(/"reaction_count":\{"count":(\d+)/);
    if (reactionMatch) engagement.likes = parseInt(reactionMatch[1]);

    if (!engagement.likes) {
        const i18nMatch = html.match(/"i18n_reaction_count":"([\d,KMB.]+)"/i);
        if (i18nMatch) engagement.likes = parseEngagementCount(i18nMatch[1]);
    }

    const commentMatch = html.match(/"comment_count":\{"total_count":(\d+)/) || html.match(/"comments":\{"total_count":(\d+)/);
    if (commentMatch) engagement.comments = parseInt(commentMatch[1]);

    const shareMatch = html.match(/"share_count":\{"count":(\d+)/);
    if (shareMatch) engagement.shares = parseInt(shareMatch[1]);

    const viewMatch = html.match(/"video_view_count":(\d+)/) || html.match(/"play_count":(\d+)/);
    if (viewMatch) engagement.views = parseInt(viewMatch[1]);

    const hasEngagement = engagement.likes || engagement.comments || engagement.shares || engagement.views;

    return {
        author: author ? decode(author) : undefined,
        title: title ? decode(title) : undefined,
        description: description ? decode(description).substring(0, 500) : undefined,
        timestamp: timestamp ? new Date(parseInt(timestamp) * 1000).toISOString() : undefined,
        engagement: hasEngagement ? engagement : undefined,
        groupName: groupName ? decode(groupName) : undefined,
    };
}

// Parse engagement count strings like "1.2K", "3.5M", "1,234"
function parseEngagementCount(str: string): number {
    const cleaned = str.replace(/,/g, '').trim();
    const match = cleaned.match(/([\d.]+)([KMB])?/i);
    if (!match) return 0;

    const num = parseFloat(match[1]);
    const suffix = match[2]?.toUpperCase();

    switch (suffix) {
        case 'K': return Math.round(num * 1000);
        case 'M': return Math.round(num * 1000000);
        case 'B': return Math.round(num * 1000000000);
        default: return Math.round(num);
    }
}

// Main extraction function
export function extractContent(html: string, type: FbContentType, url?: string): { formats: MediaFormat[]; metadata: FbMetadata; pattern?: string } {
    const decoded = decode(html);
    const formats: MediaFormat[] = [];
    let pattern = 'none';

    // For stories, search entire HTML
    if (type === 'story') {
        const stories = extractStories(decoded);
        formats.push(...stories.formats);
        pattern = `stories (${stories.storyCount} unique)`;
    }
    // For reels/videos, prioritize video extraction
    else if (type === 'reel' || type === 'video') {
        const block = findBlock(decoded, type);
        const thumbnail = extractThumbnail(block);

        // Extract videos - filter to first asset for reels
        const videos = extractVideos(block, true);
        for (const v of videos) {
            formats.push({
                quality: v.quality,
                type: 'video',
                url: v.url,
                format: 'mp4',
                thumbnail,
                hasMuxedAudio: v.hasMuxedAudio,
                _priority: v.priority,
            } as MediaFormat);
        }

        if (videos.length > 0) {
            pattern = `video (${videos.length > 1 ? 'HD/SD' : 'single'})`;
        }
    }
    // For posts/photos, search entire HTML for images first
    else if (type === 'post' || type === 'photo' || type === 'group') {
        const images = extractImages(decoded);
        if (images.formats.length > 0) {
            formats.push(...images.formats);
            pattern = images.pattern;
        }
    }

    // If no formats found, try block-based extraction
    if (formats.length === 0) {
        const block = findBlock(decoded, type);
        const thumbnail = extractThumbnail(block);

        // Extract videos - for reels/videos, filter to first asset only
        const filterToFirst = type === 'reel' || type === 'video';
        const videos = extractVideos(block, filterToFirst);
        for (const v of videos) {
            formats.push({
                quality: v.quality,
                type: 'video',
                url: v.url,
                format: 'mp4',
                thumbnail,
                hasMuxedAudio: v.hasMuxedAudio,
                _priority: v.priority,
            } as MediaFormat);
        }

        if (videos.length > 0) {
            pattern = `video (${videos.length > 1 ? 'HD/SD' : 'single'})`;
        }

        // Extract images from block if none found yet
        if (formats.length === 0) {
            const blockImages = extractImages(block);
            formats.push(...blockImages.formats);
            pattern = blockImages.pattern;
        }
    }

    // Dedupe by quality - keep best (highest priority or largest filesize) per quality tier
    const bestByQuality = new Map<string, MediaFormat>();
    for (const f of formats) {
        // For images, use URL-based dedup (each image is unique)
        if (f.type === 'image') {
            const key = f.url.split('?')[0];
            if (!bestByQuality.has(key)) {
                bestByQuality.set(key, f);
            }
            continue;
        }
        
        // For videos, dedupe by quality tier
        const existing = bestByQuality.get(f.quality);
        if (!existing) {
            bestByQuality.set(f.quality, f);
        } else {
            // Keep the one with higher priority or larger filesize
            const existingPriority = (existing as MediaFormat & { _priority?: number })._priority || 0;
            const newPriority = (f as MediaFormat & { _priority?: number })._priority || 0;
            if (newPriority > existingPriority) {
                bestByQuality.set(f.quality, f);
            } else if (newPriority === existingPriority) {
                const existingSize = existing.filesize || 0;
                const newSize = f.filesize || 0;
                if (newSize > existingSize) {
                    bestByQuality.set(f.quality, f);
                }
            }
        }
    }
    const deduped = Array.from(bestByQuality.values());

    return {
        formats: deduped,
        metadata: extractMeta(decoded, type),
        pattern,
    };
}
