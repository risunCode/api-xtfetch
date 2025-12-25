/**
 * Bot Keyboards
 * Reusable inline keyboards for Telegram bot
 */

import { InlineKeyboard } from 'grammy';
import { ADMIN_CONTACT_USERNAME } from '../config';

// ============================================================================
// Main Menu Keyboards
// ============================================================================

/**
 * Start/Main menu keyboard
 */
export function startKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 My Stats', 'stats')
    .text('⭐ Premium', 'premium')
    .row()
    .text('❓ Help', 'help')
    .text('⚙️ Settings', 'settings');
}

/**
 * Help menu keyboard
 */
export function helpKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📖 How to Use', 'help_usage')
    .text('🌐 Platforms', 'help_platforms')
    .row()
    .text('⭐ Premium Features', 'help_premium')
    .row()
    .text('« Back to Menu', 'menu');
}

/**
 * Settings keyboard
 */
export function settingsKeyboard(currentLang: string = 'en'): InlineKeyboard {
  return new InlineKeyboard()
    .text(`🌐 Language: ${currentLang.toUpperCase()}`, 'settings_language')
    .row()
    .text('« Back to Menu', 'menu');
}

/**
 * Language selection keyboard
 */
export function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🇺🇸 English', 'lang_en')
    .text('🇮🇩 Indonesia', 'lang_id')
    .row()
    .text('« Back', 'settings');
}

// ============================================================================
// Premium Keyboards
// ============================================================================

/**
 * Premium info keyboard
 */
export function premiumKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔑 I Have an API Key', 'premium_link')
    .row()
    .url(`💬 Contact Admin`, `https://t.me/${ADMIN_CONTACT_USERNAME}`)
    .row()
    .text('« Back to Menu', 'menu');
}

/**
 * Premium status keyboard (for premium users)
 */
export function premiumStatusKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Refresh Status', 'premium_refresh')
    .row()
    .text('🔓 Unlink API Key', 'premium_unlink')
    .row()
    .text('« Back to Menu', 'menu');
}

/**
 * Confirm unlink keyboard
 */
export function confirmUnlinkKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Yes, Unlink', 'premium_unlink_confirm')
    .text('❌ Cancel', 'premium');
}

/**
 * API key input cancel keyboard
 */
export function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', 'premium');
}

// ============================================================================
// Download Keyboards
// ============================================================================

/**
 * Error keyboard with retry option
 */
export function errorKeyboard(url: string): InlineKeyboard {
  // Encode URL for callback data (truncate if too long)
  const encodedUrl = url.length > 50 ? url.substring(0, 50) : url;

  return new InlineKeyboard()
    .text('🔄 Retry', `retry:${encodedUrl}`)
    .row()
    .url(`💬 Report Issue`, `https://t.me/${ADMIN_CONTACT_USERNAME}`);
}

/**
 * Download success keyboard
 */
export function downloadSuccessKeyboard(url: string): InlineKeyboard {
  return new InlineKeyboard()
    .url('🔗 Original Link', url)
    .row()
    .text('📊 My Stats', 'stats');
}

/**
 * Quality selection keyboard
 */
export function qualityKeyboard(
  qualities: Array<{ label: string; callbackData: string }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Add quality buttons (2 per row)
  for (let i = 0; i < qualities.length; i += 2) {
    if (i + 1 < qualities.length) {
      keyboard.text(qualities[i].label, qualities[i].callbackData);
      keyboard.text(qualities[i + 1].label, qualities[i + 1].callbackData);
    } else {
      keyboard.text(qualities[i].label, qualities[i].callbackData);
    }
    keyboard.row();
  }

  keyboard.text('❌ Cancel', 'cancel_download');

  return keyboard;
}

/**
 * Processing keyboard (shows cancel option)
 */
export function processingKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', 'cancel_download');
}

// ============================================================================
// Stats Keyboards
// ============================================================================

/**
 * Stats keyboard
 */
export function statsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📈 Detailed Stats', 'stats_detailed')
    .row()
    .text('📜 Download History', 'stats_history')
    .row()
    .text('« Back to Menu', 'menu');
}

/**
 * History navigation keyboard
 */
export function historyKeyboard(page: number, hasMore: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (page > 1) {
    keyboard.text('« Previous', `history_page:${page - 1}`);
  }

  if (hasMore) {
    keyboard.text('Next »', `history_page:${page + 1}`);
  }

  keyboard.row().text('« Back to Stats', 'stats');

  return keyboard;
}

// ============================================================================
// Admin Keyboards
// ============================================================================

/**
 * Admin menu keyboard
 */
export function adminKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 Bot Stats', 'admin_stats')
    .text('👥 Users', 'admin_users')
    .row()
    .text('📥 Recent Downloads', 'admin_downloads')
    .row()
    .text('📢 Broadcast', 'admin_broadcast');
}

/**
 * Admin confirm action keyboard
 */
export function adminConfirmKeyboard(action: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', `admin_confirm:${action}`)
    .text('❌ Cancel', 'admin');
}

// ============================================================================
// Utility Keyboards
// ============================================================================

/**
 * Simple back button
 */
export function backKeyboard(callbackData: string = 'menu'): InlineKeyboard {
  return new InlineKeyboard().text('« Back', callbackData);
}

/**
 * Close/dismiss keyboard
 */
export function closeKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('✖️ Close', 'close');
}

/**
 * Yes/No confirmation keyboard
 */
export function confirmKeyboard(
  yesCallback: string,
  noCallback: string = 'menu'
): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Yes', yesCallback)
    .text('❌ No', noCallback);
}
