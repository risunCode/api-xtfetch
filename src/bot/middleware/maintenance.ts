/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT MIDDLEWARE - Maintenance Mode
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Checks if system is in maintenance mode and blocks bot usage accordingly.
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

// ============================================================================
// Maintenance Middleware
// ============================================================================

/**
 * Middleware to check maintenance mode
 * Blocks all bot operations during full maintenance
 */
export const maintenanceMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
    const isMaintenanceMode = serviceConfigIsMaintenanceMode();
    const maintenanceType = serviceConfigGetMaintenanceType();
    
    // Only block on full maintenance (not API-only)
    if (isMaintenanceMode && maintenanceType === 'full') {
        const message = serviceConfigGetMaintenanceMessage() || 
            '🔧 DownAria is currently under maintenance. Please try again later.';
        
        await ctx.reply(
            `🚧 *Maintenance Mode*\n\n${message}\n\n_We'll be back soon!_`,
            { parse_mode: 'Markdown' }
        );
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
