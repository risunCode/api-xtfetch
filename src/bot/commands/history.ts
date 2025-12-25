/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT COMMAND - /history
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Fetches and displays last 10 downloads from bot_downloads table.
 * Shows title, platform, and date.
 * 
 * @module bot/commands/history
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface BotDownload {
    id: string;
    user_id: number;
    platform: string;
    url: string;
    title: string | null;
    status: 'success' | 'failed';
    is_premium: boolean;
    created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const PLATFORM_ICONS: Record<string, string> = {
    youtube: '▶️',
    instagram: '📸',
    tiktok: '🎵',
    twitter: '𝕏',
    facebook: '📘',
    weibo: '🔴',
};

const STATUS_ICONS: Record<string, string> = {
    success: '✅',
    failed: '❌',
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch user's download history
 */
async function botDownloadGetHistory(userId: number, limit: number = 10): Promise<BotDownload[]> {
    const db = supabaseAdmin;
    if (!db) return [];

    try {
        const { data, error } = await db
            .from('bot_downloads')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[botDownloadGetHistory] Error:', error);
            return [];
        }

        return (data || []) as BotDownload[];
    } catch (error) {
        console.error('[botDownloadGetHistory] Error:', error);
        return [];
    }
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

/**
 * Truncate title for display
 */
function truncateTitle(title: string | null, maxLength: number = 35): string {
    if (!title) return 'Untitled';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3) + '...';
}

/**
 * Format download history for display
 */
function formatHistoryList(downloads: BotDownload[]): string {
    if (downloads.length === 0) {
        return '_No downloads yet. Paste a video URL to get started!_';
    }

    return downloads
        .map((d, index) => {
            const platformIcon = PLATFORM_ICONS[d.platform] || '📦';
            const statusIcon = STATUS_ICONS[d.status] || '❓';
            const title = truncateTitle(d.title);
            const date = formatDate(d.created_at);
            const premiumBadge = d.is_premium ? ' 👑' : '';
            
            return `${index + 1}. ${statusIcon} ${platformIcon} *${title}*${premiumBadge}\n   └ ${date}`;
        })
        .join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const historyComposer = new Composer<Context>();

historyComposer.command('history', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    // Send loading message
    const loadingMsg = await ctx.reply('⏳ Loading your download history...');

    try {
        const downloads = await botDownloadGetHistory(userId, 10);
        const historyList = formatHistoryList(downloads);

        const keyboard = new InlineKeyboard()
            .text('🔄 Refresh', 'history_refresh');

        const totalCount = downloads.length;
        const successCount = downloads.filter(d => d.status === 'success').length;

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `📜 *Your Download History*

${historyList}

━━━━━━━━━━━━━━━━━━━━━━
📊 Showing ${totalCount} recent downloads (${successCount} successful)`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[history command] Error:', error);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            '❌ Error loading history. Please try again later.'
        );
    }
});

// Handle inline button callback for history
historyComposer.callbackQuery('history', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    const loadingMsg = await ctx.reply('⏳ Loading your download history...');

    try {
        const downloads = await botDownloadGetHistory(userId, 10);
        const historyList = formatHistoryList(downloads);

        const keyboard = new InlineKeyboard()
            .text('🔄 Refresh', 'history_refresh');

        const totalCount = downloads.length;
        const successCount = downloads.filter(d => d.status === 'success').length;

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `📜 *Your Download History*

${historyList}

━━━━━━━━━━━━━━━━━━━━━━
📊 Showing ${totalCount} recent downloads (${successCount} successful)`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[history callback] Error:', error);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            '❌ Error loading history. Please try again later.'
        );
    }
});

// Handle refresh button
historyComposer.callbackQuery('history_refresh', async (ctx: Context) => {
    await ctx.answerCallbackQuery('Refreshing...');
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.answerCallbackQuery('Unable to identify user');
        return;
    }

    try {
        const downloads = await botDownloadGetHistory(userId, 10);
        const historyList = formatHistoryList(downloads);

        const keyboard = new InlineKeyboard()
            .text('🔄 Refresh', 'history_refresh');

        const totalCount = downloads.length;
        const successCount = downloads.filter(d => d.status === 'success').length;

        await ctx.editMessageText(
            `📜 *Your Download History*

${historyList}

━━━━━━━━━━━━━━━━━━━━━━
📊 Showing ${totalCount} recent downloads (${successCount} successful)`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[history_refresh callback] Error:', error);
        await ctx.answerCallbackQuery('Error refreshing history');
    }
});

export { historyComposer, botDownloadGetHistory };
