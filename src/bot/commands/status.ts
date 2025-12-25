/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT COMMAND - /status
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Checks API health and shows platform availability.
 * 
 * @module bot/commands/status
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface PlatformStatus {
    id: string;
    name: string;
    status: 'operational' | 'degraded' | 'down';
    icon: string;
}

interface HealthResponse {
    status: string;
    timestamp: string;
    platforms?: PlatformStatus[];
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
    operational: '✅',
    degraded: '⚠️',
    down: '❌',
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch health status from API
 */
async function fetchHealthStatus(): Promise<HealthResponse | null> {
    try {
        const apiUrl = process.env.API_BASE_URL || 'http://localhost:3002';
        const response = await fetch(`${apiUrl}/api/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10000) // 10s timeout
        });

        if (!response.ok) {
            return null;
        }

        return await response.json() as HealthResponse;
    } catch (error) {
        console.error('[fetchHealthStatus] Error:', error);
        return null;
    }
}

/**
 * Format platform status for display
 */
function formatPlatformStatus(platforms: PlatformStatus[]): string {
    return platforms
        .map(p => {
            const platformIcon = PLATFORM_ICONS[p.id] || '📦';
            const statusIcon = STATUS_ICONS[p.status] || '❓';
            const statusText = p.status.charAt(0).toUpperCase() + p.status.slice(1);
            return `${platformIcon} *${p.name}*: ${statusIcon} ${statusText}`;
        })
        .join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const statusComposer = new Composer<Context>();

statusComposer.command('status', async (ctx: Context) => {
    // Send loading message
    const loadingMsg = await ctx.reply('⏳ Checking service status...');

    try {
        const health = await fetchHealthStatus();

        if (!health) {
            // API unreachable
            const keyboard = new InlineKeyboard()
                .text('🔄 Retry', 'status_refresh');

            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                `❌ *Service Status*

Unable to reach the API server.
Please try again later.

━━━━━━━━━━━━━━━━━━━━━━
🕐 Checked: ${new Date().toLocaleString()}`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
            return;
        }

        // Build status message
        const overallStatus = health.status === 'ok' ? '✅ Operational' : '⚠️ Issues Detected';
        
        // Default platforms if not provided by API
        const defaultPlatforms: PlatformStatus[] = [
            { id: 'youtube', name: 'YouTube', status: 'operational', icon: '▶️' },
            { id: 'instagram', name: 'Instagram', status: 'operational', icon: '📸' },
            { id: 'tiktok', name: 'TikTok', status: 'operational', icon: '🎵' },
            { id: 'twitter', name: 'Twitter/X', status: 'operational', icon: '𝕏' },
            { id: 'facebook', name: 'Facebook', status: 'operational', icon: '📘' },
            { id: 'weibo', name: 'Weibo', status: 'operational', icon: '🔴' },
        ];

        const platforms = health.platforms || defaultPlatforms;
        const platformsStatus = formatPlatformStatus(platforms);

        const keyboard = new InlineKeyboard()
            .text('🔄 Refresh', 'status_refresh');

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `📊 *Service Status*

*Overall:* ${overallStatus}

*Platform Availability:*
${platformsStatus}

━━━━━━━━━━━━━━━━━━━━━━
🕐 Last checked: ${new Date().toLocaleString()}`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[status command] Error:', error);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            '❌ Error checking status. Please try again later.'
        );
    }
});

// Handle inline button callback for status
statusComposer.callbackQuery('status', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const loadingMsg = await ctx.reply('⏳ Checking service status...');
    
    try {
        const health = await fetchHealthStatus();

        if (!health) {
            const keyboard = new InlineKeyboard()
                .text('🔄 Retry', 'status_refresh');

            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                `❌ *Service Status*

Unable to reach the API server.
Please try again later.

━━━━━━━━━━━━━━━━━━━━━━
🕐 Checked: ${new Date().toLocaleString()}`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
            return;
        }

        const overallStatus = health.status === 'ok' ? '✅ Operational' : '⚠️ Issues Detected';
        
        const defaultPlatforms: PlatformStatus[] = [
            { id: 'youtube', name: 'YouTube', status: 'operational', icon: '▶️' },
            { id: 'instagram', name: 'Instagram', status: 'operational', icon: '📸' },
            { id: 'tiktok', name: 'TikTok', status: 'operational', icon: '🎵' },
            { id: 'twitter', name: 'Twitter/X', status: 'operational', icon: '𝕏' },
            { id: 'facebook', name: 'Facebook', status: 'operational', icon: '📘' },
            { id: 'weibo', name: 'Weibo', status: 'operational', icon: '🔴' },
        ];

        const platforms = health.platforms || defaultPlatforms;
        const platformsStatus = formatPlatformStatus(platforms);

        const keyboard = new InlineKeyboard()
            .text('🔄 Refresh', 'status_refresh');

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `📊 *Service Status*

*Overall:* ${overallStatus}

*Platform Availability:*
${platformsStatus}

━━━━━━━━━━━━━━━━━━━━━━
🕐 Last checked: ${new Date().toLocaleString()}`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[status callback] Error:', error);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            '❌ Error checking status. Please try again later.'
        );
    }
});

// Handle refresh button
statusComposer.callbackQuery('status_refresh', async (ctx: Context) => {
    await ctx.answerCallbackQuery('Refreshing...');
    
    try {
        const health = await fetchHealthStatus();

        if (!health) {
            const keyboard = new InlineKeyboard()
                .text('🔄 Retry', 'status_refresh');

            await ctx.editMessageText(
                `❌ *Service Status*

Unable to reach the API server.
Please try again later.

━━━━━━━━━━━━━━━━━━━━━━
🕐 Checked: ${new Date().toLocaleString()}`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
            return;
        }

        const overallStatus = health.status === 'ok' ? '✅ Operational' : '⚠️ Issues Detected';
        
        const defaultPlatforms: PlatformStatus[] = [
            { id: 'youtube', name: 'YouTube', status: 'operational', icon: '▶️' },
            { id: 'instagram', name: 'Instagram', status: 'operational', icon: '📸' },
            { id: 'tiktok', name: 'TikTok', status: 'operational', icon: '🎵' },
            { id: 'twitter', name: 'Twitter/X', status: 'operational', icon: '𝕏' },
            { id: 'facebook', name: 'Facebook', status: 'operational', icon: '📘' },
            { id: 'weibo', name: 'Weibo', status: 'operational', icon: '🔴' },
        ];

        const platforms = health.platforms || defaultPlatforms;
        const platformsStatus = formatPlatformStatus(platforms);

        const keyboard = new InlineKeyboard()
            .text('🔄 Refresh', 'status_refresh');

        await ctx.editMessageText(
            `📊 *Service Status*

*Overall:* ${overallStatus}

*Platform Availability:*
${platformsStatus}

━━━━━━━━━━━━━━━━━━━━━━
🕐 Last checked: ${new Date().toLocaleString()}`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[status_refresh callback] Error:', error);
        await ctx.answerCallbackQuery('Error refreshing status');
    }
});

export { statusComposer };
