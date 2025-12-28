/**
 * Telegram Bot Main Entry
 * 
 * This module creates and exports the bot instance with all middleware and handlers.
 * Uses grammY webhookCallback for Next.js App Router integration.
 * 
 * @see https://grammy.dev/guide/deployment-types
 * @module bot
 */

import { Bot, session, webhookCallback, MemorySessionStorage, type StorageAdapter } from 'grammy';
import { NextRequest, NextResponse } from 'next/server';

import type { BotContext, SessionData } from './types';
import { redis } from '@/lib/database';
import { TELEGRAM_BOT_TOKEN, botConfigIsValid } from './config';
import { authMiddleware, rateLimitMiddleware, maintenanceMiddleware } from './middleware';
import { registerUrlHandler, registerCallbackHandler } from './handlers';
import { 
    startComposer, 
    helpComposer, 
    statusComposer, 
    historyComposer, 
    donateComposer,
    mystatusComposer,
    menuComposer,
    privacyComposer,
} from './commands';
import { adminComposer } from './commands/admin';
import { initWorker, closeWorker, isQueueAvailable, setBotApi } from './queue';
import { startMonitoring, stopMonitoring } from './utils/monitoring';

// ============================================================================
// Redis Session Storage Adapter
// ============================================================================

/**
 * Create Redis-backed session storage adapter
 * Falls back gracefully if Redis is unavailable
 */
function createRedisSessionStorage<T>(): StorageAdapter<T> {
    return {
        async read(key: string): Promise<T | undefined> {
            if (!redis) return undefined;
            try {
                const data = await redis.get(`bot:session:${key}`);
                return data ? (typeof data === 'string' ? JSON.parse(data) : data as T) : undefined;
            } catch {
                return undefined;
            }
        },
        async write(key: string, value: T): Promise<void> {
            if (!redis) return;
            try {
                await redis.set(`bot:session:${key}`, JSON.stringify(value), { ex: 3600 });
            } catch {}
        },
        async delete(key: string): Promise<void> {
            if (!redis) return;
            try {
                await redis.del(`bot:session:${key}`);
            } catch {}
        },
    };
}

// ============================================================================
// Bot Instance (Singleton)
// ============================================================================

let botInstance: Bot<BotContext> | null = null;
let botInitialized = false;

/**
 * Get or create the bot instance
 */
function getBotInstance(): Bot<BotContext> {
    if (!botInstance && TELEGRAM_BOT_TOKEN) {
        botInstance = new Bot<BotContext>(TELEGRAM_BOT_TOKEN);
        
        // 1. Filter stale messages FIRST (early exit - no DB queries)
        // Telegram retries webhooks, so we need generous threshold
        const STALE_THRESHOLD_SECONDS = 900; // 15 minutes - handles Telegram retries
        botInstance.use(async (ctx, next) => {
            const messageDate = ctx.message?.date || ctx.callbackQuery?.message?.date;
            
            if (messageDate) {
                const now = Math.floor(Date.now() / 1000);
                const age = now - messageDate;
                
                // For regular messages: ignore if too old
                if (ctx.message && age > STALE_THRESHOLD_SECONDS) {
                    console.log(`[Bot] Ignoring stale message (${age}s old) from user ${ctx.from?.id}`);
                    return; // Don't process stale messages
                }
                
                // For callbacks: allow older callbacks but give feedback if very old
                if (ctx.callbackQuery) {
                    const CALLBACK_STALE_THRESHOLD = 900; // 15 minutes
                    if (age > CALLBACK_STALE_THRESHOLD) {
                        console.log(`[Bot] Stale callback (${age}s old) from user ${ctx.from?.id}`);
                        await ctx.answerCallbackQuery({
                            text: '⏰ Tombol ini sudah kadaluarsa. Silakan kirim URL baru.',
                            show_alert: true
                        });
                        return;
                    }
                }
            }
            await next();
        });
        
        // 2. Setup session with TTL (1 hour) - Redis-backed with memory fallback
        botInstance.use(session({
            initial: (): SessionData => ({}),
            storage: redis ? createRedisSessionStorage<SessionData>() : new MemorySessionStorage<SessionData>(3600),
        }));
        
        // 3. Cleanup stale pendingDownload data
        botInstance.use(async (ctx, next) => {
            if (ctx.session?.pendingDownload) {
                const age = Date.now() - ctx.session.pendingDownload.timestamp;
                if (age > 5 * 60 * 1000) { // 5 minutes
                    ctx.session.pendingDownload = undefined;
                }
            }
            await next();
        });
        
        // 4. Setup middleware (order matters!)
        botInstance.use(maintenanceMiddleware); // Check maintenance (should be cached)
        botInstance.use(authMiddleware);
        botInstance.use(rateLimitMiddleware);
        
        // Register command composers
        botInstance.use(startComposer);
        botInstance.use(helpComposer);
        botInstance.use(statusComposer);
        botInstance.use(historyComposer);
        botInstance.use(donateComposer);  // Handles both /donate and /premium
        botInstance.use(mystatusComposer);
        botInstance.use(menuComposer);
        botInstance.use(privacyComposer);
        botInstance.use(adminComposer);
        
        // Register handlers
        registerUrlHandler(botInstance);
        registerCallbackHandler(botInstance);
        
        // Global error handler - prevents crashes
        botInstance.catch((err) => {
            console.error('[Bot] Error in middleware:', err);
        });
        
        console.log('[Bot] Instance created and ready');
    }
    
    return botInstance!;
}

