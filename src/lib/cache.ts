/**
 * Unified Cache Module
 * Replaces: lib/services/helper/cache.ts + redis.ts cache functions
 * 
 * Features:
 * - Content ID-based caching (same content = same cache key)
 * - Alias support for short URLs
 * - Smart TTL by content type
 * - Hit/miss statistics tracking
 * - Graceful degradation when Redis unavailable
 */

import { redis, isRedisAvailable } from '@/lib/database';
import { type PlatformId } from '@/core/config';

// ============================================================================
// TYPES
// ============================================================================

export type ContentType = 'video' | 'reel' | 'story' | 'post' | 'image' | 'slideshow' | 'mixed' | 'unknown';

export interface CacheResult<T> {
    hit: boolean;
    data?: T;
    source?: 'content-id' | 'alias' | 'url-hash';
    latency?: number;
}

export interface CacheStats {
    size: number;
    hits: number;
    misses: number;
    hitRate: string;
    byPlatform: Record<string, { keys: number; hits: number; misses: number }>;
}

// ============================================================================
// CONSTANTS - SMART TTL BY CONTENT TYPE
// ============================================================================

// MAX TTL: 2 hours for all platforms (CDN URLs can expire)
const MAX_TTL = 2 * 3600; // 2 hours

const SMART_TTL: Record<PlatformId, Record<ContentType, number>> = {
    twitter: {
        post: 2 * 3600,           // 2 hours (max)
        video: 2 * 3600,
        reel: 2 * 3600,
        story: 1 * 3600,          // 1 hour (fleets - deprecated but just in case)
        image: 2 * 3600,
        slideshow: 2 * 3600,
        mixed: 2 * 3600,
        unknown: 2 * 3600,
    },
    instagram: {
        post: 2 * 3600,           // 2 hours (max)
        video: 2 * 3600,
        reel: 2 * 3600,
        story: 30 * 60,           // 30 minutes (stories expire in 24h, URLs may change)
        image: 2 * 3600,
        slideshow: 2 * 3600,
        mixed: 2 * 3600,
        unknown: 2 * 3600,
    },
    tiktok: {
        post: 2 * 3600,           // 2 hours (max)
        video: 2 * 3600,
        reel: 2 * 3600,
        story: 1 * 3600,
        image: 2 * 3600,
        slideshow: 2 * 3600,      // TikTok slideshows
        mixed: 2 * 3600,
        unknown: 2 * 3600,
    },
    youtube: {
        post: 5 * 60,             // 5 minutes - YouTube URLs expire quickly (~6h)
        video: 5 * 60,            // 5 minutes
        reel: 5 * 60,             // Shorts - 5 minutes
        story: 5 * 60,
        image: 5 * 60,
        slideshow: 5 * 60,
        mixed: 5 * 60,
        unknown: 5 * 60,
    },
    facebook: {
        post: 2 * 3600,           // 2 hours (max)
        video: 2 * 3600,
        reel: 2 * 3600,
        story: 30 * 60,           // 30 minutes (stories expire)
        image: 2 * 3600,
        slideshow: 2 * 3600,
        mixed: 2 * 3600,
        unknown: 2 * 3600,
    },
    weibo: {
        post: 2 * 3600,           // 2 hours (max)
        video: 2 * 3600,
        reel: 2 * 3600,
        story: 1 * 3600,
        image: 2 * 3600,
        slideshow: 2 * 3600,
        mixed: 2 * 3600,
        unknown: 2 * 3600,
    },
};

// Default TTL fallback (2 hours max)
const DEFAULT_TTL = 2 * 3600;

// Alias TTL (30 days - short URL mappings)
const ALIAS_TTL = 30 * 24 * 3600;

// ============================================================================
// CONTENT ID EXTRACTORS
// ============================================================================

/**
 * Content ID extraction patterns for each platform
 * These extract the unique identifier from URLs without HTTP requests
 */
