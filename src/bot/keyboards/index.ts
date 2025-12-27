/**
 * Bot Keyboards - Simplified & Organized
 * 
 * Usage:
 * import { MENU, DOWNLOAD, DONATE, NAV } from '@/bot/keyboards';
 * await ctx.reply(msg, { reply_markup: MENU.main() });
 * 
 * Groups:
 * - NAV: Navigation keyboards (back, refresh)
 * - MENU: Main menu keyboards (start, main, help, privacy)
 * - DOWNLOAD: Download-related keyboards (success, fallback, error)
 * - DONATE: Donate feature keyboards (info, status, unlink)
 * - STATUS: User status keyboards (free, history)
 * - ADMIN: Admin keyboards (confirm, premium duration)
 * 
 * Callback patterns:
 * - donate_link: User wants to link API key
 * - donate_unlink: User wants to unlink API key
 * - donate_unlink_confirm: Confirm unlink action
 * - donate_enter_key: User ready to enter API key
 */

import { InlineKeyboard } from 'grammy';
import { ADMIN_CONTACT_USERNAME } from '../config';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const WEBSITE_URL = 'https://downaria.vercel.app';

/** Maximum filesize Telegram can send directly (40MB) */
export const MAX_TELEGRAM_FILESIZE = 40 * 1024 * 1024; // 40MB

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════

export const NAV = {
    /** Back to main menu */
    backToMenu: () => new InlineKeyboard().text('« Menu', 'cmd:menu'),
    
    /** Generic back button */
    back: (label: string, callback: string) => new InlineKeyboard().text(`« ${label}`, callback),
    
    /** Refresh button */
    refresh: (callback: string) => new InlineKeyboard().text('🔄 Refresh', callback),
    
    /** Close/dismiss button */
    close: () => new InlineKeyboard().text('✖️ Close', 'close'),
};

// ═══════════════════════════════════════════════════════════════
// MENU KEYBOARDS
// ═══════════════════════════════════════════════════════════════

export const MENU = {
    /** Main menu - /menu */
    main: () => new InlineKeyboard()
        .text('📊 My Status', 'cmd:mystatus').text('💝 Donasi', 'cmd:donate').row()
        .text('🔒 Privacy', 'cmd:privacy').text('❓ Help', 'cmd:help').row()
        .url('🌐 Website', WEBSITE_URL),
    
    /** Start menu - /start (slightly different from main) */
    start: () => new InlineKeyboard()
        .text('📊 My Stats', 'cmd:mystatus').text('💝 Donasi', 'cmd:donate').row()
        .text('❓ Help', 'cmd:help').url('🌐 Website', WEBSITE_URL),
    
    /** Help menu - /help */
    help: () => new InlineKeyboard()
        .text('📖 How to Use', 'help_usage').text('🌐 Platforms', 'help_platforms').row()
        .text('💝 Donasi', 'cmd:donate').row()
        .text('« Back to Menu', 'cmd:menu'),
    
    /** Privacy menu - /privacy */
    privacy: () => new InlineKeyboard()
        .url('🌐 Website', WEBSITE_URL).text('📋 Menu', 'cmd:menu'),
    
    /** Settings menu */
    settings: (currentLang: string = 'en') => new InlineKeyboard()
        .text(`🌐 Language: ${currentLang.toUpperCase()}`, 'settings_language').row()
        .text('« Back to Menu', 'cmd:menu'),
    
    /** Language selection */
    language: () => new InlineKeyboard()
        .text('🇺🇸 English', 'lang_en').text('🇮🇩 Indonesia', 'lang_id').row()
        .text('« Back', 'settings'),
};

// ═══════════════════════════════════════════════════════════════
// DOWNLOAD KEYBOARDS
// ═══════════════════════════════════════════════════════════════

