/**
 * /stop command - Delete user data (GDPR compliance)
 * User can request to be "forgotten" - all their data will be deleted
 * 
 * Flow:
 * 1. User sends /stop
 * 2. Bot shows confirmation with warning
 * 3. User clicks confirm button
 * 4. Bot deletes user data from database
 * 5. Bot confirms deletion
 */

import { Composer, InlineKeyboard } from 'grammy';
import { supabaseAdmin } from '@/lib/database';
import { redis } from '@/lib/database';
import { logger } from '@/lib/services/shared/logger';
import type { BotContext } from '../types';
import { getUserLanguage } from '../helpers';

const stopComposer = new Composer<BotContext>();

// ============================================================================
// DELETE USER FUNCTION
// ============================================================================

/**
 * Delete all user data from database
 * Returns true if successful, false otherwise
 */
async function deleteUserData(telegramId: number): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // 1. Delete from bot_users table
    const { error: userError } = await supabaseAdmin
      .from('bot_users')
      .delete()
      .eq('id', telegramId);

    if (userError) {
      logger.error('telegram', userError, 'DELETE_USER');
      return { success: false, error: userError.message };
    }

    // 2. Clear Redis session data
    if (redis) {
      try {
        await redis.del(`bot:session:${telegramId}`);
        await redis.del(`bot:cooldown:${telegramId}`);
        // Clear any dedup keys (pattern match)
        const dedupKeys = await redis.keys(`bot:dedup:${telegramId}:*`);
        if (dedupKeys.length > 0) {
          await redis.del(...dedupKeys);
        }
      } catch (redisError) {
        // Log but don't fail - Redis cleanup is best effort
        logger.debug('telegram', `Failed to clear Redis data for user ${telegramId}`);
      }
    }

    logger.debug('telegram', `User data deleted: ${telegramId}`);
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('telegram', err, 'DELETE_USER');
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// COMMAND HANDLER
// ============================================================================

stopComposer.command(['stop', 'unsubscribe', 'forget'], async (ctx) => {
  const lang = getUserLanguage(ctx);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply('❌ User not found');
    return;
  }

  // Check if user exists in database
  if (!ctx.botUser) {
    const message = lang === 'id'
      ? `ℹ️ Kamu belum terdaftar di database kami.\n\nTidak ada data yang perlu dihapus.`
      : `ℹ️ You're not registered in our database.\n\nNo data to delete.`;
    await ctx.reply(message);
    return;
  }

  // Show confirmation message
  const message = lang === 'id'
    ? `⚠️ *Hapus Data Saya*

Kamu yakin ingin menghapus semua data?

*Yang akan dihapus:*
• Profil & statistik download
• Riwayat penggunaan
• API key yang terhubung (jika ada)
• Session & cache

⚠️ *Peringatan:*
• Tindakan ini TIDAK BISA dibatalkan
• Kamu harus /start lagi untuk menggunakan bot
• Limit harian akan reset dari awal

Ketik /start kapan saja untuk mendaftar ulang.`
    : `⚠️ *Delete My Data*

Are you sure you want to delete all your data?

*What will be deleted:*
• Profile & download statistics
• Usage history
• Linked API key (if any)
• Session & cache

⚠️ *Warning:*
• This action CANNOT be undone
• You'll need to /start again to use the bot
• Daily limits will reset from scratch

Type /start anytime to re-register.`;

  const keyboard = new InlineKeyboard()
    .text(lang === 'id' ? '✅ Ya, Hapus Data Saya' : '✅ Yes, Delete My Data', 'stop_confirm')
    .row()
    .text(lang === 'id' ? '❌ Batal' : '❌ Cancel', 'stop_cancel');

  await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

// ============================================================================
// CALLBACK HANDLERS
// ============================================================================

// Confirm deletion
stopComposer.callbackQuery('stop_confirm', async (ctx) => {
  const lang = getUserLanguage(ctx);
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.answerCallbackQuery({ text: '❌ Error', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: lang === 'id' ? '⏳ Menghapus...' : '⏳ Deleting...' });

  // Delete user data
  const result = await deleteUserData(userId);

  if (result.success) {
    const message = lang === 'id'
      ? `✅ *Data Berhasil Dihapus*

Semua data kamu telah dihapus dari sistem kami.

👋 Sampai jumpa! Ketik /start kapan saja untuk kembali.`
      : `✅ *Data Successfully Deleted*

All your data has been removed from our system.

👋 Goodbye! Type /start anytime to come back.`;

    await ctx.editMessageText(message, { parse_mode: 'Markdown' });
  } else {
    const message = lang === 'id'
      ? `❌ *Gagal Menghapus Data*

Terjadi kesalahan: ${result.error || 'Unknown error'}

Silakan coba lagi atau hubungi admin.`
      : `❌ *Failed to Delete Data*

An error occurred: ${result.error || 'Unknown error'}

Please try again or contact admin.`;

    const keyboard = new InlineKeyboard()
      .text(lang === 'id' ? '🔄 Coba Lagi' : '🔄 Try Again', 'stop_confirm')
      .row()
      .text(lang === 'id' ? '❌ Batal' : '❌ Cancel', 'stop_cancel');

    await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
});

// Cancel deletion
stopComposer.callbackQuery('stop_cancel', async (ctx) => {
  const lang = getUserLanguage(ctx);

  await ctx.answerCallbackQuery({ text: lang === 'id' ? '✅ Dibatalkan' : '✅ Cancelled' });

  const message = lang === 'id'
    ? `✅ *Dibatalkan*

Data kamu tetap aman. Lanjut download! 🎉`
    : `✅ *Cancelled*

Your data is safe. Keep downloading! 🎉`;

  const keyboard = new InlineKeyboard()
    .text('« Menu', 'cmd:menu');

  await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
});

export { stopComposer, deleteUserData };
