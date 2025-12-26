/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT ADMIN COMMANDS - Index & Middleware
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Admin middleware to check if user is authorized.
 * Re-exports all admin command composers.
 * 
 * @module bot/commands/admin
 */

import { Composer } from 'grammy';
import type { Context } from 'grammy';
import { TELEGRAM_ADMIN_IDS, botIsAdmin } from '@/bot/config';

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Middleware to check if user is an admin
 * Rejects non-admins with a message
 */
export function adminMiddleware() {
    return async (ctx: Context, next: () => Promise<void>) => {
        const userId = ctx.from?.id;
        
        if (!userId) {
            await ctx.reply('❌ Unable to identify user.');
            return;
        }

        if (!botIsAdmin(userId)) {
            await ctx.reply('🚫 This command is restricted to administrators only.');
            return;
        }

        // User is admin, proceed
        await next();
    };
}

/**
 * Check if a user ID is in the admin list
 * @param userId - Telegram user ID to check
 */
export function botAdminIsAuthorized(userId: number): boolean {
    return TELEGRAM_ADMIN_IDS.includes(userId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN COMPOSER
// ═══════════════════════════════════════════════════════════════════════════════

// Import admin command composers
import { statsComposer } from './stats';
import { broadcastComposer } from './broadcast';
import { banComposer } from './ban';
import { givevipComposer } from './givevip';
import { maintenanceComposer } from './maintenance';

/**
 * Main admin composer that combines all admin commands
 * Each command has its own admin check - NO global middleware
 */
export const adminComposer = new Composer<Context>();

// Admin commands list for filtering
const adminCommands = ['stats', 'broadcast', 'ban', 'unban', 'givevip', 'revokevip', 'maintenance'];

// Only intercept admin commands with admin check
adminComposer.command(adminCommands, adminMiddleware());

// Register admin command handlers (they will only run if admin check passes)
adminComposer.use(statsComposer);
adminComposer.use(broadcastComposer);
adminComposer.use(banComposer);
adminComposer.use(givevipComposer);
adminComposer.use(maintenanceComposer);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { statsComposer } from './stats';
export { broadcastComposer } from './broadcast';
export { banComposer } from './ban';
export { givevipComposer, botAdminGiveVip, botAdminRevokeVip } from './givevip';
export { maintenanceComposer, botBroadcastMessage, botGetAllUserIds } from './maintenance';