export const DOWNLOAD = {
    /** Video sent successfully - only Original URL */
    success: (originalUrl: string) => new InlineKeyboard()
        .url('🔗 Original', originalUrl),
    
    /** Video fallback (HD > 40MB, sent SD) - HD link + Original */
    fallback: (hdUrl: string, originalUrl: string) => new InlineKeyboard()
        .url('🎬 HD', hdUrl).url('🔗 Original', originalUrl),
    
    /** Photo - only Original URL */
    photo: (originalUrl: string) => new InlineKeyboard()
        .url('🔗 Original', originalUrl),
    
    /** Download success with stats link */
    successWithStats: (url: string) => new InlineKeyboard()
        .url('🔗 Original Link', url).row()
        .text('📊 My Stats', 'cmd:mystatus'),
    
    /** Processing - shows cancel option */
    processing: () => new InlineKeyboard()
        .text('❌ Cancel', 'cancel_download'),
    
    /** Error with retry */
    error: (url: string) => {
        const encodedUrl = url.length > 50 ? url.substring(0, 50) : url;
        return new InlineKeyboard()
            .text('🔄 Retry', `retry:${encodedUrl}`).row()
            .url('💬 Report Issue', `https://t.me/${ADMIN_CONTACT_USERNAME}`);
    },
    
    /** Cookie error - retry + report + browser link */
    cookieError: (url: string, platform: string) => {
        const encodedUrl = url.length > 50 ? url.substring(0, 50) : url;
        return new InlineKeyboard()
            .text('🔄 Retry', `retry:${encodedUrl}`).row()
            .text('📢 Report to Admin', `report_cookie:${platform}`).row()
            .url('🔗 Open in Browser', url);
    },
};

// ═══════════════════════════════════════════════════════════════
// DONATE KEYBOARDS (was PREMIUM)
// ═══════════════════════════════════════════════════════════════

export const DONATE = {
    /** Non-donator user - donate or enter key */
    info: () => new InlineKeyboard()
        .text('🔑 Punya API Key', 'donate_link').row()
        .url('💬 Hubungi Admin', `https://t.me/${ADMIN_CONTACT_USERNAME}`).row()
        .text('« Menu', 'cmd:menu'),
    
    /** Donator status */
    status: () => new InlineKeyboard()
        .text('📊 Status', 'cmd:mystatus').text('🔓 Unlink', 'donate_unlink').row()
        .text('« Menu', 'cmd:menu'),
    
    /** Confirm unlink */
    confirmUnlink: () => new InlineKeyboard()
        .text('✅ Ya, Unlink', 'donate_unlink_confirm').text('❌ Batal', 'cmd:donate'),
    
    /** Cancel API key input */
    cancel: () => new InlineKeyboard()
        .text('❌ Batal', 'cmd:donate'),
    
    /** Contact admin for donation */
    contact: () => new InlineKeyboard()
        .url('💬 Hubungi Admin', `https://t.me/${ADMIN_CONTACT_USERNAME}`).row()
        .text('✅ Sudah Donasi', 'donate_enter_key').row()
        .text('« Back', 'cmd:donate'),
    
    /** Limit exceeded - show donate option */
    limitExceeded: (resetTimeStr: string) => new InlineKeyboard()
        .text('💝 Donasi', 'cmd:donate').url('🌐 Website', WEBSITE_URL),
};



// ═══════════════════════════════════════════════════════════════
// STATUS KEYBOARDS
// ═══════════════════════════════════════════════════════════════

export const STATUS = {
    /** Free user stats */
    free: () => new InlineKeyboard()
        .text('📈 Detailed Stats', 'stats_detailed').row()
        .text('📜 Download History', 'stats_history').row()
        .text('« Back to Menu', 'cmd:menu'),
    
    /** History with refresh */
    history: () => new InlineKeyboard()
        .text('🔄 Refresh', 'history_refresh'),
    
    /** History with pagination */
    historyPaginated: (page: number, hasMore: boolean) => {
        const kb = new InlineKeyboard();
        if (page > 1) kb.text('« Previous', `history_page:${page - 1}`);
        if (hasMore) kb.text('Next »', `history_page:${page + 1}`);
        kb.row().text('« Back to Stats', 'cmd:mystatus');
        return kb;
    },
    
    /** Service status with refresh */
    service: () => new InlineKeyboard()
        .text('🔄 Refresh', 'status_refresh'),
};

// ═══════════════════════════════════════════════════════════════
// ADMIN KEYBOARDS
// ═══════════════════════════════════════════════════════════════

