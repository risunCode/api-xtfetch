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
import { 
    serviceConfigIsMaintenanceMode, 
    serviceConfigGetMaintenanceMessage,
    serviceConfigGetMaintenanceType,
} from '@/lib/config';
import { redis } from '@/lib/database';
import { botIsAdmin } from '../config';

// ============================================================================
// Maintenance Middleware
// ============================================================================

/**
 * Middleware to check maintenance mode
 * Blocks all bot operations during full maintenance (except for admins)
 */
export const maintenanceMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
    const isMaintenanceMode = serviceConfigIsMaintenanceMode();
    const maintenanceType = serviceConfigGetMaintenanceType();
    
    // Only block on full maintenance (not API-only)
    if (isMaintenanceMode && maintenanceType === 'full') {
        // Allow admins to bypass maintenance mode
        const userId = ctx.from?.id;
        if (userId && botIsAdmin(userId)) {
            // Admin bypass - continue normally
            await next();
            return;
        }
        
        // Get custom message or use default
        const customMessage = serviceConfigGetMaintenanceMessage();
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
 * Check if bot should be in maintenance mode
 */
export function botIsInMaintenance(): boolean {
    const isMaintenanceMode = serviceConfigIsMaintenanceMode();
    const maintenanceType = serviceConfigGetMaintenanceType();
    return isMaintenanceMode && maintenanceType === 'full';
}

/**
 * Get maintenance message for bot
 */
export function botGetMaintenanceMessage(): string {
    return serviceConfigGetMaintenanceMessage() || 
        '🔧 DownAria is currently under maintenance. Please try again later.';
}

// ============================================================================
// Global Maintenance Check (Redis)
// ============================================================================

/**
 * Check if global maintenance mode is enabled (from Redis)
 * This syncs with frontend's maintenance status
 */
export async function botIsGlobalMaintenance(): Promise<boolean> {
    if (!redis) return false;
    try {
        const value = await redis.get('global:maintenance');
        return value === 'true' || value === '1';
    } catch {
        return false;
    }
}
