/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT COMMAND - /mystatus
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Shows premium status if linked.
 * Displays API key (masked), expiry date, downloads count.
 * 
 * @module bot/commands/mystatus
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface BotUserWithKey {
    id: number;
    username: string | null;
    first_name: string | null;
    api_key_id: string | null;
    daily_downloads: number;
    created_at: string;
}

interface ApiKeyInfo {
    id: string;
    name: string;
    key_preview: string;
    enabled: boolean;
    expires_at: string | null;
    total_requests: number;
    success_count: number;
    error_count: number;
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get user's premium status with API key details
 */
async function botUserGetPremiumStatus(userId: number): Promise<{
    user: BotUserWithKey | null;
    apiKey: ApiKeyInfo | null;
}> {
    const db = supabaseAdmin;
    if (!db) return { user: null, apiKey: null };

    try {
        // Get user
        const { data: user, error: userError } = await db
            .from('bot_users')
            .select('id, username, first_name, api_key_id, daily_downloads, created_at')
            .eq('id', userId)
            .single();

        if (userError || !user) {
            return { user: null, apiKey: null };
        }

        // If no API key linked, return user only
        if (!user.api_key_id) {
            return { user: user as BotUserWithKey, apiKey: null };
        }

        // Get API key details
        const { data: apiKey, error: keyError } = await db
            .from('api_keys')
            .select('id, name, key_preview, enabled, expires_at, total_requests, success_count, error_count')
            .eq('id', user.api_key_id)
            .single();

        if (keyError || !apiKey) {
            return { user: user as BotUserWithKey, apiKey: null };
        }

        return {
            user: user as BotUserWithKey,
            apiKey: apiKey as ApiKeyInfo
        };
    } catch (error) {
        console.error('[botUserGetPremiumStatus] Error:', error);
        return { user: null, apiKey: null };
    }
}

/**
 * Get total downloads count for user
 */
async function botUserGetTotalDownloads(userId: number): Promise<number> {
    const db = supabaseAdmin;
    if (!db) return 0;

    try {
        const { count, error } = await db
            .from('bot_downloads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (error) return 0;
        return count || 0;
    } catch {
        return 0;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const mystatusComposer = new Composer<Context>();

mystatusComposer.command('mystatus', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    // Send loading message
    const loadingMsg = await ctx.reply('⏳ Loading your status...');

    try {
        const { user, apiKey } = await botUserGetPremiumStatus(userId);
        const totalDownloads = await botUserGetTotalDownloads(userId);

        if (!user) {
            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                '❌ User not found. Please use /start first.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Build status message based on premium status
        if (!apiKey) {
            // Free user
            const keyboard = new InlineKeyboard()
                .text('👑 Get Premium', 'premium_show')
                .text('🔄 Refresh', 'mystatus_refresh');

            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                `📊 *Your Status*

*Account:* Free Tier
*Username:* ${user.username ? '@' + user.username : 'Not set'}
*Member since:* ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}

━━━━━━━━━━━━━━━━━━━━━━

*Downloads:*
• Today: ${user.daily_downloads} / 10
• Total: ${totalDownloads}

━━━━━━━━━━━━━━━━━━━━━━

💡 Upgrade to Premium for unlimited downloads!`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
            return;
        }

        // Premium user - format expiry
        let expiryText = '♾️ Never';
        let statusEmoji = '✅';
        
        if (apiKey.expires_at) {
            const expiryDate = new Date(apiKey.expires_at);
            const now = new Date();
            const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysLeft <= 0) {
                expiryText = '❌ Expired';
                statusEmoji = '❌';
            } else if (daysLeft <= 7) {
                expiryText = `⚠️ ${expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${daysLeft} days left)`;
                statusEmoji = '⚠️';
            } else {
                expiryText = `${expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${daysLeft} days left)`;
            }
        }

        const keyStatus = apiKey.enabled ? `${statusEmoji} Active` : '❌ Disabled';

        const keyboard = new InlineKeyboard()
            .text('🔓 Unlink Key', 'premium_unlink')
            .text('🔄 Refresh', 'mystatus_refresh');

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `👑 *Premium Status*

*API Key:* \`${apiKey.key_preview}\`
*Status:* ${keyStatus}
*Expires:* ${expiryText}

━━━━━━━━━━━━━━━━━━━━━━

*Downloads:*
• Today: ${user.daily_downloads} (Unlimited)
• Total: ${totalDownloads}
• API Requests: ${apiKey.total_requests}

*Success Rate:* ${apiKey.total_requests > 0 ? Math.round((apiKey.success_count / apiKey.total_requests) * 100) : 100}%`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[mystatus command] Error:', error);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            '❌ Error loading status. Please try again later.'
        );
    }
});


// Handle inline button callback for mystatus
mystatusComposer.callbackQuery('mystatus', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    const loadingMsg = await ctx.reply('⏳ Loading your status...');

    try {
        const { user, apiKey } = await botUserGetPremiumStatus(userId);
        const totalDownloads = await botUserGetTotalDownloads(userId);

        if (!user) {
            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                '❌ User not found. Please use /start first.'
            );
            return;
        }

        if (!apiKey) {
            const keyboard = new InlineKeyboard()
                .text('👑 Get Premium', 'premium_show')
                .text('🔄 Refresh', 'mystatus_refresh');

            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                `📊 *Your Status*

*Account:* Free Tier
*Username:* ${user.username ? '@' + user.username : 'Not set'}
*Member since:* ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}

━━━━━━━━━━━━━━━━━━━━━━

*Downloads:*
• Today: ${user.daily_downloads} / 10
• Total: ${totalDownloads}

━━━━━━━━━━━━━━━━━━━━━━

💡 Upgrade to Premium for unlimited downloads!`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
            return;
        }

        let expiryText = '♾️ Never';
        let statusEmoji = '✅';
        
        if (apiKey.expires_at) {
            const expiryDate = new Date(apiKey.expires_at);
            const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            
            if (daysLeft <= 0) {
                expiryText = '❌ Expired';
                statusEmoji = '❌';
            } else if (daysLeft <= 7) {
                expiryText = `⚠️ ${expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${daysLeft} days left)`;
                statusEmoji = '⚠️';
            } else {
                expiryText = `${expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${daysLeft} days left)`;
            }
        }

        const keyStatus = apiKey.enabled ? `${statusEmoji} Active` : '❌ Disabled';

        const keyboard = new InlineKeyboard()
            .text('🔓 Unlink Key', 'premium_unlink')
            .text('🔄 Refresh', 'mystatus_refresh');

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `👑 *Premium Status*

*API Key:* \`${apiKey.key_preview}\`
*Status:* ${keyStatus}
*Expires:* ${expiryText}

━━━━━━━━━━━━━━━━━━━━━━

*Downloads:*
• Today: ${user.daily_downloads} (Unlimited)
• Total: ${totalDownloads}
• API Requests: ${apiKey.total_requests}

*Success Rate:* ${apiKey.total_requests > 0 ? Math.round((apiKey.success_count / apiKey.total_requests) * 100) : 100}%`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[mystatus callback] Error:', error);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            '❌ Error loading status. Please try again later.'
        );
    }
});


