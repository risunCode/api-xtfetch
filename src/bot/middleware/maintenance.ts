/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT MIDDLEWARE - Maintenance Mode
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Checks if system is in maintenance mode and blocks bot usage accordingly.
 * Admins can still use all commands during maintenance.
 * 
 * @module bot/middleware/maintenance
 */

import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '../types';
import { serviceConfigLoad, serviceConfigGet } from '@/lib/config';
import { botIsAdmin } from '../config';

// ============================================================================
// Maintenance Middleware
// ============================================================================

/**
 * Middleware to check maintenance mode
 * Blocks all bot operations during full maintenance (except for admins)
 * 
 * NOTE: Fetches fresh config from DB on each request to ensure sync with admin console
 */
export const maintenanceMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
    // Force refresh config from DB
    await serviceConfigLoad(true);
    const config = serviceConfigGet();
    
    const isMaintenanceMode = config.maintenanceMode === true;
    const maintenanceType = String(config.maintenanceType || 'off');
    
    // Debug log (only in development)
    if (process.env.NODE_ENV !== 'production') {
        console.log('[Bot Maintenance] Check:', { isMaintenanceMode, maintenanceType });
    }
    
    // Block on full maintenance or 'all' (not API-only)
    // maintenanceType values: 'off', 'api', 'full', 'all'
    const shouldBlock = isMaintenanceMode && (maintenanceType === 'full' || maintenanceType === 'all');
    
    if (shouldBlock) {
        // Allow admins to bypass maintenance mode
        const userId = ctx.from?.id;
        if (userId && botIsAdmin(userId)) {
            // Admin bypass - continue normally
            await next();
            return;
        }
        
        // Get custom message or use default
        const customMessage = config.maintenanceMessage;
        const lang = ctx.from?.language_code?.startsWith('id') ? 'id' : 'en';
        
        const message = lang === 'id'
            ? `🔧 *Sedang Maintenance*\n\n` +
              `${customMessage || 'Layanan sedang dalam pemeliharaan.'}\n\n` +
              `Silakan coba lagi nanti. Terima kasih atas kesabarannya! 🙏`
            : `🔧 *Under Maintenance*\n\n` +
              `${customMessage || 'Service is currently under maintenance.'}\n\n` +
              `Please try again later. Thanks for your patience! 🙏`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        return; // Don't proceed to next middleware
    }
    
    await next();
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if bot should be in maintenance mode (async - fetches from DB)
 */
export async function botIsInMaintenance(): Promise<boolean> {
    await serviceConfigLoad(true);
    const config = serviceConfigGet();
    const isMaintenanceMode = config.maintenanceMode === true;
    const maintenanceType = config.maintenanceType;
    return isMaintenanceMode && (maintenanceType === 'full' || maintenanceType === 'all');
}

/**
 * Get maintenance message for bot
 */
export async function botGetMaintenanceMessage(): Promise<string> {
    await serviceConfigLoad(true);
    const config = serviceConfigGet();
    return config.maintenanceMessage || 
        '🔧 DownAria is currently under maintenance. Please try again later.';
}
