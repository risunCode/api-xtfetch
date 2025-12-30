/**
 * Bot Download Queue Worker
 * 
 * Processes download jobs from the BullMQ queue.
 * Handles scraping, sending media, and error handling.
 * Uses unified media sending utility for consistency.
 * 
 * @module bot/queue/worker
 */

import { Worker, Job } from 'bullmq';
import type { Api } from 'grammy';

import { QUEUE_CONFIG } from './config';
import type { DownloadJobData } from './index';
import { sendMedia } from '../utils/media';
import { recordDownloadSuccess, recordDownloadFailure } from '../utils/monitoring';
import { botDownloadCreate, botDownloadUpdateStatus } from '../services/downloadService';
import { serviceConfigLoad, serviceConfigIsPlatformEnabled, serviceConfigIsMaintenanceMode, serviceConfigGetMaintenanceType } from '@/lib/config';
import { log } from '../helpers';

// ============================================================================
// BOT INSTANCE ACCESS (Dependency Injection)
// ============================================================================

let botApiInstance: Api | null = null;

/**
 * Set the bot API instance for dependency injection
 * Call this during bot initialization to avoid circular dependencies
 */
export function setBotApi(api: Api): void {
    botApiInstance = api;
}

/**
 * Get bot instance - uses injected instance or falls back to dynamic import
 * The bot is initialized in src/bot/index.ts
 */
async function getBotApi(): Promise<Api> {
    if (botApiInstance) {
        return botApiInstance;
    }
    // Fallback to dynamic import if not set
    const { bot } = await import('../index');
    if (!bot?.api) {
        throw new Error('Bot API not available');
    }
    return bot.api;
}

/**
 * Get scraper function dynamically
 */
async function getScraperFunction() {
    const { botUrlCallScraper } = await import('../handlers/url');
    return botUrlCallScraper;
}

/**
 * Get rate limit record function dynamically
 */
async function getRateLimitFunction() {
    const { botRateLimitSetCooldown, botRateLimitRecordDownloadById } = await import('../middleware');
    return { botRateLimitSetCooldown, botRateLimitRecordDownloadById };
}

// ============================================================================
// JOB PROCESSOR
// ============================================================================

/**
 * Process a download job
 */
async function processDownloadJob(job: Job<DownloadJobData>): Promise<void> {
    const { chatId, userId, messageId, processingMsgId, url, isPremium, platform, botUserId } = job.data;
    const startTime = Date.now();

    log.worker(`Processing job ${job.id} for user ${userId}`);

    const api = await getBotApi();
    if (!api) {
        throw new Error('Bot API not available');
    }

    // Check maintenance mode and platform status before processing
    await serviceConfigLoad(true);
    const isMaintenanceMode = serviceConfigIsMaintenanceMode();
    const maintenanceType = serviceConfigGetMaintenanceType();
    
    // Block if full maintenance
    if (isMaintenanceMode && (maintenanceType === 'full' || maintenanceType === 'all')) {
        await api.editMessageText(chatId, processingMsgId, '🔧 Service is under maintenance. Please try again later.').catch(() => {});
        return;
    }
    
    // Check if platform is enabled
    if (platform && !serviceConfigIsPlatformEnabled(platform as any)) {
        await api.editMessageText(chatId, processingMsgId, `🚫 ${platform} is currently unavailable. Please try again later.`).catch(() => {});
        return;
    }

    // Create download record in database for history tracking
    let downloadId: string | null = null;
    if (botUserId && platform) {
        const { data: downloadRecord } = await botDownloadCreate(
            botUserId,
            platform as any, // Platform type from job data
            url,
            null, // title will be updated after scraping
            'processing',
            isPremium
        );
        downloadId = downloadRecord?.id || null;
    }

    try {
        // Get scraper function
        const botUrlCallScraper = await getScraperFunction();
        
        // Call scraper
        const result = await botUrlCallScraper(url, isPremium);

        if (result.success && result.formats?.length) {
            // Update download record with title
            if (downloadId && result.title) {
                await botDownloadUpdateStatus(downloadId, 'completed');
            }

            // Use unified media sending utility
            const sendResult = await sendMedia({
                api,
                chatId,
                result,
                originalUrl: url,
                processingMsgId,
                lang: 'en',
            });

            if (sendResult.success) {
                // Delete user's original message (clean chat)
                await api.deleteMessage(chatId, messageId).catch(() => {
                    // Ignore deletion errors
                });

                // Record download for rate limiting
                const { botRateLimitRecordDownloadById } = await getRateLimitFunction();
                
                // Record download (sets cooldown and increments count)
                await botRateLimitRecordDownloadById(userId, isPremium);

                // Record metrics
                const processingTime = Date.now() - startTime;
                recordDownloadSuccess(processingTime);

                log.worker(`Job ${job.id} completed in ${processingTime}ms`);
            } else {
                // Failed to send media - update status to failed
                if (downloadId) {
                    await botDownloadUpdateStatus(downloadId, 'failed', sendResult.error || 'Failed to send media');
                }
                recordDownloadFailure();
                
                await api.editMessageText(
                    chatId,
                    processingMsgId,
                    `❌ ${sendResult.error || 'Failed to send media. Please try again.'}`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔄 Retry', callback_data: 'retry_download' },
                            ]],
                        },
                    }
                ).catch(() => {});
            }
        } else {
            // Scraper failed - update status to failed
            if (downloadId) {
                await botDownloadUpdateStatus(downloadId, 'failed', result.error || 'Download failed');
            }
            recordDownloadFailure();
            const errorMessage = result.error || 'Download failed';
            
            await api.editMessageText(
                chatId,
                processingMsgId,
                `❌ ${errorMessage}`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔄 Retry', callback_data: 'retry_download' },
                        ]],
                    },
                }
            ).catch(() => {});

            log.error(`Job ${job.id} failed: ${errorMessage}`);
        }
    } catch (error) {
        log.error('Job error:', error);
        
        // Update download status to failed
        if (downloadId) {
            await botDownloadUpdateStatus(downloadId, 'failed', error instanceof Error ? error.message : 'Unknown error');
        }
        recordDownloadFailure();

        // Try to notify user of failure
        await api.editMessageText(
            chatId,
            processingMsgId,
            '❌ Download failed. Please try again.',
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔄 Retry', callback_data: 'retry_download' },
                    ]],
                },
            }
        ).catch(() => {});

        // Re-throw for retry mechanism
        throw error;
    }
}

