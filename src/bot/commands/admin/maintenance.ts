/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT ADMIN COMMAND - /maintenance
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Broadcast maintenance notifications to all bot users.
 * 
 * Usage:
 *   /maintenance on [message]  - Notify users about maintenance
 *   /maintenance off           - Notify users service is back
 * 
 * @module bot/commands/admin/maintenance
 */

import { Composer } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';

// ============================================================================
// Types
// ============================================================================

interface BroadcastResult {
    total: number;
    sent: number;
    failed: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get all non-banned user IDs
 */
async function botGetAllUserIds(): Promise<number[]> {
    const db = supabaseAdmin;
    if (!db) return [];

    try {
        const { data, error } = await db
            .from('bot_users')
            .select('id')
            .eq('is_banned', false);

        if (error) return [];
        return data?.map((u) => u.id) || [];
    } catch {
        return [];
    }
}

/**
 * Broadcast message to all users
 */
async function botBroadcastMessage(
    message: string,
    api: Context['api']
): Promise<BroadcastResult> {
    const userIds = await botGetAllUserIds();
    const result: BroadcastResult = { total: userIds.length, sent: 0, failed: 0 };

    if (userIds.length === 0) return result;

    const BATCH_SIZE = 25;
    const BATCH_DELAY = 1000;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batch = userIds.slice(i, i + BATCH_SIZE);

        await Promise.all(
            batch.map(async (userId) => {
                try {
                    await api.sendMessage(userId, message, { parse_mode: 'Markdown' });
                    result.sent++;
                } catch {
                    result.failed++;
                }
            })
        );

        if (i + BATCH_SIZE < userIds.length) {
            await new Promise((r) => setTimeout(r, BATCH_DELAY));
        }
    }

    return result;
}

// ============================================================================
// Command Handler
// ============================================================================

export const maintenanceComposer = new Composer<Context>();

maintenanceComposer.command('maintenance', async (ctx) => {
    const text = ctx.message?.text || '';
    const args = text.replace(/^\/maintenance\s*/i, '').trim();
    const [action, ...messageParts] = args.split(/\s+/);
    const customMessage = messageParts.join(' ');

    if (!action || !['on', 'off'].includes(action.toLowerCase())) {
        await ctx.reply(
            `🔧 *Maintenance Broadcast*

Usage:
• \`/maintenance on [message]\` - Notify maintenance start
• \`/maintenance off\` - Notify service restored

Example:
\`/maintenance on Upgrading servers, back in 30 mins\``,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const isOn = action.toLowerCase() === 'on';

    const broadcastMessage = isOn
        ? `🚧 *Maintenance Notice*

${customMessage || 'DownAria is going under maintenance.'}

⏳ Service will be temporarily unavailable.
We'll notify you when we're back online!`
        : `✅ *Service Restored*

DownAria is back online! 🎉

You can now continue downloading your favorite videos.
Thank you for your patience! 💙`;

    // Send preview
    const previewMsg = await ctx.reply(
        `📢 *Broadcasting ${isOn ? 'Maintenance' : 'Service Restored'} Notice*

⏳ Sending to all users...`,
        { parse_mode: 'Markdown' }
    );

    const result = await botBroadcastMessage(broadcastMessage, ctx.api);

    // Update with result
    await ctx.api.editMessageText(
        ctx.chat!.id,
        previewMsg.message_id,
        `📢 *Broadcast Complete*

${isOn ? '🚧 Maintenance' : '✅ Service Restored'} notice sent!

━━━━━━━━━━━━━━━━━━━━━━
✅ Sent: ${result.sent}
❌ Failed: ${result.failed}
📊 Total: ${result.total}
━━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'Markdown' }
    );
});

// ============================================================================
// Exports
// ============================================================================

export { botBroadcastMessage, botGetAllUserIds };
