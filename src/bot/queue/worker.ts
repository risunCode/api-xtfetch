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

import { QUEUE_CONFIG } from './config';
import type { DownloadJobData } from './index';
import { sendMedia } from '../utils/media';
import { recordDownloadSuccess, recordDownloadFailure } from '../utils/monitoring';

// ============================================================================
// BOT INSTANCE ACCESS
// ============================================================================

/**
 * Get bot instance dynamically to avoid circular dependency
 * The bot is initialized in src/bot/index.ts
 */
async function getBotApi() {
    // Dynamic import to avoid circular dependency
    const { bot } = await import('../index');
    return bot?.api;
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
    const { botRateLimitSetCooldown, botRateLimitIncrementDownloads } = await import('../middleware/rateLimit');
    return { botRateLimitSetCooldown, botRateLimitIncrementDownloads };
}

// ============================================================================
// JOB PROCESSOR
// ============================================================================

/**
 * Process a download job
 */
async function processDownloadJob(job: Job<DownloadJobData>): Promise<void> {
    const { chatId, userId, messageId, processingMsgId, url, isPremium } = job.data;
    const startTime = Date.now();

    console.log(`[Bot.Worker] Processing job ${job.id} for user ${userId}`);

    const api = await getBotApi();
    if (!api) {
        throw new Error('Bot API not available');
    }

    try {
        // Get scraper function
        const botUrlCallScraper = await getScraperFunction();
        
        // Call scraper
        const result = await botUrlCallScraper(url, isPremium);

        if (result.success && result.formats?.length) {
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
                const { botRateLimitSetCooldown, botRateLimitIncrementDownloads } = await getRateLimitFunction();
                
                // Set cooldown for non-premium users
                if (!isPremium) {
                    const { RATE_LIMITS } = await import('../types');
                    await botRateLimitSetCooldown(userId, RATE_LIMITS.FREE_COOLDOWN_SECONDS);
                }
                
                // Increment download count
                await botRateLimitIncrementDownloads(userId);

                // Record metrics
                const processingTime = Date.now() - startTime;
                recordDownloadSuccess(processingTime);

                console.log(`[Bot.Worker] Job ${job.id} completed in ${processingTime}ms`);
            } else {
                // Failed to send media - edit processing message to error
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
            // Scraper failed - edit processing message to show error
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

            console.log(`[Bot.Worker] Job ${job.id} failed: ${errorMessage}`);
        }
    } catch (error) {
        console.error('[Bot.Worker] Job error:', error);
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
        return true;
    }

    console.log('[Bot.Worker] Initializing worker...');
    
    // Worker needs its own Redis connection (BullMQ requirement)
    const { getWorkerConnection } = await import('./downloadQueue');
    const connection = getWorkerConnection();
    
    if (!connection) {
        console.log('[Bot.Worker] Redis not configured - worker disabled');
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
            console.log(`[Bot.Worker] Job ${job.id} completed`);
        });

        downloadWorker.on('failed', (job, err) => {
            console.log(`[Bot.Worker] Job ${job?.id} failed: ${err.message}`);
        });

        downloadWorker.on('error', (err) => {
            console.log(`[Bot.Worker] Error: ${err.message}`);
        });
        
        downloadWorker.on('active', (job) => {
            console.log(`[Bot.Worker] Processing job ${job.id}...`);
        });

        console.log(`[Bot.Worker] Worker initialized with concurrency ${QUEUE_CONFIG.CONCURRENCY}`);
        return true;
    } catch (error) {
        console.error('[Bot.Worker] Init failed:', error);
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
        console.log('[Bot.Worker] Worker closed');
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { downloadWorker };
