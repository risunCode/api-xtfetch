/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT ADMIN COMMAND - /stats
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Shows bot statistics:
 * - Total users count
 * - Total downloads today
 * - Premium users count
 * - Platform breakdown
 * 
 * @module bot/commands/admin/stats
 */

import { Composer } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface BotStats {
    totalUsers: number;
    premiumUsers: number;
    bannedUsers: number;
    downloadsToday: number;
    platformBreakdown: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get bot statistics from database
 */
async function botAdminGetStats(): Promise<BotStats | null> {
    const db = supabaseAdmin;
    if (!db) return null;

    try {
        // Get total users count
        const { count: totalUsers } = await db
            .from('bot_users')
            .select('*', { count: 'exact', head: true });

        // Get premium users count (users with api_key_id)
        const { count: premiumUsers } = await db
            .from('bot_users')
            .select('*', { count: 'exact', head: true })
            .not('api_key_id', 'is', null);

        // Get banned users count
        const { count: bannedUsers } = await db
            .from('bot_users')
            .select('*', { count: 'exact', head: true })
            .eq('is_banned', true);

        // Get today's downloads
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { count: downloadsToday } = await db
            .from('bot_downloads')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today.toISOString());

        // Get platform breakdown for today
        const { data: platformData } = await db
            .from('bot_downloads')
            .select('platform')
            .gte('created_at', today.toISOString());

        const platformBreakdown: Record<string, number> = {};
        if (platformData) {
            platformData.forEach((row) => {
                const platform = row.platform || 'unknown';
                platformBreakdown[platform] = (platformBreakdown[platform] || 0) + 1;
            });
        }

        return {
            totalUsers: totalUsers || 0,
            premiumUsers: premiumUsers || 0,
            bannedUsers: bannedUsers || 0,
            downloadsToday: downloadsToday || 0,
            platformBreakdown,
        };
    } catch (error) {
        console.error('[botAdminGetStats] Error:', error);
        return null;
    }
}

/**
 * Format platform breakdown for display
 */
function formatPlatformBreakdown(breakdown: Record<string, number>): string {
    const platformEmojis: Record<string, string> = {
        youtube: '🔴',
        instagram: '📸',
        tiktok: '🎵',
        twitter: '🐦',
        facebook: '📘',
        weibo: '🔶',
        unknown: '❓',
    };

    const entries = Object.entries(breakdown);
    if (entries.length === 0) {
        return '  No downloads yet';
    }

    return entries
        .sort((a, b) => b[1] - a[1])
        .map(([platform, count]) => {
            const emoji = platformEmojis[platform] || '📦';
            return `  ${emoji} ${platform}: ${count}`;
        })
        .join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export const statsComposer = new Composer<Context>();

statsComposer.command('stats', async (ctx) => {
    // Send loading message
    const loadingMsg = await ctx.reply('📊 Fetching statistics...');

    try {
        const stats = await botAdminGetStats();

        if (!stats) {
            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                '❌ Failed to fetch statistics. Database may be unavailable.'
            );
            return;
        }

        const message = `📊 *Bot Statistics*

━━━━━━━━━━━━━━━━━━━━━━
👥 *Users*
  Total: ${stats.totalUsers.toLocaleString()}
  Premium: ${stats.premiumUsers.toLocaleString()}
  Banned: ${stats.bannedUsers.toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━
📥 *Downloads Today*
  Total: ${stats.downloadsToday.toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━
📱 *Platform Breakdown (Today)*
${formatPlatformBreakdown(stats.platformBreakdown)}
━━━━━━━━━━━━━━━━━━━━━━

🕐 Updated: ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            message,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('[/stats] Error:', error);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            '❌ An error occurred while fetching statistics.'
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { botAdminGetStats };