const CONTENT_ID_EXTRACTORS: Record<PlatformId, (url: string) => string | null> = {
    twitter: (url) => {
        const match = url.match(/status(?:es)?\/(\d+)/i);
        return match ? match[1] : null;
    },
    
    instagram: (url) => {
        // Post/Reel/TV shortcode
        const shortcode = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
        if (shortcode) return shortcode[1];
        // Story ID
        const storyId = url.match(/\/stories\/[^/]+\/(\d+)/i);
        if (storyId) return `story:${storyId[1]}`;
        return null;
    },
    
    facebook: (url) => {
        // Video ID patterns
        const videoId = url.match(/\/(?:videos?|watch|reel)\/(\d+)/i);
        if (videoId) return videoId[1];
        const watchParam = url.match(/[?&]v=(\d+)/i);
        if (watchParam) return watchParam[1];
        // Group permalink
        const groupPermalink = url.match(/\/groups\/\d+\/permalink\/(\d+)/i);
        if (groupPermalink) return groupPermalink[1];
        // Story fbid
        const storyFbid = url.match(/story_fbid=(\d+)/i);
        if (storyFbid) return storyFbid[1];
        // pfbid (new format)
        const pfbid = url.match(/pfbid([A-Za-z0-9]+)/i);
        if (pfbid) return `pfbid${pfbid[1]}`;
        // Share links
        const shareId = url.match(/\/share\/[prvs]\/([A-Za-z0-9]+)/i);
        if (shareId) return `share:${shareId[1]}`;
        // Post ID
        const postId = url.match(/\/posts\/(\d+)/i);
        if (postId) return postId[1];
        // Story ID
        const storyId = url.match(/\/stories\/[^/]+\/(\d+)/i);
        if (storyId) return `story:${storyId[1]}`;
        // Photo ID
        const photoId = url.match(/\/photos?\/[^/]+\/(\d+)/i);
        if (photoId) return `photo:${photoId[1]}`;
        return null;
    },
    
    tiktok: (url) => {
        const videoId = url.match(/\/video\/(\d+)/i);
        if (videoId) return videoId[1];
        const fullUrl = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/i);
        if (fullUrl) return fullUrl[1];
        return null;
    },
    
    youtube: (url) => {
        // Watch parameter
        const watchId = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (watchId) return watchId[1];
        // Short URL
        const shortId = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
        if (shortId) return shortId[1];
        // Embed
        const embedId = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
        if (embedId) return embedId[1];
        // Shorts
        const shortsId = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (shortsId) return shortsId[1];
        return null;
    },
    
    weibo: (url) => {
        // Long numeric ID
        const longId = url.match(/\/(\d{16,})/);
        if (longId) return longId[1];
        // User:post format
        const userPost = url.match(/weibo\.(?:com|cn)\/(\d+)\/([A-Za-z0-9]+)/);
        if (userPost) return `${userPost[1]}:${userPost[2]}`;
        // Detail/status
        const detail = url.match(/\/(?:detail|status)\/(\d+)/i);
        if (detail) return detail[1];
        return null;
    },
};

// ============================================================================
// SHORT URL DETECTION
// ============================================================================

const SHORT_URL_PATTERNS: RegExp[] = [
    /fb\.watch/i,
    /fb\.me/i,
    /t\.co\//i,
    /vm\.tiktok\.com/i,
    /vt\.tiktok\.com/i,
    /instagr\.am/i,
    /ig\.me/i,
    /t\.cn\//i,
    /youtu\.be/i,
    /l\.facebook\.com/i,
];

/**
 * Check if URL is a short URL that needs resolution
 */
export function cacheIsShortUrl(url: string): boolean {
    return SHORT_URL_PATTERNS.some(pattern => pattern.test(url));
}

// ============================================================================
// HASH FUNCTION
// ============================================================================

/**
 * Simple hash function for URL-based cache keys
 */
function hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
}

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

/**
 * Extract content ID from URL without HTTP request
 * Returns null if content ID cannot be extracted (e.g., short URLs)
 */
export function cacheExtractContentId(platform: PlatformId, url: string): string | null {
    // Short URLs cannot have content ID extracted without resolution
    if (cacheIsShortUrl(url)) return null;
    
    const extractor = CONTENT_ID_EXTRACTORS[platform];
    if (!extractor) return null;
    
    return extractor(url);
}

/**
 * Generate primary cache key from platform and content ID
 */
export function cacheGenerateKey(platform: PlatformId, contentId: string): string {
    return `result:${platform}:${contentId}`;
}

/**
 * Generate alias key for short URLs
 */
export function cacheGenerateAliasKey(url: string): string {
    const hash = hashString(url.toLowerCase().trim());
    return `alias:${hash}`;
}

