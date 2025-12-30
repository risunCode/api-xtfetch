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
    /** Platform ID for history tracking */
    platform?: string;
    /** Bot user ID (Telegram ID) for history tracking */
    botUserId?: number;
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
 * Maximum queue depth before rejecting new jobs
 */
const MAX_QUEUE_DEPTH = QUEUE_CONFIG.MAX_QUEUE_DEPTH;

/**
 * Add a job to the queue with backpressure handling
 * Rejects new jobs if queue depth exceeds MAX_QUEUE_DEPTH
 */
export async function addJobWithBackpressure(
    data: DownloadJobData,
    options?: { priority?: number }
): Promise<{ success: boolean; error?: string }> {
    if (!downloadQueue) {
        return { success: false, error: 'Queue not available' };
    }
    
    try {
        const queueDepth = await downloadQueue.count();
        
        if (queueDepth >= MAX_QUEUE_DEPTH) {
            return { 
                success: false, 
                error: 'Server sibuk. Coba lagi dalam beberapa menit.' 
            };
        }
        
        await downloadQueue.add('download', data, {
            priority: options?.priority ?? 10,
        });
        
        return { success: true };
    } catch (error) {
        return { 
            success: false, 
            error: 'Gagal menambahkan ke antrian.' 
        };
    }
}

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

export { MAX_QUEUE_DEPTH };
