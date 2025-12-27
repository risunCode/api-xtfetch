/**
 * Bot Download Queue Worker
 * 
 * Processes download jobs from the BullMQ queue.
 * Handles scraping, sending media, and error handling.
 * 
 * @module bot/queue/worker
 */

import { Worker, Job } from 'bullmq';
import { InputFile, InlineKeyboard } from 'grammy';

import { logger } from '@/lib/services/shared/logger';
import { optimizeCdnUrl } from '@/lib/services/facebook/cdn';
import { QUEUE_CONFIG, getRedisConnection } from './config';
import type { DownloadJobData } from './index';
import type { DownloadResult } from '../types';

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
// MEDIA SENDING HELPERS
// ============================================================================

const MAX_FILE_SIZE = 40 * 1024 * 1024; // 40MB Telegram limit

/**
 * Optimize URL for faster download (redirect US/EU CDN to Jakarta for Facebook)
 */
function optimizeMediaUrl(url: string): string {
    if (url.includes('fbcdn.net')) {
        return optimizeCdnUrl(url);
    }
    return url;
}

/**
 * Build minimal caption for media
 */
function buildMinimalCaption(result: DownloadResult): string {
    let caption = '';
    
    if (result.author) {
        caption = result.author;
    }
    
    if (result.title) {
        const shortTitle = result.title.substring(0, 20);
        caption += caption ? `\n${shortTitle}${result.title.length > 20 ? '...' : ''}` : shortTitle;
    }
    
    return caption;
}

/**
 * Build inline keyboard for media
 */
function buildMediaKeyboard(originalUrl: string, hdUrl?: string): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    
    if (hdUrl) {
        keyboard.url('🎬 HD Quality', hdUrl);
    }
    
    keyboard.url('🔗 Origin URL', originalUrl);
    
    return keyboard;
}

/**
 * Send media result to chat
 * Standalone version for worker (doesn't need ctx)
 * Supports multi-item (carousel/stories) by sending all items
 */