/**
 * Generate URL-hash based cache key (fallback when no content ID)
 */
export function cacheGenerateUrlKey(platform: PlatformId, url: string): string {
    const cleanUrl = url.toLowerCase().trim().replace(/[?&](fbclid|igshid|utm_\w+)=[^&]*/gi, '');
    const hash = hashString(cleanUrl);
    return `result:${platform}:url:${hash}`;
}

// ============================================================================
// CORE CACHE FUNCTIONS
// ============================================================================

/**
 * Quick cache check by content ID (no HTTP required)
 * Use this BEFORE URL resolution for fastest cache hits
 */
export async function cacheGetQuick<T>(platform: PlatformId, url: string): Promise<CacheResult<T>> {
    const startTime = Date.now();
    
    if (!isRedisAvailable() || !redis) {
        return { hit: false };
    }
    
    try {
        // Try to extract content ID without HTTP
        const contentId = cacheExtractContentId(platform, url);
        
        if (contentId) {
            const key = cacheGenerateKey(platform, contentId);
            const data = await redis.get<T>(key);
            
            if (data) {
                // Track hit
                await cacheTrackHit(platform);
                return {
                    hit: true,
                    data,
                    source: 'content-id',
                    latency: Date.now() - startTime,
                };
            }
        }
        
        // For short URLs, check alias cache
        if (cacheIsShortUrl(url)) {
            const aliasKey = cacheGenerateAliasKey(url);
            const aliasData = await redis.get<{ platform: PlatformId; contentId: string }>(aliasKey);
            
            if (aliasData) {
                const key = cacheGenerateKey(aliasData.platform, aliasData.contentId);
                const data = await redis.get<T>(key);
                
                if (data) {
                    await cacheTrackHit(platform);
                    return {
                        hit: true,
                        data,
                        source: 'alias',
                        latency: Date.now() - startTime,
                    };
                }
            }
        }
        
        return { hit: false, latency: Date.now() - startTime };
    } catch {
        // Graceful degradation - cache unavailable, continue without cache
        return { hit: false };
    }
}

/**
 * Full cache check (after URL resolution)
 * Use this after prepareUrl() to check cache with resolved URL
 */
export async function cacheGet<T>(platform: PlatformId, url: string): Promise<CacheResult<T>> {
    const startTime = Date.now();
    
    if (!isRedisAvailable() || !redis) {
        return { hit: false };
    }
    
    try {
        // Try content ID first
        const contentId = cacheExtractContentId(platform, url);
        
        if (contentId) {
            const key = cacheGenerateKey(platform, contentId);
            const data = await redis.get<T>(key);
            
            if (data) {
                await cacheTrackHit(platform);
                return {
                    hit: true,
                    data,
                    source: 'content-id',
                    latency: Date.now() - startTime,
                };
            }
        }
        
        // Fallback to URL hash
        const urlKey = cacheGenerateUrlKey(platform, url);
        const urlData = await redis.get<T>(urlKey);
        
        if (urlData) {
            await cacheTrackHit(platform);
            return {
                hit: true,
                data: urlData,
                source: 'url-hash',
                latency: Date.now() - startTime,
            };
        }
        
        // Track miss
        await cacheTrackMiss(platform);
        return { hit: false, latency: Date.now() - startTime };
    } catch {
        return { hit: false };
    }
}

/**
 * Set cache with smart TTL
 */
export async function cacheSet<T>(
    platform: PlatformId,
    url: string,
    data: T,
    contentType?: ContentType
): Promise<void> {
    if (!isRedisAvailable() || !redis) return;
    
    try {
        const contentId = cacheExtractContentId(platform, url);
        const ttl = getTTL(platform, contentType);
        
        // Always set by content ID if available
        if (contentId) {
            const key = cacheGenerateKey(platform, contentId);
            await redis.set(key, data, { ex: ttl });
        }
        
        // Also set by URL hash as fallback
        const urlKey = cacheGenerateUrlKey(platform, url);
        await redis.set(urlKey, data, { ex: ttl });
    } catch {
        // Graceful degradation - cache write failed, continue
    }
}

/**
 * Set alias for short URL → content ID mapping
 * Call this after resolving a short URL to enable future quick cache hits
 */