// Handle refresh button
mystatusComposer.callbackQuery('mystatus_refresh', async (ctx: Context) => {
    await ctx.answerCallbackQuery('Refreshing...');
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.answerCallbackQuery('Unable to identify user');
        return;
    }

    try {
        const { user, apiKey } = await botUserGetPremiumStatus(userId);
        const totalDownloads = await botUserGetTotalDownloads(userId);

        if (!user) {
            await ctx.editMessageText('❌ User not found. Please use /start first.');
            return;
        }

        if (!apiKey) {
            const keyboard = new InlineKeyboard()
                .text('👑 Get Premium', 'premium_show')
                .text('🔄 Refresh', 'mystatus_refresh');

            await ctx.editMessageText(
                `📊 *Your Status*

*Account:* Free Tier
*Username:* ${user.username ? '@' + user.username : 'Not set'}
*Member since:* ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}

━━━━━━━━━━━━━━━━━━━━━━

*Downloads:*
• Today: ${user.daily_downloads} / 10
• Total: ${totalDownloads}

━━━━━━━━━━━━━━━━━━━━━━

💡 Upgrade to Premium for unlimited downloads!`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
            return;
        }

        let expiryText = '♾️ Never';
        let statusEmoji = '✅';
        
        if (apiKey.expires_at) {
            const expiryDate = new Date(apiKey.expires_at);
            const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            
            if (daysLeft <= 0) {
                expiryText = '❌ Expired';
                statusEmoji = '❌';
            } else if (daysLeft <= 7) {
                expiryText = `⚠️ ${expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${daysLeft} days left)`;
                statusEmoji = '⚠️';
            } else {
                expiryText = `${expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${daysLeft} days left)`;
            }
        }

        const keyStatus = apiKey.enabled ? `${statusEmoji} Active` : '❌ Disabled';

        const keyboard = new InlineKeyboard()
            .text('🔓 Unlink Key', 'premium_unlink')
            .text('🔄 Refresh', 'mystatus_refresh');

        await ctx.editMessageText(
            `👑 *Premium Status*

*API Key:* \`${apiKey.key_preview}\`
*Status:* ${keyStatus}
*Expires:* ${expiryText}

━━━━━━━━━━━━━━━━━━━━━━

*Downloads:*
• Today: ${user.daily_downloads} (Unlimited)
• Total: ${totalDownloads}
• API Requests: ${apiKey.total_requests}

*Success Rate:* ${apiKey.total_requests > 0 ? Math.round((apiKey.success_count / apiKey.total_requests) * 100) : 100}%`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[mystatus_refresh callback] Error:', error);
        await ctx.answerCallbackQuery('Error refreshing status');
    }
});

// Handle premium_show callback (redirect to premium command)
mystatusComposer.callbackQuery('premium_show', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const keyboard = new InlineKeyboard()
        .text('💬 Contact Admin', 'premium_contact')
        .text('🔑 I Have API Key', 'premium_enter_key');

    await ctx.reply(
        `👑 *Get Premium Access!*

Enjoy unlimited downloads with no restrictions.

*Premium Benefits:*
✅ Unlimited downloads/day
✅ No cooldown between requests
✅ HD video quality
✅ Audio extraction
✅ Priority processing

━━━━━━━━━━━━━━━━━━━━━━

*How to Get Premium:*
1. Contact admin to purchase an API key
2. Once you have the key, click "I Have API Key"
3. Enter your API key to activate premium`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );
});

export { mystatusComposer, botUserGetPremiumStatus, botUserGetTotalDownloads };