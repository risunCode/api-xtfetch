/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT MIDDLEWARE - Maintenance Mode
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Checks if system is in maintenance mode and blocks bot usage accordingly.
 * Admins can still use all commands during maintenance.
 * 
 * Maintenance Types:
 * - 'off': Normal operation
 * - 'api': API-only maintenance (bot still works)
 * - 'full': Full maintenance (bot blocked)
 * - 'all': Everything down (bot blocked)
 * 
 * @module bot/middleware/maintenance
 */

import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '../types';
import { serviceConfigLoad, serviceConfigGet } from '@/lib/config';
import { botIsAdmin } from '../config';

// ============================================================================
// Types
// ============================================================================

type MaintenanceType = 'off' | 'api' | 'full' | 'all';

interface MaintenanceInfo {
    isActive: boolean;
    type: MaintenanceType;
    message?: string;
    estimatedEndTime?: string;
}

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
    const maintenanceType = String(config.maintenanceType || 'off') as MaintenanceType;
    
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
        
        // Build maintenance message
        const message = buildMaintenanceMessage({
            isActive: true,
            type: maintenanceType,
            message: config.maintenanceMessage,
            // Note: estimatedEndTime not currently in ServiceConfig, can be added later
        }, ctx.from?.language_code);
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        return; // Don't proceed to next middleware
    }
    
    await next();
};

// ============================================================================
// Message Builder
// ============================================================================

/**
 * Build a comprehensive maintenance message
 * Includes: type indicator, custom message, estimated time, bilingual support
 */
function buildMaintenanceMessage(info: MaintenanceInfo, languageCode?: string): string {
    const lang = languageCode?.startsWith('id') ? 'id' : 'en';
    
    // Maintenance type indicator
    const typeIndicator = getMaintenanceTypeIndicator(info.type, lang);
    
    // Header
    const header = lang === 'id'
        ? `🔧 *Sedang Maintenance*`
        : `🔧 *Under Maintenance*`;
    
    // Type badge
    const typeBadge = lang === 'id'
        ? `\n\n📌 *Tipe:* ${typeIndicator}`
        : `\n\n📌 *Type:* ${typeIndicator}`;
    
    // Custom message from admin (if set)
    const customMsg = info.message
        ? `\n\n📝 ${info.message}`
        : '';
    
    // Estimated end time (if set)
    let estimatedTime = '';
    if (info.estimatedEndTime) {
        const endTime = formatEstimatedTime(info.estimatedEndTime, lang);
        if (endTime) {
            estimatedTime = lang === 'id'
                ? `\n\n⏰ *Perkiraan selesai:* ${endTime}`
                : `\n\n⏰ *Estimated completion:* ${endTime}`;
        }
    }
    
    // Default message if no custom message
    const defaultMsg = !info.message
        ? (lang === 'id'
            ? `\n\nLayanan sedang dalam pemeliharaan untuk peningkatan performa dan fitur baru.`
            : `\n\nService is under maintenance for performance improvements and new features.`)
        : '';
    
    // Footer
    const footer = lang === 'id'
        ? `\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Silakan coba lagi nanti.\n` +
          `Terima kasih atas kesabarannya! 🙏\n\n` +
          `📢 Update: @downariaxt\\_bot`
        : `\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Please try again later.\n` +
          `Thanks for your patience! 🙏\n\n` +
          `📢 Updates: @downariaxt\\_bot`;
    
    return header + typeBadge + customMsg + defaultMsg + estimatedTime + footer;
}

/**
 * Get human-readable maintenance type indicator
 */
function getMaintenanceTypeIndicator(type: MaintenanceType, lang: 'en' | 'id'): string {
    const indicators: Record<MaintenanceType, { en: string; id: string }> = {
        'off': { en: 'Normal', id: 'Normal' },
        'api': { en: 'API Only', id: 'Hanya API' },
        'full': { en: 'Full Maintenance', id: 'Maintenance Penuh' },
        'all': { en: 'Complete Shutdown', id: 'Shutdown Total' },
    };
    
    return indicators[type]?.[lang] || indicators['full'][lang];
}

/**
 * Format estimated end time to human-readable string
 */
function formatEstimatedTime(isoTime: string, lang: 'en' | 'id'): string | null {
    try {
        const endDate = new Date(isoTime);
        const now = new Date();
        
        // If end time is in the past, don't show it
        if (endDate <= now) {
            return lang === 'id' ? 'Segera' : 'Soon';
        }
        
        // Calculate time difference
        const diffMs = endDate.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffMins < 60) {
            return lang === 'id'
                ? `~${diffMins} menit lagi`
                : `~${diffMins} minutes`;
        } else if (diffHours < 24) {
            const mins = diffMins % 60;
            return lang === 'id'
                ? `~${diffHours} jam ${mins > 0 ? mins + ' menit' : ''}`
                : `~${diffHours} hour${diffHours > 1 ? 's' : ''} ${mins > 0 ? mins + ' min' : ''}`;
        } else {
            // Show date/time for longer maintenance
            const options: Intl.DateTimeFormatOptions = {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Jakarta',
            };
            return endDate.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', options) + ' WIB';
        }
    } catch {
        return null;
    }
}

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
 * Get maintenance info for bot
 */
export async function botGetMaintenanceInfo(): Promise<MaintenanceInfo> {
    await serviceConfigLoad(true);
    const config = serviceConfigGet();
    
    return {
        isActive: config.maintenanceMode === true,
        type: (config.maintenanceType || 'off') as MaintenanceType,
        message: config.maintenanceMessage,
        // Note: estimatedEndTime not currently in ServiceConfig, can be added later
    };
}

/**
 * Get maintenance message for bot (bilingual)
 */
export async function botGetMaintenanceMessage(languageCode?: string): Promise<string> {
    const info = await botGetMaintenanceInfo();
    
    if (!info.isActive) {
        return languageCode?.startsWith('id')
            ? '✅ Layanan beroperasi normal.'
            : '✅ Service is operating normally.';
    }
    
    return buildMaintenanceMessage(info, languageCode);
}
