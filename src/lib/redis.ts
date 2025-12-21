/**
 * Redis Client (Upstash)
 * For rate limiting, caching, and session management
 */

import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (url && token) {
    redis = new Redis({ url, token });
}

export { redis };
export const isRedisAvailable = () => !!redis;

type PlatformId = 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo' | 'youtube';

const DEFAULT_CACHE_TTL: Record<PlatformId, number> = {
    facebook: 3 * 24 * 60 * 60,
    instagram: 3 * 24 * 60 * 60,
    twitter: 3 * 24 * 60 * 60,
    tiktok: 3 * 24 * 60 * 60,
    weibo: 3 * 24 * 60 * 60,
    youtube: 3 * 24 * 60 * 60,
};

let ttlCache: { data: Record<PlatformId, number>; loadedAt: number } | null = null;
const TTL_CACHE_DURATION = 5 * 60 * 1000;

async function getCacheTTL(platform: PlatformId): Promise<number> {
    if (ttlCache && Date.now() - ttlCache.loadedAt < TTL_CACHE_DURATION) {
        return ttlCache.data[platform] || DEFAULT_CACHE_TTL[platform];
    }
    return DEFAULT_CACHE_TTL[platform];
}

function getCanonicalContentId(platform: PlatformId, url: string): string | null {
    switch (platform) {
        case 'facebook': {
            const videoId = url.match(/\/(?:videos?|watch|reel)\/(\d+)/i);
            if (videoId) return videoId[1];
            const watchParam = url.match(/[?&]v=(\d+)/i);
            if (watchParam) return watchParam[1];
            const groupPermalink = url.match(/\/groups\/\d+\/permalink\/(\d+)/i);
            if (groupPermalink) return groupPermalink[1];
            const storyFbid = url.match(/story_fbid=(\d+)/i);
            if (storyFbid) return storyFbid[1];
            const pfbid = url.match(/pfbid([A-Za-z0-9]+)/i);
            if (pfbid) return `pfbid${pfbid[1]}`;
            const shareId = url.match(/\/share\/[prvs]\/([A-Za-z0-9]+)/i);
            if (shareId) return `share:${shareId[1]}`;
            const postId = url.match(/\/posts\/(\d+)/i);
            if (postId) return postId[1];
            const storyId = url.match(/\/stories\/[^/]+\/(\d+)/i);
            if (storyId) return `story:${storyId[1]}`;
            const photoId = url.match(/\/photos?\/[^/]+\/(\d+)/i);
            if (photoId) return `photo:${photoId[1]}`;
            return null;
        }
        case 'instagram': {
            const shortcode = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
            if (shortcode) return shortcode[1];
            const storyId = url.match(/\/stories\/[^/]+\/(\d+)/i);
            if (storyId) return `story:${storyId[1]}`;
            return null;
        }
        case 'twitter': {
            const tweetId = url.match(/\/status(?:es)?\/(\d+)/i);
            if (tweetId) return tweetId[1];
            return null;
        }
        case 'tiktok': {
            const videoId = url.match(/\/video\/(\d+)/i);
            if (videoId) return videoId[1];
            const fullUrl = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/i);
            if (fullUrl) return fullUrl[1];
            return null;
        }
        case 'weibo': {
            const longId = url.match(/\/(\d{16,})/);
            if (longId) return longId[1];
            const userPost = url.match(/weibo\.(?:com|cn)\/(\d+)\/([A-Za-z0-9]+)/);
            if (userPost) return `${userPost[1]}:${userPost[2]}`;
            const detail = url.match(/\/detail\/(\d+)/i);
            if (detail) return detail[1];
            const status = url.match(/\/status\/(\d+)/i);
            if (status) return status[1];
            return null;
        }
        case 'youtube': {
            const watchId = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            if (watchId) return watchId[1];
            const shortId = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
            if (shortId) return shortId[1];
            const embedId = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
            if (embedId) return embedId[1];
            const shortsId = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
            if (shortsId) return shortsId[1];
            return null;
        }
    }
    return null;
}

function extractContentIdLegacy(platform: PlatformId, url: string): string | null {
    if (/fb\.watch|t\.co\/|vm\.tiktok|vt\.tiktok|instagr\.am|t\.cn\//i.test(url)) return null;
    return getCanonicalContentId(platform, url);
}

export function getResultCacheKey(platform: PlatformId, url: string): string | null {
    const contentId = getCanonicalContentId(platform, url);
    if (!contentId) return null;
    return `result:${platform}:${contentId}`;
}

export function getResultCacheKeyLegacy(platform: PlatformId, url: string): string | null {
    const contentId = extractContentIdLegacy(platform, url);
    if (!contentId) return null;
    return `result:${platform}:${contentId}`;
}

export async function getResultCache<T>(platform: PlatformId, url: string): Promise<T | null> {
    if (!redis) return null;
    const key = getResultCacheKey(platform, url);
    if (!key) return null;
    try { return await redis.get<T>(key); } catch { return null; }
}

export async function getResultCacheByKey<T>(cacheKey: string): Promise<T | null> {
    if (!redis || !cacheKey) return null;
    try { return await redis.get<T>(cacheKey); } catch { return null; }
}

export async function setResultCache<T>(platform: PlatformId, url: string, data: T): Promise<void> {
    if (!redis) return;
    const key = getResultCacheKey(platform, url);
    if (!key) return;
    const ttl = await getCacheTTL(platform);
    try { await redis.set(key, data, { ex: ttl }); } catch { /* ignore */ }
}

export async function setResultCacheByKey<T>(cacheKey: string, platform: PlatformId, data: T): Promise<void> {
    if (!redis || !cacheKey) return;
    const ttl = await getCacheTTL(platform);
    try { await redis.set(cacheKey, data, { ex: ttl }); } catch { /* ignore */ }
}

export async function clearResultCache(platform?: PlatformId): Promise<number> {
    if (!redis) return 0;
    try {
        const pattern = platform ? `result:${platform}:*` : 'result:*';
        let cursor = 0, totalCleared = 0;
        do {
            const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
            cursor = Number(nextCursor);
            if (keys.length > 0) { await redis.del(...keys); totalCleared += keys.length; }
        } while (cursor !== 0);
        return totalCleared;
    } catch { return 0; }
}

export async function getResultCacheStats(): Promise<{ size: number; byPlatform: Record<string, number>; hits: number; misses: number; hitRate: string }> {
    if (!redis) return { size: 0, byPlatform: {}, hits: 0, misses: 0, hitRate: '0%' };
    const byPlatform: Record<string, number> = {};
    let size = 0;
    try {
        let cursor = 0;
        do {
            const [nextCursor, keys] = await redis.scan(cursor, { match: 'result:*', count: 100 });
            cursor = Number(nextCursor);
            for (const key of keys) {
                size++;
                const parts = key.split(':');
                if (parts.length >= 2) byPlatform[parts[1]] = (byPlatform[parts[1]] || 0) + 1;
            }
        } while (cursor !== 0);
        return { size, byPlatform, hits: 0, misses: 0, hitRate: 'N/A' };
    } catch { return { size: 0, byPlatform: {}, hits: 0, misses: 0, hitRate: '0%' }; }
}
