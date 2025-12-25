/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT ADMIN COMMAND - /broadcast
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Send a message to all non-banned bot users.
 * Usage: /broadcast Your message here
 * 
 * @module bot/commands/admin/broadcast
 */

import { Composer } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface BroadcastResult {
    total: number;
    sent: number;
    failed: number;
    blocked: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all non-banned user IDs from database
 */
async function botAdminGetBroadcastTargets(): Promise<number[]> {
    const db = supabaseAdmin;
    if (!db) return [];

    try {
        const { data, error } = await db
            .from('bot_users')
            .select('id')
            .eq('is_banned', false);

        if (error) {
            console.error('[botAdminGetBroadcastTargets] Error:', error);
            return [];
        }

        return data?.map((user) => user.id) || [];
    } catch (error) {
        console.error('[botAdminGetBroadcastTargets] Error:', error);
        return [];
    }
}

/**
 * Send broadcast message to all users
 * @param message - Message to broadcast
 * @param api - Bot API instance from context
 * @param progressCallback - Optional progress callback
 */
async function botAdminBroadcast(
    message: string,
    api: Context['api'],
    progressCallback?: (sent: number, total: number) => Promise<void>
): Promise<BroadcastResult> {
    const userIds = await botAdminGetBroadcastTargets();
    
    const result: BroadcastResult = {
        total: userIds.length,
        sent: 0,
        failed: 0,
        blocked: 0,
    };

    if (userIds.length === 0) {
        return result;
    }

    // Send messages with rate limiting (30 messages per second max for Telegram)
    const BATCH_SIZE = 25;
    const BATCH_DELAY_MS = 1000;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batch = userIds.slice(i, i + BATCH_SIZE);
        
        await Promise.all(
            batch.map(async (userId) => {
                try {
                    await api.sendMessage(userId, message, {
                        parse_mode: 'Markdown',
                    });
                    result.sent++;
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    
                    // Check if user blocked the bot
                    if (
                        errorMessage.includes('bot was blocked') ||
                        errorMessage.includes('user is deactivated') ||
                        errorMessage.includes('chat not found')
                    ) {
                        result.blocked++;
                    } else {
                        result.failed++;
                    }
                }
            })
        );

        // Progress callback
        if (progressCallback) {
            await progressCallback(result.sent + result.failed + result.blocked, result.total);
        }

        // Rate limit delay between batches
        if (i + BATCH_SIZE < userIds.length) {
            await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export const broadcastComposer = new Composer<Context>();

broadcastComposer.command('broadcast', async (ctx) => {
    // Extract message from command
    const messageText = ctx.message?.text || '';
    const broadcastMessage = messageText.replace(/^\/broadcast\s*/i, '').trim();

    if (!broadcastMessage) {
        await ctx.reply(
            `📢 *Broadcast Command*

Usage: \`/broadcast Your message here\`

The message will be sent to all non-banned users.

*Tips:*
• Use Markdown formatting
• Keep messages concise
• Test with a small group first`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Confirm broadcast
    const userIds = await botAdminGetBroadcastTargets();
    
    if (userIds.length === 0) {
        await ctx.reply('❌ No users to broadcast to.');
        return;
    }

    // Send preview and confirmation
    const previewMsg = await ctx.reply(
        `📢 *Broadcast Preview*

━━━━━━━━━━━━━━━━━━━━━━
${broadcastMessage}
━━━━━━━━━━━━━━━━━━━━━━

📊 Recipients: ${userIds.length.toLocaleString()} users

⏳ Starting broadcast...`,
        { parse_mode: 'Markdown' }
    );

    // Execute broadcast with progress updates
    let lastProgressUpdate = 0;
    const result = await botAdminBroadcast(broadcastMessage, ctx.api, async (sent, total) => {
        // Update progress every 10%
        const progress = Math.floor((sent / total) * 100);
        if (progress >= lastProgressUpdate + 10) {
            lastProgressUpdate = progress;
            try {
                await ctx.api.editMessageText(
                    ctx.chat!.id,
                    previewMsg.message_id,
                    `📢 *Broadcasting...*

Progress: ${progress}% (${sent}/${total})

⏳ Please wait...`,
                    { parse_mode: 'Markdown' }
                );
            } catch {
                // Ignore edit errors
            }
        }
    });

    // Final result
    const resultMessage = `📢 *Broadcast Complete*

━━━━━━━━━━━━━━━━━━━━━━
✅ Sent: ${result.sent.toLocaleString()}
❌ Failed: ${result.failed.toLocaleString()}
🚫 Blocked: ${result.blocked.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━
📊 Total: ${result.total.toLocaleString()}

${result.blocked > 0 ? `\n⚠️ ${result.blocked} users have blocked the bot.` : ''}`;

    await ctx.api.editMessageText(
        ctx.chat!.id,
        previewMsg.message_id,
        resultMessage,
        { parse_mode: 'Markdown' }
    );
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { botAdminBroadcast, botAdminGetBroadcastTargets };
