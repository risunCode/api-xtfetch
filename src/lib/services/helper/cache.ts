/**
 * Centralized Cache for Scrapers
 * Storage: Redis (Upstash) - fast, ephemeral cache
 */

import { PlatformId } from './api-config';
import { 
    getResultCache as redisGet, 
    setResultCache as redisSet,
    getResultCacheByKey as redisGetByKey,
    setResultCacheByKey as redisSetByKey,
    clearResultCache as redisClear,
    getResultCacheStats as redisStats,
    getResultCacheKey,
    getResultCacheKeyLegacy
} from '@/lib/redis';

export { getResultCacheKey as getCacheKey, getResultCacheKeyLegacy };

export async function getCache<T>(platform: PlatformId, resolvedUrl: string): Promise<T | null> {
    return redisGet<T>(platform, resolvedUrl);
}

export async function getCacheByKey<T>(cacheKey: string): Promise<T | null> {
    return redisGetByKey<T>(cacheKey);
}

export async function setCache<T>(platform: PlatformId, resolvedUrl: string, data: T, _customTtl?: number): Promise<void> {
    await redisSet(platform, resolvedUrl, data);
}

export async function setCacheByKey<T>(cacheKey: string, platform: PlatformId, data: T): Promise<void> {
    await redisSetByKey(cacheKey, platform, data);
}

export async function hasCache(platform: PlatformId, url: string): Promise<boolean> {
    return (await getCache(platform, url)) !== null;
}

export async function clearCache(platform?: PlatformId): Promise<number> {
    return redisClear(platform);
}

export async function getCacheStats(): Promise<{
    size: number;
    hits: number;
    misses: number;
    hitRate: string;
    byPlatform: Record<string, number>;
}> {
    return redisStats();
}

export async function cleanupCache(): Promise<number> {
    return 0;
}