export async function cacheSetAlias(
    shortUrl: string,
    platform: PlatformId,
    contentId: string
): Promise<void> {
    if (!isRedisAvailable() || !redis) return;
    if (!cacheIsShortUrl(shortUrl)) return;
    
    try {
        const aliasKey = cacheGenerateAliasKey(shortUrl);
        await redis.set(aliasKey, { platform, contentId }, { ex: ALIAS_TTL });
    } catch {
        // Graceful degradation
    }
}

// ============================================================================
// HELPER FUNCTIONS (Extracted for DRY)
// ============================================================================

/**
 * Try to get cached result with fallback from quick cache to resolved URL cache
 * Automatically handles alias backfill for short URLs on cache hit
 */
export async function cacheGetWithFallback<T>(
    platform: PlatformId,
    originalUrl: string,
    resolvedUrl?: string
): Promise<CacheResult<T>> {
    // 1. Try quick cache (content ID based)
    const quickResult = await cacheGetQuick<T>(platform, originalUrl);
    if (quickResult.hit) return quickResult;
    
    // 2. If URL was resolved, try resolved URL cache
    if (resolvedUrl && resolvedUrl !== originalUrl) {
        const resolvedResult = await cacheGet<T>(platform, resolvedUrl);
        if (resolvedResult.hit) {
            // Backfill alias for short URL
            const contentId = cacheExtractContentId(platform, resolvedUrl);
            if (contentId && cacheIsShortUrl(originalUrl)) {
                cacheSetAlias(originalUrl, platform, contentId).catch(() => {});
            }
            return resolvedResult;
        }
    }
    
    return { hit: false };
}

/**
 * Set cache with automatic alias handling for short URLs
 */
export async function cacheSetWithAlias<T>(
    platform: PlatformId,
    originalUrl: string,
    resolvedUrl: string,
    data: T,
    contentType?: ContentType
): Promise<void> {
    try {
        await cacheSet(platform, resolvedUrl, data, contentType);
        
        // Set alias for short URLs
        const contentId = cacheExtractContentId(platform, resolvedUrl);
        if (contentId && cacheIsShortUrl(originalUrl)) {
            await cacheSetAlias(originalUrl, platform, contentId);
        }
    } catch {
        // Graceful degradation
    }
}

/**
 * Get TTL based on platform and content type
 */
function getTTL(platform: PlatformId, contentType?: ContentType): number {
    const platformTTL = SMART_TTL[platform];
    if (!platformTTL) return DEFAULT_TTL;
    
    const type = contentType || 'unknown';
    return platformTTL[type] || DEFAULT_TTL;
}

// ============================================================================
// STATISTICS TRACKING
// ============================================================================

async function cacheTrackHit(platform: PlatformId): Promise<void> {
    if (!isRedisAvailable() || !redis) return;
    
    try {
        await Promise.all([
            redis.incr('stats:cache:hits'),
            redis.incr(`stats:cache:platform:${platform}:hits`),
        ]);
    } catch {
        // Stats tracking failed, not critical
    }
}

async function cacheTrackMiss(platform: PlatformId): Promise<void> {
    if (!isRedisAvailable() || !redis) return;
    
    try {
        await Promise.all([
            redis.incr('stats:cache:misses'),
            redis.incr(`stats:cache:platform:${platform}:misses`),
        ]);
    } catch {
        // Stats tracking failed, not critical
    }
}

/**
 * Get cache statistics
 */