/**
 * Initialize bot (call bot.init() to fetch bot info)
 * Should be called once before handling webhooks
 */
async function initBot(): Promise<void> {
    if (botInitialized) return;
    
    const bot = getBotInstance();
    if (bot) {
        try {
            await bot.init();
            botInitialized = true;
            
            // Set bot API for worker (dependency injection)
            setBotApi(bot.api);
            console.log('[Bot] Bot API set for worker');
            
            // Start monitoring (logs memory warnings, tracks metrics)
            startMonitoring(60000); // Check every minute
            
            // Initialize queue worker if Redis is available
            if (isQueueAvailable()) {
                console.log('[Bot] Queue available, initializing worker...');
                const workerStarted = await initWorker();
                if (workerStarted) {
                    console.log('[Bot] Queue worker started successfully');
                } else {
                    console.log('[Bot] Queue worker failed to start');
                }
            } else {
                console.log('[Bot] Queue not available, skipping worker init');
            }
        } catch (error) {
            console.error('[Bot] Failed to initialize:', error);
        }
    }
}

/** Export bot instance */
export const bot = getBotInstance();

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * Create webhook handler for Next.js App Router
 * 
 * Uses grammY's webhookCallback with 'std/http' adapter
 * Timeout set to 25 seconds (Vercel has 30s limit for serverless)
 */
export function botCreateWebhookHandler() {
    const botInst = getBotInstance();
    
    // Use std/http adapter for Next.js App Router
    // timeoutMilliseconds: 25000 (25s, under Vercel's 30s limit)
    // onTimeout: 'return' - return 200 to Telegram even if timeout
    const handleUpdate = webhookCallback(botInst, 'std/http', {
        timeoutMilliseconds: 25_000,
        onTimeout: 'return', // Don't throw, just return to prevent Telegram retry spam
    });
    
    return async (request: NextRequest): Promise<NextResponse> => {
        try {
            // Ensure bot is initialized
            await initBot();
            
            // Process the update
            const response = await handleUpdate(request);
            
            return new NextResponse(response.body, {
                status: response.status,
                headers: response.headers,
            });
        } catch (error) {
            console.error('[Bot] Webhook error:', error);
            // Always return 200 to Telegram to prevent retry spam
            return NextResponse.json({ ok: true });
        }
    };
}

// ============================================================================
// Re-exports
// ============================================================================

// Config
export { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, botConfigIsValid, botIsAdmin } from './config';

// Types
export type { 
    BotContext, 
    BotUser, 
    SessionData, 
    CallbackAction, 
    CallbackData,
    DownloadResult,
} from './types';

export { RATE_LIMITS, BOT_MESSAGES } from './types';

// Middleware
export { 
    authMiddleware, 
    rateLimitMiddleware,
    botUserGetOrCreate,
    botUserIsBanned,
    botUserIsVip,
    botRateLimitRecordDownload,
    botRateLimitNeedsReset,
    botRateLimitResetDaily,
    botRateLimitGetCooldown,
    botRateLimitSetCooldown,
    botRateLimitIncrementDownloads,
} from './middleware';

// Handlers
export { 
    registerUrlHandler, 
    registerCallbackHandler,
    botUrlExtract,
    botUrlCallScraper,
    botUrlGetPlatformName,
    botCallbackParse,
} from './handlers';

// Queue
export {
    initWorker,
    closeWorker,
    isQueueAvailable,
    downloadQueue,
    QUEUE_CONFIG,
    setBotApi,
    type DownloadJobData,
} from './queue';

// ============================================================================
// Graceful Shutdown Handlers
// ============================================================================

process.on('SIGTERM', async () => {
    console.log('[Bot] Received SIGTERM, shutting down gracefully...');
    stopMonitoring();
    await closeWorker();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[Bot] Received SIGINT, shutting down gracefully...');
    stopMonitoring();
    await closeWorker();
    process.exit(0);
});
