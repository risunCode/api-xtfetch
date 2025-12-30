/**
 * Admin Callback Handlers
 * Handles: admin:*, gp_give_*, report_cookie:* callbacks
 * 
 * Admin callbacks:
 * - admin:* - Admin panel actions
 * - gp_give_{userId}_{days} - Give premium to user
 * - report_cookie:{platform} - Report cookie issue to admin
 */

import { Bot } from 'grammy';

import { logger } from '@/lib/services/shared/logger';

import type { BotContext } from '../types';
import { TELEGRAM_ADMIN_IDS } from '../config';

// ============================================================================
// ADMIN CALLBACK HANDLERS
// ============================================================================

/**
 * Handle report_cookie callback
 * Pattern: report_cookie:{platform}
 * 
 * Reports cookie issues to all admins
 */
async function botCallbackReportCookie(ctx: BotContext, platform: string): Promise<void> {
    await ctx.answerCallbackQuery({ text: '📢 Reporting to admin...' });

    try {
        const userId = ctx.from?.id;
        const username = ctx.from?.username;
        
        const reportMessage = `🚨 *Cookie Issue Report*

*Platform:* ${platform.toUpperCase()}
*Reported by:* ${username ? `@${username}` : `User ${userId}`}
*User ID:* \`${userId}\`
*Time:* ${new Date().toISOString()}

A user reported that ${platform} downloads are failing due to cookie issues.`;

        // Send to all admins
        for (const adminId of TELEGRAM_ADMIN_IDS) {
            try {
                await ctx.api.sendMessage(adminId, reportMessage, { parse_mode: 'Markdown' });
            } catch {
                // Admin might have blocked the bot
            }
        }

        await ctx.reply('✅ Report sent to admin. Thank you for reporting!');
    } catch (error) {
        logger.error('telegram', error, 'REPORT_COOKIE');
        await ctx.reply('❌ Failed to send report. Please try again later.');
    }
}

// ============================================================================
// MAIN HANDLER REGISTRATION
// ============================================================================

/**
 * Register admin callback handlers
 * 
 * Usage:
 * ```typescript
 * import { registerAdminCallbacks } from '@/bot/handlers/callback-admin';
 * registerAdminCallbacks(bot);
 * ```
 */
export function registerAdminCallbacks(bot: Bot<BotContext>): void {
    // Report cookie issue to admin: report_cookie:{platform}
    bot.callbackQuery(/^report_cookie:(.+)$/, async (ctx) => {
        const platform = ctx.match?.[1];
        if (!platform) return;

        try {
            await botCallbackReportCookie(ctx, platform);
        } catch (error) {
            logger.error('telegram', error, 'REPORT_COOKIE_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });

    // admin:* callbacks (admin panel actions)
    bot.callbackQuery(/^admin:(.+)$/, async (ctx) => {
        if (!ctx.isAdmin) {
            await ctx.answerCallbackQuery({ text: '❌ Admin only', show_alert: true });
            return;
        }

        const action = ctx.match?.[1];
        if (!action) return;

        logger.debug('telegram', `Admin callback: ${action}`);

        try {
            // Handle admin actions
            switch (action) {
                case 'stats':
                    await ctx.answerCallbackQuery({ text: '📊 Loading stats...' });
                    // TODO: Implement admin stats
                    await ctx.reply('📊 Admin stats feature coming soon.');
                    break;
                    
                case 'users':
                    await ctx.answerCallbackQuery({ text: '👥 Loading users...' });
                    // TODO: Implement user management
                    await ctx.reply('👥 User management feature coming soon.');
                    break;
                    
                case 'downloads':
                    await ctx.answerCallbackQuery({ text: '📥 Loading downloads...' });
                    // TODO: Implement download logs
                    await ctx.reply('📥 Download logs feature coming soon.');
                    break;
                    
                case 'broadcast':
                    await ctx.answerCallbackQuery({ text: '📢 Broadcast mode...' });
                    // TODO: Implement broadcast
                    await ctx.reply('📢 Broadcast feature coming soon.');
                    break;
                    
                default:
                    await ctx.answerCallbackQuery({ text: `Unknown action: ${action}` });
            }
        } catch (error) {
            logger.error('telegram', error, 'ADMIN_CALLBACK');
            await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
        }
    });

    // gp_give_* callbacks (give premium to user)
    // Pattern: gp_give_{userId}_{days}
    bot.callbackQuery(/^gp_give_(\d+)_(-?\d+)$/, async (ctx) => {
        if (!ctx.isAdmin) {
            await ctx.answerCallbackQuery({ text: '❌ Admin only', show_alert: true });
            return;
        }

        const userId = parseInt(ctx.match?.[1] || '0', 10);
        const days = parseInt(ctx.match?.[2] || '0', 10);

        if (!userId) {
            await ctx.answerCallbackQuery({ text: '❌ Invalid user ID' });
            return;
        }

        logger.debug('telegram', `Give premium: user ${userId}, days ${days}`);

        try {
            await ctx.answerCallbackQuery({ text: '⏳ Processing...' });

            // Calculate expiry date
            let expiryText: string;
            if (days === -1) {
                expiryText = '♾️ Lifetime';
            } else {
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + days);
                expiryText = expiryDate.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                });
            }

            // TODO: Implement actual premium assignment via database
            // For now, just show confirmation
            await ctx.editMessageText(
                `✅ *Premium Assigned*\n\n` +
                `*User ID:* \`${userId}\`\n` +
                `*Duration:* ${days === -1 ? 'Lifetime' : `${days} days`}\n` +
                `*Expires:* ${expiryText}\n\n` +
                `_Note: Database update not yet implemented._`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            logger.error('telegram', error, 'GIVE_PREMIUM_CALLBACK');
            await ctx.reply('❌ Failed to assign premium. Please try again.');
        }
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { botCallbackReportCookie };