export async function cacheGetStats(): Promise<CacheStats> {
    const defaultStats: CacheStats = {
        size: 0,
        hits: 0,
        misses: 0,
        hitRate: '0%',
        byPlatform: {},
    };
    
    if (!isRedisAvailable() || !redis) return defaultStats;
    
    try {
        const platforms: PlatformId[] = ['twitter', 'instagram', 'facebook', 'tiktok', 'youtube', 'weibo'];
        
        // Use pipeline to batch all stats GET operations in a single round-trip
        // Order: global hits, global misses, then for each platform: hits, misses
        const pipeline = redis.pipeline();
        pipeline.get('stats:cache:hits');
        pipeline.get('stats:cache:misses');
        for (const platform of platforms) {
            pipeline.get(`stats:cache:platform:${platform}:hits`);
            pipeline.get(`stats:cache:platform:${platform}:misses`);
        }
        
        // Execute pipeline - results come back in order
        const results = await pipeline.exec();
        
        // Parse global stats (first 2 results)
        const totalHits = (results[0] as number) || 0;
        const totalMisses = (results[1] as number) || 0;
        const total = totalHits + totalMisses;
        const hitRate = total > 0 ? ((totalHits / total) * 100).toFixed(1) + '%' : '0%';
        
        // Initialize byPlatform with hits/misses from pipeline results
        const byPlatform: Record<string, { keys: number; hits: number; misses: number }> = {};
        for (let i = 0; i < platforms.length; i++) {
            const platform = platforms[i];
            // Platform stats start at index 2, each platform has 2 values (hits, misses)
            const platformHits = (results[2 + i * 2] as number) || 0;
            const platformMisses = (results[2 + i * 2 + 1] as number) || 0;
            byPlatform[platform] = { keys: 0, hits: platformHits, misses: platformMisses };
        }
        
        // Count cache keys using SCAN (unavoidable for key counting)
        let size = 0;
        let cursor = 0;
        do {
            const [nextCursor, keys] = await redis.scan(cursor, { match: 'result:*', count: 100 });
            cursor = Number(nextCursor);
            size += keys.length;
            
            // Count by platform
            for (const key of keys) {
                const parts = key.split(':');
                if (parts.length >= 2) {
                    const platform = parts[1];
                    if (!byPlatform[platform]) {
                        byPlatform[platform] = { keys: 0, hits: 0, misses: 0 };
                    }
                    byPlatform[platform].keys++;
                }
            }
        } while (cursor !== 0);
        
        return {
            size,
            hits: totalHits,
            misses: totalMisses,
            hitRate,
            byPlatform,
        };
    } catch {
        return defaultStats;
    }
}

/**
 * Clear cache (optionally by platform)
 */
export async function cacheClear(platform?: PlatformId): Promise<number> {
    if (!isRedisAvailable() || !redis) return 0;
    
    try {
        const pattern = platform ? `result:${platform}:*` : 'result:*';
        let cursor = 0;
        let totalCleared = 0;
        
        do {
            const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
            cursor = Number(nextCursor);
            
            if (keys.length > 0) {
                await redis.del(...keys);
                totalCleared += keys.length;
            }
        } while (cursor !== 0);
        
        // Also clear aliases if clearing all
        if (!platform) {
            cursor = 0;
            do {
                const [nextCursor, keys] = await redis.scan(cursor, { match: 'alias:*', count: 100 });
                cursor = Number(nextCursor);
                
                if (keys.length > 0) {
                    await redis.del(...keys);
                    totalCleared += keys.length;
                }
            } while (cursor !== 0);
        }
        
        return totalCleared;
    } catch {
        return 0;
    }
}

/**
 * Reset cache statistics
 */
export async function cacheResetStats(): Promise<void> {
    if (!isRedisAvailable() || !redis) return;
    
    try {
        const platforms: PlatformId[] = ['twitter', 'instagram', 'facebook', 'tiktok', 'youtube', 'weibo'];
        const keysToDelete = [
            'stats:cache:hits',
            'stats:cache:misses',
            ...platforms.flatMap(p => [
                `stats:cache:platform:${p}:hits`,
                `stats:cache:platform:${p}:misses`,
            ]),
        ];
        
        await redis.del(...keysToDelete);
    } catch {
        // Stats reset failed, not critical
    }
}

/**
 * Delete specific cache entry by URL
 * Used when scrape fails to force fresh retry
 */
export async function cacheDelete(platform: PlatformId, url: string): Promise<boolean> {
    if (!isRedisAvailable() || !redis) return false;
    
    try {
        const keysToDelete: string[] = [];
        
        // Try content ID key
        const contentId = cacheExtractContentId(platform, url);
        if (contentId) {
            keysToDelete.push(cacheGenerateKey(platform, contentId));
        }
        
        // Try URL hash key (fallback)
        keysToDelete.push(cacheGenerateUrlKey(platform, url));
        
        // Try alias key for short URLs
        if (cacheIsShortUrl(url)) {
            keysToDelete.push(cacheGenerateAliasKey(url));
        }
        
        if (keysToDelete.length > 0) {
            await redis.del(...keysToDelete);
            console.log(`[Cache] Deleted ${keysToDelete.length} keys for ${platform}:${url.substring(0, 50)}...`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('[Cache] Delete failed:', error);
        return false;
    }
}
