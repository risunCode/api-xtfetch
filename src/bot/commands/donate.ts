/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOT COMMAND - /donate
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Shows donation benefits and handles API key linking.
 * Two buttons: [💬 Contact Admin] [🔑 I Have API Key]
 * Handles API key input and validation, links API key to Telegram user.
 * 
 * @module bot/commands/donate
 */

import { Composer, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { supabaseAdmin } from '@/lib/database/supabase';
import { apiKeyValidate } from '@/lib/auth/apikeys';
import { botUserLinkApiKey as botUserLinkApiKeyService } from '../services/userService';

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

const ADMIN_CONTACT_USERNAME = process.env.TELEGRAM_ADMIN_USERNAME || 'risunCode';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect user language from Telegram context
 */
function getUserLanguage(ctx: Context): 'id' | 'en' {
    const langCode = ctx.from?.language_code;
    return langCode === 'id' ? 'id' : 'en';
}

/**
 * Link API key to Telegram user (wrapper around userService)
 */
async function botUserLinkApiKey(userId: number, apiKeyId: string): Promise<boolean> {
    const { error } = await botUserLinkApiKeyService(userId, apiKeyId);
    if (error) {
        console.error('[botUserLinkApiKey] Error:', error);
        return false;
    }
    return true;
}

/**
 * Check if user already has donator status (premium)
 */
async function botUserHasDonatorStatus(userId: number): Promise<{ hasDonatorStatus: boolean; apiKeyId: string | null }> {
    const db = supabaseAdmin;
    if (!db) return { hasDonatorStatus: false, apiKeyId: null };

    try {
        const { data, error } = await db
            .from('bot_users')
            .select('api_key_id')
            .eq('id', userId)
            .single();

        if (error || !data) {
            return { hasDonatorStatus: false, apiKeyId: null };
        }

        return {
            hasDonatorStatus: !!data.api_key_id,
            apiKeyId: data.api_key_id
        };
    } catch (error) {
        console.error('[botUserHasDonatorStatus] Error:', error);
        return { hasDonatorStatus: false, apiKeyId: null };
    }
}

// Keep old function name for backward compatibility
const botUserHasPremium = botUserHasDonatorStatus;

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

const donateComposer = new Composer<Context>();

// Handle /donate command
donateComposer.command('donate', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    const lang = getUserLanguage(ctx);

    // Check if user already has donator status
    const { hasDonatorStatus } = await botUserHasDonatorStatus(userId);
    
    if (hasDonatorStatus) {
        const keyboard = new InlineKeyboard()
            .text('📊 My Status', 'cmd:mystatus')
            .text('🔓 Unlink Key', 'donate_unlink');

        const message = lang === 'id'
            ? `👑 *Kamu Sudah Menjadi Donatur!*

Akunmu sudah terhubung dengan API key.
Gunakan /mystatus untuk melihat detail donatur.`
            : `👑 *You Are Already a Donator!*

Your account is linked to an API key.
Use /mystatus to see your donator details.`;

        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        return;
    }

    // Show donation benefits
    const keyboard = new InlineKeyboard()
        .text('🛒 Donasi Sekarang', `donate_contact`)
        .row()
        .text('🔑 Saya Punya API Key', 'donate_enter_key');

    const message = lang === 'id'
        ? `💝 *Paket Donasi DownAria*

Dengan berdonasi, kamu mendukung pengembangan bot!

✨ *Keuntungan Donatur:*
• Download sesuai limit API key
• Tanpa cooldown
• Multi-URL (max 5/pesan)
• Prioritas support

💰 *Harga:*
• Rp5.000 / 30 hari (PROMO!)

📱 Hubungi @${ADMIN_CONTACT_USERNAME} untuk donasi

━━━━━━━━━━━━━━━━━━━━━━

Sudah punya API key? Klik "Saya Punya API Key" untuk aktivasi.`
        : `💝 *DownAria Donation Plan*

By donating, you support bot development!

✨ *Donator Benefits:*
• Downloads based on API key limit
• No cooldown
• Multi-URL (max 5/message)
• Priority support

💰 *Price:*
• Rp5,000 / 30 days (PROMO!)

📱 Contact @${ADMIN_CONTACT_USERNAME} to donate

━━━━━━━━━━━━━━━━━━━━━━

Already have an API key? Click "I Have API Key" to activate.`;

    await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
});