export const ADMIN = {
    /** Admin main menu */
    menu: () => new InlineKeyboard()
        .text('📊 Bot Stats', 'admin_stats').text('👥 Users', 'admin_users').row()
        .text('📥 Recent Downloads', 'admin_downloads').row()
        .text('📢 Broadcast', 'admin_broadcast'),
    
    /** Confirm action */
    confirm: (action: string) => new InlineKeyboard()
        .text('✅ Confirm', `admin_confirm:${action}`).text('❌ Cancel', 'admin'),
    
    /** Give premium duration selection */
    premiumDuration: (userId: number) => new InlineKeyboard()
        .text('7 Days', `gp_give_${userId}_7`).text('30 Days', `gp_give_${userId}_30`).row()
        .text('90 Days', `gp_give_${userId}_90`).text('365 Days', `gp_give_${userId}_365`).row()
        .text('♾️ Lifetime', `gp_give_${userId}_-1`),
    
    /** Yes/No confirmation */
    yesNo: (yesCallback: string, noCallback: string = 'menu') => new InlineKeyboard()
        .text('✅ Yes', yesCallback).text('❌ No', noCallback),
};

// ═══════════════════════════════════════════════════════════════
// RE-EXPORT LEGACY FUNCTIONS
// These are used in url.ts and other handlers
// ═══════════════════════════════════════════════════════════════

export { 
    detectDetailedQualities, 
    detectQualities,
    buildVideoKeyboard, 
    buildYouTubeKeyboard,
    type QualityInfo,
    type QualityOption,
    type DetailedQualityInfo,
} from './legacy';

// ═══════════════════════════════════════════════════════════════
// LEGACY EXPORTS (for backward compatibility during migration)
// TODO: Remove after all commands are updated to use grouped exports
// ═══════════════════════════════════════════════════════════════

/** @deprecated Use MENU.start() */
export const startKeyboard = MENU.start;

/** @deprecated Use MENU.main() */
export const menuKeyboard = MENU.main;

/** @deprecated Use MENU.help() */
export const helpKeyboard = MENU.help;

/** @deprecated Use MENU.settings() */
export const settingsKeyboard = MENU.settings;

/** @deprecated Use MENU.language() */
export const languageKeyboard = MENU.language;

/** Alias for DONATE.status() - used in donate command */
export const donatorStatusKeyboard = DONATE.status;

/** @deprecated Use DONATE.confirmUnlink() */
export const confirmUnlinkKeyboard = DONATE.confirmUnlink;

/** @deprecated Use DONATE.cancel() */
export const cancelKeyboard = DONATE.cancel;

/** @deprecated Use DONATE.limitExceeded() */
export const donateKeyboard = DONATE.limitExceeded;

/** @deprecated Use DOWNLOAD.error() */
export const errorKeyboard = DOWNLOAD.error;

/** @deprecated Use DOWNLOAD.cookieError() */
export const cookieErrorKeyboard = DOWNLOAD.cookieError;

/** @deprecated Use DOWNLOAD.photo() */
export const buildPhotoKeyboard = DOWNLOAD.photo;

/** @deprecated Use DOWNLOAD.success() */
export const buildVideoSuccessKeyboard = DOWNLOAD.success;

/** @deprecated Use DOWNLOAD.fallback() */
export const buildVideoFallbackKeyboard = DOWNLOAD.fallback;

/** @deprecated Use DOWNLOAD.successWithStats() */
export const downloadSuccessKeyboard = DOWNLOAD.successWithStats;

/** @deprecated Use DOWNLOAD.processing() */
export const processingKeyboard = DOWNLOAD.processing;

/** @deprecated Use STATUS.free() */
export const statsKeyboard = STATUS.free;

/** @deprecated Use STATUS.historyPaginated() */
export const historyKeyboard = STATUS.historyPaginated;

/** @deprecated Use ADMIN.menu() */
export const adminKeyboard = ADMIN.menu;

/** @deprecated Use ADMIN.confirm() */
export const adminConfirmKeyboard = ADMIN.confirm;

/** @deprecated Use NAV.back() */
export const backKeyboard = (callbackData: string = 'menu') => 
    new InlineKeyboard().text('« Back', callbackData);

/** @deprecated Use NAV.close() */
export const closeKeyboard = NAV.close;

/** @deprecated Use ADMIN.yesNo() */
export const confirmKeyboard = ADMIN.yesNo;
