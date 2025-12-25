/**
 * Telegram Bot Main Entry
 * 
 * This module creates and exports the bot instance with all middleware and handlers.
 * Uses grammY webhookCallback for Next.js App Router integration.
 * 
 * @see https://grammy.dev/guide/deployment-types
 * @module bot
 */

import { Bot, session, webhookCallback } from 'grammy';
import { NextRequest, NextResponse } from 'next/server';

import type { BotContext, SessionData } from './types';
import { TELEGRAM_BOT_TOKEN, botConfigIsValid } from './config';
import { authMiddleware, rateLimitMiddleware, maintenanceMiddleware } from './middleware';
import { registerUrlHandler, registerCallbackHandler } from './handlers';
import { 
    startComposer, 
    helpComposer, 
    statusComposer, 
    historyComposer, 
    premiumComposer,
    mystatusComposer,
} from './commands';
import { adminComposer } from './commands/admin';

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
        
        // Setup session
        botInstance.use(session({
            initial: (): SessionData => ({})
        }));
        
        // Setup middleware (order matters!)
        botInstance.use(maintenanceMiddleware); // Check maintenance first
        botInstance.use(authMiddleware);
        botInstance.use(rateLimitMiddleware);
        
        // Register command composers
        botInstance.use(startComposer);
        botInstance.use(helpComposer);
        botInstance.use(statusComposer);
        botInstance.use(historyComposer);
        botInstance.use(premiumComposer);
        botInstance.use(mystatusComposer);
        botInstance.use(adminComposer);
        
        // Register handlers
        registerUrlHandler(botInstance);
        registerCallbackHandler(botInstance);
        
        // Global error handler - prevents crashes
        botInstance.catch((err) => {
            console.error('[Bot] Error in middleware:', err);
        });
        
        console.log('[Bot] Instance created and configured');
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
            console.log('[Bot] Initialized:', bot.botInfo.username);
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
            console.log('[Bot] Initializing...');
            await initBot();
            console.log('[Bot] Init done, processing update...');
            
            // Process the update
            const response = await handleUpdate(request);
            console.log('[Bot] Update processed, status:', response.status);
            
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
    botUserIsPremium,
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
    botUrlGetPlatformEmoji,
    botUrlGetPlatformName,
    botCallbackParse,
} from './handlers';
