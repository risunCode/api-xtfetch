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
import { TELEGRAM_BOT_TOKEN } from './config';
import { authMiddleware, rateLimitMiddleware, maintenanceMiddleware } from './middleware';
import { registerUrlHandler, registerAllCallbacks } from './handlers';
import { 
    startComposer, 
    helpComposer, 
    statusComposer, 
    historyComposer, 
    donateComposer,
    menuComposer,
    stopComposer,
} from './commands';
import { adminComposer } from './commands/admin';
import { initWorker, closeWorker, isQueueAvailable, setBotApi } from './queue';
import { startMonitoring, stopMonitoring } from './utils/monitoring';
import { log } from './helpers';

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
        const STALE_THRESHOLD_SECONDS = 900; // 15 minutes
        botInstance.use(async (ctx, next) => {
            const messageDate = ctx.message?.date || ctx.callbackQuery?.message?.date;
            
            if (messageDate) {
                const now = Math.floor(Date.now() / 1000);
                const age = now - messageDate;
                
                if (ctx.message && age > STALE_THRESHOLD_SECONDS) {
                    log.debug(`Ignoring stale message (${age}s old) from user ${ctx.from?.id}`);
                    return;
                }
                
                if (ctx.callbackQuery && age > STALE_THRESHOLD_SECONDS) {
                    log.debug(`Stale callback (${age}s old) from user ${ctx.from?.id}`);
                    await ctx.answerCallbackQuery({
                        text: '⏰ Tombol ini sudah kadaluarsa. Silakan kirim URL baru.',
                        show_alert: true
                    });
                    return;
                }
            }
            await next();
        });
        
        // 2. Setup session with TTL (1 hour)
        botInstance.use(session({
            initial: (): SessionData => ({}),
            storage: redis ? createRedisSessionStorage<SessionData>() : new MemorySessionStorage<SessionData>(3600),
        }));
        
        // 3. Cleanup stale session data
        botInstance.use(async (ctx, next) => {
            const SESSION_TTL = 5 * 60 * 1000; // 5 minutes
            if (ctx.session?.pendingDownload && Date.now() - ctx.session.pendingDownload.timestamp > SESSION_TTL) {
                ctx.session.pendingDownload = undefined;
            }
            if (ctx.session?.pendingStories && Date.now() - ctx.session.pendingStories.timestamp > SESSION_TTL) {
                ctx.session.pendingStories = undefined;
            }
            if (ctx.session?.pendingYouTube && Date.now() - ctx.session.pendingYouTube.timestamp > SESSION_TTL) {
                ctx.session.pendingYouTube = undefined;
            }
            await next();
        });
        
        // 4. Setup middleware (order matters!)
        botInstance.use(maintenanceMiddleware);
        botInstance.use(authMiddleware);
        botInstance.use(rateLimitMiddleware);
        
        // 5. Register command composers
        botInstance.use(startComposer);
        botInstance.use(helpComposer);
        botInstance.use(statusComposer);
        botInstance.use(historyComposer);
        botInstance.use(donateComposer);
        botInstance.use(menuComposer);
        botInstance.use(stopComposer);
        botInstance.use(adminComposer);
        
        // 6. Register handlers
        registerUrlHandler(botInstance);
        registerAllCallbacks(botInstance);
        
        // Global error handler
        botInstance.catch((err) => {
            console.error('[Bot] Error in middleware:', err);
        });
        
        log.info('Bot instance created and ready');
    }
    
    return botInstance!;
}

/**
 * Initialize bot (call bot.init() to fetch bot info)
 */
async function initBot(): Promise<void> {
    if (botInitialized) return;
    
    const bot = getBotInstance();
    if (bot) {
        try {
            await bot.init();
            botInitialized = true;
            
            setBotApi(bot.api);
            log.debug('Bot API set for worker');
            
            startMonitoring(60000);
            
            if (isQueueAvailable()) {
                log.info('Queue available, initializing worker...');
                const workerStarted = await initWorker();
                log.info(`Queue worker ${workerStarted ? 'started' : 'failed'}`);
            }
        } catch (error) {
            log.error('Failed to initialize', error);
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
 */
export function botCreateWebhookHandler() {
    const botInst = getBotInstance();
    
    const handleUpdate = webhookCallback(botInst, 'std/http', {
        timeoutMilliseconds: 25_000,
        onTimeout: 'return',
    });
    
    return async (request: NextRequest): Promise<NextResponse> => {
        try {
            await initBot();
            const response = await handleUpdate(request);
            
            return new NextResponse(response.body, {
                status: response.status,
                headers: response.headers,
            });
        } catch (error) {
            console.error('[Bot] Webhook error:', error);
            return NextResponse.json({ ok: true });
        }
    };
}

// ============================================================================
// Re-exports
// ============================================================================

// Config
export { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, botIsAdmin, botConfigIsValid } from './config';

// Types
export type { 
    BotContext, 
    BotUser, 
    SessionData, 
    CallbackAction, 
    CallbackData,
    DownloadResult,
} from './types';

export { RATE_LIMITS, BOT_MESSAGES, UserTier, getUserTier } from './types';

// Middleware
export { 
    authMiddleware, 
    rateLimitMiddleware,
    maintenanceMiddleware,
    botUserGetOrCreate,
    botUserIsBanned,
    botUserIsVip,
    botRateLimitRecordDownload,
    botRateLimitGetCooldown,
    botRateLimitSetCooldown,
    botIsInMaintenance,
    botGetMaintenanceMessage,
} from './middleware';

// Handlers
export { 
    registerUrlHandler, 
    registerAllCallbacks,
    botUrlExtract,
    botUrlCallScraper,
    botUrlGetPlatformName,
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
// Graceful Shutdown
// ============================================================================

process.on('SIGTERM', async () => {
    log.info('Received SIGTERM, shutting down...');
    stopMonitoring();
    await closeWorker();
    process.exit(0);
});

process.on('SIGINT', async () => {
    log.info('Received SIGINT, shutting down...');
    stopMonitoring();
    await closeWorker();
    process.exit(0);
});
