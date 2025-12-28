/**
 * Bot Queue Configuration
 * 
 * Configuration for BullMQ download queue.
 * Uses Upstash Redis with ioredis-compatible connection.
 */

import IORedis from 'ioredis';

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

export const QUEUE_CONFIG = {
    /** Queue name in Redis */
    QUEUE_NAME: 'bot-downloads',

    /** Worker concurrency (simultaneous jobs) */
    CONCURRENCY: 10,

    /** Maximum queue depth before rejecting new jobs */
    MAX_QUEUE_DEPTH: 100,

    /** Rate limiting for the queue */
    RATE_LIMIT: {
        /** Max jobs per duration */
        MAX_JOBS: 30,
        /** Duration in milliseconds */
        DURATION_MS: 60_000, // 1 minute
    },

    /** Job options */
    JOB_OPTIONS: {
        /** Number of retry attempts */
        ATTEMPTS: 2,
        /** Backoff delay in milliseconds */
        BACKOFF_DELAY: 1000,
        /** Keep last N completed jobs */
        REMOVE_ON_COMPLETE: 100,
        /** Keep last N failed jobs */
        REMOVE_ON_FAIL: 50,
    },

    /** Priority levels (lower = higher priority) */
    PRIORITY: {
        PREMIUM: 1,
        FREE: 10,
    },
} as const;

// ============================================================================
// REDIS CONNECTION
// ============================================================================

let redisConnection: IORedis | null = null;

/**
 * Get or create Redis connection for BullMQ
 * 
 * BullMQ requires ioredis, not the Upstash REST client.
 * For Upstash, we need to use their Redis URL with ioredis.
 */
export function getRedisConnection(): IORedis | null {
    if (redisConnection) return redisConnection;

    const redisUrl = process.env.UPSTASH_REDIS_URL;
    
    if (!redisUrl) {
        console.warn('[Queue] UPSTASH_REDIS_URL not configured');
        return null;
    }

    try {
        redisConnection = new IORedis(redisUrl, {
            maxRetriesPerRequest: null, // Required by BullMQ
            enableReadyCheck: false,
            // Upstash requires TLS
            tls: redisUrl.startsWith('rediss://') ? {} : undefined,
        });

        redisConnection.on('error', (err) => {
            console.error('[Queue] Redis connection error:', err.message);
        });

        return redisConnection;
    } catch (error) {
        console.error('[Queue] Failed to create Redis connection:', error);
        return null;
    }
}

/**
 * Close Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
    if (redisConnection) {
        await redisConnection.quit();
        redisConnection = null;
    }
}