// Handle contact admin button (Donate Now)
donateComposer.callbackQuery('donate_contact', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const lang = getUserLanguage(ctx);
    
    const keyboard = new InlineKeyboard()
        .url(`💬 Chat with Admin`, `https://t.me/${ADMIN_CONTACT_USERNAME}`)
        .row()
        .text('✅ Sudah Donasi', 'donate_enter_key')
        .row()
        .text('« Kembali', 'cmd:donate');

    const message = lang === 'id'
        ? `🛒 *Donasi Sekarang*

Hubungi admin untuk donasi:
👤 @${ADMIN_CONTACT_USERNAME}

Setelah donasi, kamu akan menerima API key.
Klik "Sudah Donasi" untuk memasukkan key.`
        : `🛒 *Donate Now*

Contact admin to donate:
👤 @${ADMIN_CONTACT_USERNAME}

After donation, you'll receive an API key.
Click "Already Donated" to enter your key.`;

    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// Handle enter API key button
donateComposer.callbackQuery('donate_enter_key', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    const lang = getUserLanguage(ctx);

    // Cleanup old entries
    cleanupAwaitingEntries();

    const keyboard = new InlineKeyboard()
        .text('❌ Batal', 'donate_cancel_input');

    const message = lang === 'id'
        ? `🔑 *Masukkan API Key*

Kirim API key kamu di pesan berikutnya.

_Format:_ \`dwa_live_xxxxx...\`

⚠️ Kadaluarsa dalam 5 menit.`
        : `🔑 *Enter Your API Key*

Send your API key in the next message.

_Format:_ \`dwa_live_xxxxx...\`

⚠️ Expires in 5 minutes.`;

    const msg = await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });

    // Track that we're waiting for this user's API key
    awaitingApiKey.set(userId, {
        messageId: msg.message_id,
        timestamp: Date.now()
    });
});

// Handle cancel API key input - just delete the message
donateComposer.callbackQuery('donate_cancel_input', async (ctx: Context) => {
    await ctx.answerCallbackQuery('Cancelled');
    
    const userId = ctx.from?.id;
    if (userId) {
        awaitingApiKey.delete(userId);
    }
    
    try {
        await ctx.deleteMessage();
    } catch {
        // Ignore if can't delete
    }
});

// Handle unlink button
donateComposer.callbackQuery('donate_unlink', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    const lang = getUserLanguage(ctx);

    const keyboard = new InlineKeyboard()
        .text('✅ Ya, Lepaskan', 'donate_unlink_confirm')
        .text('❌ Batal', 'donate_unlink_cancel');

    const message = lang === 'id'
        ? `⚠️ *Lepaskan API Key?*

Apakah kamu yakin ingin melepaskan API key?
Kamu akan kehilangan keuntungan donatur sampai menghubungkan key baru.`
        : `⚠️ *Unlink API Key?*

Are you sure you want to unlink your API key?
You will lose donator benefits until you link a new key.`;

    await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// Handle unlink confirmation
donateComposer.callbackQuery('donate_unlink_confirm', async (ctx: Context) => {
    await ctx.answerCallbackQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.reply('❌ Unable to identify user.');
        return;
    }

    const lang = getUserLanguage(ctx);
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

        const message = lang === 'id'
            ? `✅ *API Key Dilepaskan*

Akses donatur kamu telah dihapus.
Gunakan /donate untuk menghubungkan API key baru.`
            : `✅ *API Key Unlinked*

Your donator access has been removed.
Use /donate to link a new API key.`;

        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('[donate_unlink_confirm] Error:', error);
        await ctx.editMessageText('❌ Error unlinking API key. Please try again.');
    }
});

// Handle unlink cancel
donateComposer.callbackQuery('donate_unlink_cancel', async (ctx: Context) => {
    await ctx.answerCallbackQuery('Cancelled');
    await ctx.deleteMessage();
});

