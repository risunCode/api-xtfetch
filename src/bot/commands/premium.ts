/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT COMMAND - /premium
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Shows premium benefits and handles API key linking.
 * Two buttons: [💬 Contact Admin] [🔑 I Have API Key]
 * Handles API key input and validation, links API key to Telegram user.
 * 
 * @module bot/commands/premium
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';
import { apiKeyValidate } from '@/lib/auth/apikeys';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// Track users waiting for API key input
const awaitingApiKey = new Map<number, { messageId: number; timestamp: number }>();

// Cleanup old entries every 5 minutes
const AWAITING_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const ADMIN_USERNAME = process.env.TELEGRAM_ADMIN_USERNAME || 'risunCode';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Link API key to Telegram user
 */
async function botUserLinkApiKey(userId: number, apiKeyId: string): Promise<boolean> {
    const db = supabaseAdmin;
    if (!db) return false;

    try {
        const { error } = await db
            .from('bot_users')
            .update({
                api_key_id: apiKeyId,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (error) {
            console.error('[botUserLinkApiKey] Error:', error);
            return false;
        }
        return true;
    } catch (error) {
        console.error('[botUserLinkApiKey] Error:', error);
        return false;
    }
}

/**
 * Check if user already has premium
 */
async function botUserHasPremium(userId: number): Promise<{ hasPremium: boolean; apiKeyId: string | null }> {
    const db = supabaseAdmin;
    if (!db) return { hasPremium: false, apiKeyId: null };

    try {
        const { data, error } = await db
            .from('bot_users')
            .select('api_key_id')
            .eq('id', userId)
            .single();

        if (error || !data) {
            return { hasPremium: false, apiKeyId: null };
        }

        return {
            hasPremium: !!data.api_key_id,
            apiKeyId: data.api_key_id
        };
    } catch (error) {
        console.error('[botUserHasPremium] Error:', error);
        return { hasPremium: false, apiKeyId: null };
    }
}

/**
 * Cleanup expired awaiting entries
 */
function cleanupAwaitingEntries(): void {
    const now = Date.now();
    for (const [userId, entry] of awaitingApiKey.entries()) {
        if (now - entry.timestamp > AWAITING_TIMEOUT) {
            awaitingApiKey.delete(userId);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const premiumComposer = new Composer<Context>();

premiumComposer.command('premium', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    // Check if user already has premium
    const { hasPremium } = await botUserHasPremium(userId);
    
    if (hasPremium) {
        const keyboard = new InlineKeyboard()
            .text('📊 My Status', 'mystatus')
            .text('🔓 Unlink Key', 'premium_unlink');

        await ctx.reply(
            `👑 *You Already Have Premium!*

Your account is linked to an API key.
Use /mystatus to see your premium details.`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
        return;
    }

    // Show premium benefits
    const keyboard = new InlineKeyboard()
        .text('💬 Contact Admin', `premium_contact`)
        .text('🔑 I Have API Key', 'premium_enter_key');

    const message = `👑 *Get Premium Access!*

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
3. Enter your API key to activate premium`;

    await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
});

// Handle contact admin button
premiumComposer.callbackQuery('premium_contact', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    await ctx.reply(
        `💬 *Contact Admin*

To purchase a premium API key, please contact:
👤 @${ADMIN_USERNAME}

*What to include in your message:*
• Your Telegram username
• Desired subscription period (monthly/yearly)

The admin will provide you with an API key after payment.`,
        { parse_mode: 'Markdown' }
    );
});

// Handle enter API key button
premiumComposer.callbackQuery('premium_enter_key', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    // Cleanup old entries
    cleanupAwaitingEntries();

    const keyboard = new InlineKeyboard()
        .text('❌ Cancel', 'premium_cancel');

    const msg = await ctx.reply(
        `🔑 *Enter Your API Key*

Please send your API key in the next message.

_Your key should look like:_ \`xtf_live_xxxxx...\`

⚠️ This will expire in 5 minutes.`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );

    // Track that we're waiting for this user's API key
    awaitingApiKey.set(userId, {
        messageId: msg.message_id,
        timestamp: Date.now()
    });
});

// Handle cancel button
premiumComposer.callbackQuery('premium_cancel', async (ctx: Context) => {
    await ctx.answerCallbackQuery('Cancelled');
    
    const userId = ctx.from?.id;
    if (userId) {
        awaitingApiKey.delete(userId);
    }

    await ctx.editMessageText(
        '❌ API key entry cancelled.\n\nUse /premium to try again.',
        { parse_mode: 'Markdown' }
    );
});

// Handle unlink button
premiumComposer.callbackQuery('premium_unlink', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    const keyboard = new InlineKeyboard()
        .text('✅ Yes, Unlink', 'premium_unlink_confirm')
        .text('❌ Cancel', 'premium_unlink_cancel');

    await ctx.reply(
        `⚠️ *Unlink API Key?*

Are you sure you want to unlink your API key?
You will lose premium benefits until you link a new key.`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );
});

// Handle unlink confirmation
premiumComposer.callbackQuery('premium_unlink_confirm', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    const db = supabaseAdmin;
    if (!db) {
        await ctx.reply('❌ Database unavailable. Please try again later.');
        return;
    }

    try {
        const { error } = await db
            .from('bot_users')
            .update({
                api_key_id: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (error) {
            await ctx.editMessageText('❌ Error unlinking API key. Please try again.');
            return;
        }

        await ctx.editMessageText(
            `✅ *API Key Unlinked*

Your premium access has been removed.
Use /premium to link a new API key.`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('[premium_unlink_confirm] Error:', error);
        await ctx.editMessageText('❌ Error unlinking API key. Please try again.');
    }
});

// Handle unlink cancel
premiumComposer.callbackQuery('premium_unlink_cancel', async (ctx: Context) => {
    await ctx.answerCallbackQuery('Cancelled');
    await ctx.deleteMessage();
});

// Handle text messages (for API key input)
premiumComposer.on('message:text', async (ctx: Context, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    if (!userId) {
        return next();
    }

    // Check if we're waiting for this user's API key
    const awaiting = awaitingApiKey.get(userId);
    if (!awaiting) {
        return next();
    }

    // Check if expired
    if (Date.now() - awaiting.timestamp > AWAITING_TIMEOUT) {
        awaitingApiKey.delete(userId);
        return next();
    }

    // Get the API key from message
    const apiKey = ctx.message?.text?.trim();
    if (!apiKey) {
        awaitingApiKey.delete(userId);
        return next();
    }

    // Remove from awaiting
    awaitingApiKey.delete(userId);

    // Delete the user's message containing the API key (for security)
    try {
        await ctx.deleteMessage();
    } catch {
        // Ignore if can't delete
    }

    // Validate the API key
    const loadingMsg = await ctx.reply('⏳ Validating your API key...');

    try {
        const validation = await apiKeyValidate(apiKey);

        if (!validation.valid || !validation.key) {
            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                `❌ *Invalid API Key*

${validation.error || 'The API key is invalid or expired.'}

Use /premium to try again.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Link the API key to the user
        const linked = await botUserLinkApiKey(userId, validation.key.id);

        if (!linked) {
            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                '❌ Error linking API key. Please try again later.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Format expiry date
        let expiryText = 'Never';
        if (validation.key.expiresAt) {
            const expiryDate = new Date(validation.key.expiresAt);
            const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            expiryText = `${expiryDate.toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
            })} (${daysLeft} days left)`;
        }

        const keyboard = new InlineKeyboard()
            .text('📊 My Status', 'mystatus');

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `✅ *Premium Activated!*

Your account is now linked to a premium API key.

*API Key:* \`${validation.key.key}\`
*Expires:* ${expiryText}

Enjoy unlimited downloads! 🎉`,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[premium API key validation] Error:', error);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            '❌ Error validating API key. Please try again later.',
            { parse_mode: 'Markdown' }
        );
    }
});

export { premiumComposer, botUserLinkApiKey, botUserHasPremium };
