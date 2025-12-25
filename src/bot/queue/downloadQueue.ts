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
 */
function createRedisConnection(): IORedis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.warn('[Queue] Redis credentials not found, queue will not be available');
        return null;
    }

    // Convert Upstash REST URL to Redis URL format
    // Upstash REST: https://xxx.upstash.io
    // Redis URL: rediss://default:token@xxx.upstash.io:6379
    const hostname = url.replace('https://', '').replace('http://', '');

    return new IORedis({
        host: hostname,
        port: 6379,
        password: token,
        tls: {
            rejectUnauthorized: false,
        },
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false,
    });
}

// Create Redis connection for BullMQ
const redisConnection = createRedisConnection();

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