// Handle donate refresh button
donateComposer.callbackQuery('donate_refresh', async (ctx: Context) => {
    await ctx.answerCallbackQuery('Refreshing...');
    
    const userId = ctx.from?.id;
    if (!userId) {
        await ctx.answerCallbackQuery('Unable to identify user');
        return;
    }

    const lang = getUserLanguage(ctx);

    try {
        // Import dynamically to avoid circular dependency
        const { botUserGetPremiumStatus, botUserGetTotalDownloads } = await import('./mystatus');
        const { donatorStatusKeyboard } = await import('../keyboards');
        
        const { user, apiKey } = await botUserGetPremiumStatus(userId);
        const totalDownloads = await botUserGetTotalDownloads(userId);

        if (!user || !apiKey) {
            // User is no longer a donator
            const keyboard = new InlineKeyboard()
                .text('🛒 Donasi Sekarang', 'donate_contact')
                .row()
                .text('🔑 Saya Punya API Key', 'donate_enter_key');

            const message = lang === 'id'
                ? `💝 *Paket Donasi DownAria*

Status donatur kamu telah kadaluarsa atau dilepaskan.

✨ *Keuntungan Donatur:*
• Download sesuai limit API key
• Tanpa cooldown
• Multi-URL (max 5/pesan)
• Prioritas support`
                : `💝 *DownAria Donation Plan*

Your donator status has expired or been unlinked.

✨ *Donator Benefits:*
• Downloads based on API key limit
• No cooldown
• Multi-URL (max 5/message)
• Priority support`;

            await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
            return;
        }

        // Format expiry
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

        const message = lang === 'id'
            ? `👑 *Status Donatur*

*API Key:* \`${apiKey.key_preview}\`
*Status:* ${keyStatus}
*Kadaluarsa:* ${expiryText}

━━━━━━━━━━━━━━━━━━━━━━

*Download:*
• Hari ini: ${user.daily_downloads} (Unlimited)
• Total: ${totalDownloads}
• API Requests: ${apiKey.total_requests}

*Success Rate:* ${apiKey.total_requests > 0 ? Math.round((apiKey.success_count / apiKey.total_requests) * 100) : 100}%`
            : `👑 *Donator Status*

*API Key:* \`${apiKey.key_preview}\`
*Status:* ${keyStatus}
*Expires:* ${expiryText}

━━━━━━━━━━━━━━━━━━━━━━

*Downloads:*
• Today: ${user.daily_downloads} (Unlimited)
• Total: ${totalDownloads}
• API Requests: ${apiKey.total_requests}

*Success Rate:* ${apiKey.total_requests > 0 ? Math.round((apiKey.success_count / apiKey.total_requests) * 100) : 100}%`;

        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: donatorStatusKeyboard() });
    } catch (error) {
        console.error('[donate_refresh callback] Error:', error);
        await ctx.answerCallbackQuery('Error refreshing status');
    }
});

// Handle text messages (for API key input)
donateComposer.on('message:text', async (ctx: Context, next: () => Promise<void>) => {
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

    const lang = getUserLanguage(ctx);

    // Delete the user's message containing the API key (for security)
    try {
        await ctx.deleteMessage();
    } catch {
        // Ignore if can't delete
    }

    // Delete the "Enter your API key" prompt message
    try {
        await ctx.api.deleteMessage(ctx.chat!.id, awaiting.messageId);
    } catch {
        // Ignore if can't delete (already deleted or expired)
    }

    // Validate the API key
    const loadingMsg = await ctx.reply(lang === 'id' ? '⏳ Memvalidasi API key...' : '⏳ Validating your API key...');

    try {
        const validation = await apiKeyValidate(apiKey);

        if (!validation.valid || !validation.key) {
            // Check if it's a rate limit error (brute force protection)
            const isRateLimited = validation.error?.includes('Too many validation attempts');
            
            const errorMessage = isRateLimited
                ? (lang === 'id'
                    ? `⏳ *Terlalu Banyak Percobaan*

Kamu sudah mencoba terlalu banyak. Tunggu sebentar lalu coba lagi.

${validation.error}`
                    : `⏳ *Too Many Attempts*

You've tried too many times. Please wait a moment and try again.

${validation.error}`)
                : (lang === 'id'
                    ? `❌ *API Key Tidak Valid*

${validation.error || 'API key tidak valid atau sudah kadaluarsa.'}

Gunakan /donate untuk mencoba lagi.`
                    : `❌ *Invalid API Key*

${validation.error || 'The API key is invalid or expired.'}

Use /donate to try again.`);

            await ctx.api.editMessageText(
                ctx.chat!.id,
                loadingMsg.message_id,
                errorMessage,
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
                lang === 'id' 
                    ? '❌ Error menghubungkan API key. Silakan coba lagi nanti.'
                    : '❌ Error linking API key. Please try again later.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Format expiry date
        let expiryText = lang === 'id' ? 'Tidak pernah' : 'Never';
        if (validation.key.expiresAt) {
            const expiryDate = new Date(validation.key.expiresAt);
            const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            expiryText = `${expiryDate.toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
            })} (${daysLeft} ${lang === 'id' ? 'hari lagi' : 'days left'})`;
        }

        const keyboard = new InlineKeyboard()
            .text('📊 My Status', 'cmd:mystatus');

        const successMessage = lang === 'id'
            ? `✅ *Donatur Diaktifkan!*

Akunmu sekarang terhubung dengan API key donatur.

*API Key:* \`${validation.key.key}\`
*Kadaluarsa:* ${expiryText}

Nikmati download tanpa batas! 🎉`
            : `✅ *Donator Activated!*

Your account is now linked to a donator API key.

*API Key:* \`${validation.key.key}\`
*Expires:* ${expiryText}

Enjoy unlimited downloads! 🎉`;

        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            successMessage,
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
    } catch (error) {
        console.error('[donate API key validation] Error:', error);
        await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            lang === 'id'
                ? '❌ Error memvalidasi API key. Silakan coba lagi nanti.'
                : '❌ Error validating API key. Please try again later.',
            { parse_mode: 'Markdown' }
        );
    }
});

export { donateComposer, botUserLinkApiKey, botUserHasPremium, botUserHasDonatorStatus };