async function workerSendMedia(
    chatId: number,
    result: DownloadResult,
    originalUrl: string
): Promise<boolean> {
    if (!result.success || !result.formats || result.formats.length === 0) {
        return false;
    }

    const api = await getBotApi();
    if (!api) {
        logger.error('telegram', 'Bot API not available', 'WORKER_SEND_MEDIA');
        return false;
    }

    const caption = buildMinimalCaption(result);

    // Group formats by itemId for multi-item support
    const groupedItems: Record<string, typeof result.formats> = {};
    for (const format of result.formats) {
        const itemId = format.itemId || 'main';
        if (!groupedItems[itemId]) groupedItems[itemId] = [];
        groupedItems[itemId].push(format);
    }

    const itemIds = Object.keys(groupedItems);
    const isMultiItem = itemIds.length > 1;

    // For multi-item (carousel/stories), send each item
    if (isMultiItem) {
        let sentCount = 0;
        const keyboard = buildMediaKeyboard(originalUrl);

        for (let i = 0; i < itemIds.length; i++) {
            const itemId = itemIds[i];
            const itemFormats = groupedItems[itemId];
            
            // Find best format for this item (prefer HD video, then SD, then image)
            const videoFormats = itemFormats.filter(f => f.type === 'video');
            const imageFormats = itemFormats.filter(f => f.type === 'image');
            
            const hdVideo = videoFormats.find(f => 
                f.quality.toLowerCase().includes('hd') || 
                f.quality.includes('1080') || 
                f.quality.includes('720')
            ) || videoFormats[0];
            
            const sdVideo = videoFormats.find(f => 
                f.quality.toLowerCase().includes('sd') || 
                f.quality.includes('480') || 
                f.quality.includes('360')
            );

            let formatToSend = hdVideo || imageFormats[0];
            let sendAsLink = false;

            // Check if video is too large, fallback to SD
            if (formatToSend?.type === 'video' && formatToSend.filesize && formatToSend.filesize > MAX_FILE_SIZE) {
                if (sdVideo && (!sdVideo.filesize || sdVideo.filesize <= MAX_FILE_SIZE)) {
                    formatToSend = sdVideo;
                } else {
                    // Both HD and SD too large - send as direct link
                    sendAsLink = true;
                }
            }

            if (!formatToSend) continue;

            // Build caption: only first item gets full caption, others get index
            const itemCaption = i === 0 ? caption : `${i + 1}/${itemIds.length}`;

            try {
                if (sendAsLink) {
                    // Send direct link with play button (optimize URL for direct access)
                    const optimizedUrl = optimizeMediaUrl(formatToSend.url);
                    const linkKeyboard = new InlineKeyboard()
                        .url('▶️ Play Video', optimizedUrl)
                        .url('🔗 Original', originalUrl);
                    
                    await api.sendMessage(chatId, `📥 ${itemCaption}\n\nVideo too large, tap to play:`, {
                        reply_markup: linkKeyboard,
                        link_preview_options: { is_disabled: true },
                    });
                } else if (formatToSend.type === 'video') {
                    const optimizedUrl = optimizeMediaUrl(formatToSend.url);
                    await api.sendVideo(chatId, new InputFile({ url: optimizedUrl }), {
                        caption: itemCaption,
                        reply_markup: i === 0 ? keyboard : undefined,
                    });
                } else {
                    const optimizedUrl = optimizeMediaUrl(formatToSend.url);
                    await api.sendPhoto(chatId, new InputFile({ url: optimizedUrl }), {
                        caption: itemCaption,
                        reply_markup: i === 0 ? keyboard : undefined,
                    });
                }
                sentCount++;
                
                // Small delay between sends to avoid rate limiting
                if (i < itemIds.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (error) {
                logger.warn('telegram', `Failed to send item ${i + 1}: ${error}`);
                
                // If send failed, try sending as direct link
                if (!sendAsLink && formatToSend.type === 'video') {
                    try {
                        const optimizedUrl = optimizeMediaUrl(formatToSend.url);
                        const linkKeyboard = new InlineKeyboard()
                            .url('▶️ Play Video', optimizedUrl)
                            .url('🔗 Original', originalUrl);
                        
                        await api.sendMessage(chatId, `📥 ${itemCaption}\n\nTap to play:`, {
                            reply_markup: linkKeyboard,
                            link_preview_options: { is_disabled: true },
                        });
                        sentCount++;
                    } catch {
                        // Ignore secondary failure
                    }
                }
            }
        }

        return sentCount > 0;
    }

    // Single item - original logic
    const videoFormats = result.formats.filter(f => f.type === 'video');
    const imageFormats = result.formats.filter(f => f.type === 'image');
    
    const hdVideo = videoFormats.find(f => 
        f.quality.toLowerCase().includes('hd') || 
        f.quality.includes('1080') || 
        f.quality.includes('720')
    ) || videoFormats[0];
    
    const sdVideo = videoFormats.find(f => 
        f.quality.toLowerCase().includes('sd') || 
        f.quality.includes('480') || 
        f.quality.includes('360')
    ) || (videoFormats.length > 1 ? videoFormats[videoFormats.length - 1] : null);

    const imageFormat = imageFormats[0];

    let formatToSend = hdVideo || imageFormat;
    let hdUrl: string | undefined;

    // Check if video is too large (>40MB)
    if (formatToSend?.type === 'video' && formatToSend.filesize && formatToSend.filesize > MAX_FILE_SIZE) {
        if (sdVideo && sdVideo !== hdVideo && (!sdVideo.filesize || sdVideo.filesize <= MAX_FILE_SIZE)) {
            hdUrl = optimizeMediaUrl(formatToSend.url);
            formatToSend = sdVideo;
        } else {
            const optimizedUrl = optimizeMediaUrl(formatToSend.url);
            const keyboard = buildMediaKeyboard(originalUrl, optimizedUrl);
            try {
                await api.sendMessage(
                    chatId,
                    `📥 *Video too large for Telegram*\n\n${caption}\n\nUse the buttons below to download:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard,
                        link_preview_options: { is_disabled: true },
                    }
                );
                return true;
            } catch {
                return false;
            }
        }
    }

    if (!formatToSend) {
        return false;
    }

    const keyboard = buildMediaKeyboard(originalUrl, hdUrl);

    try {
        const optimizedUrl = optimizeMediaUrl(formatToSend.url);
        if (formatToSend.type === 'video') {
            await api.sendVideo(chatId, new InputFile({ url: optimizedUrl }), {
                caption,
                reply_markup: keyboard,
            });
        } else {
            await api.sendPhoto(chatId, new InputFile({ url: optimizedUrl }), {
                caption,
                reply_markup: keyboard,
            });
        }
        return true;
    } catch (error) {
        logger.error('telegram', error, 'WORKER_SEND_MEDIA');
        
        try {
            const optimizedUrl = optimizeMediaUrl(formatToSend.url);
            await api.sendMessage(
                chatId,
                `📥 Download link:\n\n${caption}\n\n${optimizedUrl}`,
                {
                    reply_markup: keyboard,
                    link_preview_options: { is_disabled: true },
                }
            );
            return true;
        } catch {
            return false;
        }
    }
}

// ============================================================================
// JOB PROCESSOR
// ============================================================================

/**
 * Process a download job
 */
async function processDownloadJob(job: Job<DownloadJobData>): Promise<void> {
    const { chatId, userId, messageId, processingMsgId, url, isPremium } = job.data;

    logger.debug('telegram', `Processing job ${job.id} for user ${userId}`);

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
            // Delete processing message
            await api.deleteMessage(chatId, processingMsgId).catch(() => {
                // Ignore deletion errors
            });

            // Send media
            const sent = await workerSendMedia(chatId, result, url);

            if (sent) {
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

                logger.debug('telegram', `Job ${job.id} completed successfully`);
            } else {
                // Failed to send media - edit processing message to error
                await api.editMessageText(
                    chatId,
                    processingMsgId,
                    '❌ Failed to send media. Please try again.',
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

            logger.debug('telegram', `Job ${job.id} failed: ${errorMessage}`);
        }
    } catch (error) {
        logger.error('telegram', error, 'QUEUE_WORKER');

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
        logger.debug('telegram', 'Worker already initialized');
        return true;
    }

    const connection = getRedisConnection();
    if (!connection) {
        logger.warn('telegram', 'Redis not configured - worker disabled');
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
            logger.debug('telegram', `Worker completed job ${job.id}`);
        });

        downloadWorker.on('failed', (job, err) => {
            logger.error('telegram', `Worker job ${job?.id} failed: ${err.message}`, 'WORKER_FAILED');
        });

        downloadWorker.on('error', (err) => {
            logger.error('telegram', err, 'WORKER_ERROR');
        });

        logger.debug('telegram', `Download worker initialized with concurrency ${QUEUE_CONFIG.CONCURRENCY}`);
        return true;
    } catch (error) {
        logger.error('telegram', error, 'WORKER_INIT');
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
        logger.debug('telegram', 'Download worker closed');
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { downloadWorker };
