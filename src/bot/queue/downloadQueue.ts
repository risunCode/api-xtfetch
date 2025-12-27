/**
 * Bot Download Queue
 * BullMQ queue for processing Telegram bot download requests concurrently
 */

import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_CONFIG } from './config';

/**
 * Download job data interface
 */
export interface DownloadJobData {
    /** Telegram chat ID */
    chatId: number;
    /** Telegram user ID */
    userId: number;
    /** Original message ID (user's message) */
    messageId: number;
    /** Processing message ID (bot's "Processing..." message) */
    processingMsgId: number;
    /** URL to download */
    url: string;
    /** Whether user has premium status */
    isPremium: boolean;
    /** Job creation timestamp */
    timestamp: number;
}

/**
 * Create IORedis connection for BullMQ
 * BullMQ requires IORedis-compatible connection (not Upstash REST client)
 * Uses UPSTASH_REDIS_URL which is in rediss:// format
 */
function createRedisConnection(): IORedis | null {
    const redisUrl = process.env.UPSTASH_REDIS_URL;

    if (!redisUrl) {
        console.warn('[Queue] UPSTASH_REDIS_URL not found, queue will not be available');
        return null;
    }

    try {
        return new IORedis(redisUrl, {
            maxRetriesPerRequest: null, // Required for BullMQ
            enableReadyCheck: false,
            tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
        });
    } catch (error) {
        console.error('[Queue] Failed to create Redis connection:', error);
        return null;
    }
}

// Create Redis connection for BullMQ
const redisConnection = createRedisConnection();

if (redisConnection) {
    redisConnection.on('error', (err) => {
        console.error('[Queue] Redis error:', err.message);
    });
}

// Queue options
const queueOptions: QueueOptions | undefined = redisConnection
    ? {
          connection: redisConnection,
          defaultJobOptions: {
              attempts: QUEUE_CONFIG.JOB_OPTIONS.ATTEMPTS,
              backoff: {
                  type: 'fixed',
                  delay: QUEUE_CONFIG.JOB_OPTIONS.BACKOFF_DELAY,
              },
              removeOnComplete: QUEUE_CONFIG.JOB_OPTIONS.REMOVE_ON_COMPLETE,
              removeOnFail: QUEUE_CONFIG.JOB_OPTIONS.REMOVE_ON_FAIL,
          },
      }
    : undefined;

/**
 * Download queue instance
 * Used to add download jobs for processing
 */
export const downloadQueue: Queue<DownloadJobData> | null = redisConnection
    ? new Queue<DownloadJobData>(QUEUE_CONFIG.QUEUE_NAME, queueOptions)
    : null;

/**
 * Check if queue is available
 */
export const isQueueAvailable = (): boolean => downloadQueue !== null;

/**
 * Get Redis connection for worker
 * Worker needs its own connection instance
 */
export const getWorkerConnection = (): IORedis | null => {
    return createRedisConnection();
};
