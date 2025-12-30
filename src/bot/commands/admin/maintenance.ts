/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT ADMIN COMMAND - /maintenance
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * SET maintenance mode in database AND broadcast notifications to all bot users.
 * 
 * Usage:
 *   /maintenance on [type] [message]  - SET maintenance mode + notify users
 *   /maintenance off                  - DISABLE maintenance + notify users
 * 
 * Types: api, full, all (default: full)
 *   - api: Only API blocked, website can still show content
 *   - full/all: Everything blocked (bot, API, frontend)
 * 
 * @module bot/commands/admin/maintenance
 */

import { Composer } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';
import { serviceConfigSetMaintenanceMode, serviceConfigLoad, serviceConfigGet } from '@/lib/config';

// ============================================================================
// Types
// ============================================================================

type MaintenanceType = 'off' | 'api' | 'full' | 'all';

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

/**
 * Parse maintenance type from argument
 */
function parseMaintenanceType(arg: string): MaintenanceType | null {
    const normalized = arg.toLowerCase();
    if (['api', 'full', 'all'].includes(normalized)) {
        return normalized as MaintenanceType;
    }
    return null;
}

// ============================================================================
// Command Handler
// ============================================================================

export const maintenanceComposer = new Composer<Context>();

maintenanceComposer.command('maintenance', async (ctx) => {
    const text = ctx.message?.text || '';
    const args = text.replace(/^\/maintenance\s*/i, '').trim();
    const parts = args.split(/\s+/);
    const action = parts[0]?.toLowerCase();

    if (!action || !['on', 'off', 'status'].includes(action)) {
        await ctx.reply(
            `🔧 *Maintenance Control*

Usage:
• \`/maintenance on [type] [message]\` - Enable maintenance
• \`/maintenance off\` - Disable maintenance
• \`/maintenance status\` - Check current status

Types: \`api\`, \`full\`, \`all\` (default: full)
• \`api\` - API blocked, website shows maintenance warning
• \`full\`/\`all\` - Everything blocked

Example:
\`/maintenance on full Upgrading servers\`
\`/maintenance on api Database backup\``,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Status check
    if (action === 'status') {
        await serviceConfigLoad(true);
        const config = serviceConfigGet();
        const status = config.maintenanceMode 
            ? `🚧 *ACTIVE* - Type: \`${config.maintenanceType}\``
            : `✅ *OFF* - Service is online`;
        
        await ctx.reply(
            `🔧 *Maintenance Status*\n\n${status}\n\nMessage: ${config.maintenanceMessage || '(none)'}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const isOn = action === 'on';

    // Parse type and message for "on" command
    let maintenanceType: MaintenanceType = 'full';
    let customMessage = '';
    
    if (isOn && parts.length > 1) {
        const possibleType = parseMaintenanceType(parts[1]);
        if (possibleType) {
            maintenanceType = possibleType;
            customMessage = parts.slice(2).join(' ');
        } else {
            // No type specified, entire rest is message
            customMessage = parts.slice(1).join(' ');
        }
    }

    // === STEP 1: SET maintenance mode in database ===
    const setMsg = await ctx.reply(
        `⏳ ${isOn ? 'Enabling' : 'Disabling'} maintenance mode...`,
        { parse_mode: 'Markdown' }
    );

    try {
        const success = await serviceConfigSetMaintenanceMode(
            isOn,
            isOn ? maintenanceType : 'off',
            customMessage || (isOn ? 'DownAria is under maintenance. Please try again later.' : undefined)
        );

        if (!success) {
            await ctx.api.editMessageText(
                ctx.chat!.id,
                setMsg.message_id,
                `❌ *Failed to update maintenance mode*\n\nDatabase error. Please try again or check logs.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Update message with success
        await ctx.api.editMessageText(
            ctx.chat!.id,
            setMsg.message_id,
            `✅ *Maintenance mode ${isOn ? 'ENABLED' : 'DISABLED'}*\n\n` +
            (isOn ? `Type: \`${maintenanceType}\`\nMessage: ${customMessage || '(default)'}\n\n` : '') +
            `⏳ Broadcasting notification to users...`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        await ctx.api.editMessageText(
            ctx.chat!.id,
            setMsg.message_id,
            `❌ *Error setting maintenance mode*\n\n${error instanceof Error ? error.message : 'Unknown error'}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // === STEP 2: Broadcast notification to users ===
    const broadcastMessage = isOn
        ? `🚧 *Maintenance Notice*

${customMessage || 'DownAria is going under maintenance.'}

⏳ Service will be temporarily unavailable.
We'll notify you when we're back online!`
        : `✅ *Service Restored*

DownAria is back online! 🎉

You can now continue downloading your favorite videos.
Thank you for your patience! 💙`;

    const result = await botBroadcastMessage(broadcastMessage, ctx.api);

    // === STEP 3: Update with final result ===
    await ctx.api.editMessageText(
        ctx.chat!.id,
        setMsg.message_id,
        `📢 *Maintenance ${isOn ? 'Enabled' : 'Disabled'} & Broadcast Complete*

${isOn ? `🚧 Type: \`${maintenanceType}\`` : '✅ Service is now online'}

━━━━━━━━━━━━━━━━━━━━━━
📤 Broadcast Results:
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
