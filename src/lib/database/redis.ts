/**
 * Redis Client (Upstash)
 * For rate limiting and session management
 * 
 * NOTE: Cache functions have been moved to lib/cache.ts
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

/**
 * Rate limiting using Redis
 * Returns { success: boolean, remaining: number }
 */
export async function rateLimit(
    key: string,
    limit: number,
    windowSeconds: number
): Promise<{ success: boolean; remaining: number }> {
    if (!redis) {
        // No Redis = no rate limiting, allow all
        return { success: true, remaining: limit };
    }

    try {
        const current = await redis.incr(key);
        
        // Set expiry on first request
        if (current === 1) {
            await redis.expire(key, windowSeconds);
        }

        const remaining = Math.max(0, limit - current);
        return {
            success: current <= limit,
            remaining,
        };
    } catch {
        // On error, allow request
        return { success: true, remaining: limit };
    }
}