// ============================================================================
// WORKER INSTANCE
// ============================================================================

let downloadWorker: Worker<DownloadJobData> | null = null;

/**
 * Initialize the download worker
 */
export async function initWorker(): Promise<boolean> {
    if (downloadWorker) {
        log.worker('Worker already initialized');
        return true;
    }

    log.info('Initializing worker...');
    
    // Worker needs its own Redis connection (BullMQ requirement)
    const { getWorkerConnection } = await import('./downloadQueue');
    const connection = getWorkerConnection();
    
    if (!connection) {
        log.info('Redis not configured - worker disabled');
        return false;
    }

    // Wait for Redis connection to be ready
    try {
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 10000);
            
            if (connection.status === 'ready') {
                clearTimeout(timeout);
                resolve();
                return;
            }
            
            connection.once('ready', () => {
                clearTimeout(timeout);
                log.worker('Redis connection ready');
                resolve();
            });
            
            connection.once('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    } catch (error) {
        log.error('Redis connection failed:', error);
        return false;
    }

    try {
        downloadWorker = new Worker<DownloadJobData>(
            QUEUE_CONFIG.QUEUE_NAME,
            processDownloadJob,
            {
                connection,
                concurrency: QUEUE_CONFIG.CONCURRENCY,
                limiter: {
                    max: QUEUE_CONFIG.RATE_LIMIT.MAX_JOBS,
                    duration: QUEUE_CONFIG.RATE_LIMIT.DURATION_MS,
                },
            }
        );

        // Worker event handlers
        downloadWorker.on('completed', (job) => {
            log.worker(`✅ Job ${job.id} completed`);
        });

        downloadWorker.on('failed', (job, err) => {
            log.worker(`❌ Job ${job?.id} failed: ${err.message}`);
        });

        downloadWorker.on('error', (err) => {
            log.error(`Worker error: ${err.message}`);
        });
        
        downloadWorker.on('active', (job) => {
            log.worker(`🔄 Processing job ${job.id} for user ${job.data.userId}...`);
        });
        
        downloadWorker.on('ready', () => {
            log.info('Worker is ready and listening for jobs');
        });

        log.info(`Worker initialized with concurrency ${QUEUE_CONFIG.CONCURRENCY}`);
        return true;
    } catch (error) {
        log.error('Worker init failed:', error);
        return false;
    }
}

/**
 * Close the worker gracefully
 */
export async function closeWorker(): Promise<void> {
    if (downloadWorker) {
        await downloadWorker.close();
        downloadWorker = null;
        log.info('Worker closed');
    }
}

/**
 * Graceful shutdown handler
 * Pauses worker, waits for active jobs, then closes
 */
export async function gracefulShutdown(): Promise<void> {
    log.info('Graceful shutdown initiated...');
    
    if (downloadWorker) {
        // Stop accepting new jobs
        await downloadWorker.pause();
        
        // Wait for active jobs (max 30s)
        const timeout = setTimeout(() => {
            log.info('Shutdown timeout, forcing close');
        }, 30000);
        
        await downloadWorker.close();
        clearTimeout(timeout);
        
        downloadWorker = null;
    }
    
    log.info('Worker shutdown complete');
}

// ============================================================================
// EXPORTS
// ============================================================================

export { downloadWorker };
