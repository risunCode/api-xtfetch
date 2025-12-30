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

/** Maximum filesize Telegram can send directly (50MB) */
export const MAX_TELEGRAM_FILESIZE = 50 * 1024 * 1024; // 50MB

/** Maximum filesize for downloads (global limit - 400MB) */
export const MAX_DOWNLOAD_FILESIZE = 400 * 1024 * 1024; // 400MB

/** Maximum filesize in MB for display */
export const MAX_DOWNLOAD_FILESIZE_MB = 400;

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
    /** Video sent successfully - HD+Sound link + Origin URL */
    success: (originalUrl: string, videoUrl?: string) => {
        const kb = new InlineKeyboard();
        if (videoUrl) {
            kb.url('🔊 HD+Sound', videoUrl);
        }
        kb.url('🔗 Origin URL', originalUrl);
        return kb;
    },
    
    /** Video fallback (HD > 40MB, sent SD) - HD link + Origin URL */
    fallback: (hdUrl: string, originalUrl: string) => new InlineKeyboard()
        .url('🎬 HD', hdUrl).url('🔗 Origin URL', originalUrl),
    
    /** Photo - only Origin URL */
    photo: (originalUrl: string) => new InlineKeyboard()
        .url('🔗 Origin URL', originalUrl),
    
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
// SEND STRATEGY KEYBOARDS (Multi-Item Content)
// ═══════════════════════════════════════════════════════════════

/**
 * Build keyboard for selecting send strategy when multiple items are detected
 * Used for Instagram carousels, Facebook albums, Twitter multi-image posts, etc.
 * 
 * Callback patterns:
 * - strategy:{visitorId}:group - Send all items as album (media group)
 * - strategy:{visitorId}:single - Send items one by one
 * - strategy:{visitorId}:links - Send only download links
 * 
 * @param visitorId - Unique identifier for this download session
 * @param itemCount - Number of items detected in the content
 * @returns InlineKeyboard with strategy options
 * 
 * @example
 * // In url.ts when multiple images/videos detected:
 * if (images.length > 1) {
 *     const keyboard = buildSendStrategyKeyboard(visitorId, images.length);
 *     await ctx.reply('Multiple items detected. How would you like to receive them?', {
 *         reply_markup: keyboard
 *     });
 * }
 */
export function buildSendStrategyKeyboard(visitorId: string, itemCount: number): InlineKeyboard {
    return new InlineKeyboard()
        .text(`📦 Send as Album (${itemCount})`, `strategy:${visitorId}:group`)
        .text('📤 One by One', `strategy:${visitorId}:single`)
        .row()
        .text('🔗 Links Only', `strategy:${visitorId}:links`);
}

/**
 * Send strategy options for multi-item content
 */
export type SendStrategy = 'group' | 'single' | 'links';

/**
 * SEND_STRATEGY keyboard group for multi-item content
 * 
 * Integration points in url.ts:
 * 1. sendPhotoAlbum() - Before sending, show strategy selection
 * 2. sendMediaByType() case 'photo_album' - Intercept and show options
 * 3. sendFacebookStories() - For multiple stories
 * 
 * Example integration in sendMediaByType():
 * ```typescript
 * case 'photo_album': {
 *     const images = result.formats?.filter(f => f.type === 'image') || [];
 *     if (images.length > 1) {
 *         // Store pending multi-item download in session
 *         ctx.session.pendingMultiItem = {
 *             visitorId,
 *             result,
 *             originalUrl,
 *             itemCount: images.length,
 *             timestamp: Date.now(),
 *         };
 *         
 *         // Show strategy selection
 *         const keyboard = SEND_STRATEGY.select(visitorId, images.length);
 *         await ctx.reply(t('select_send_strategy', lang, { count: images.length }), {
 *             reply_markup: keyboard
 *         });
 *         return true;
 *     }
 *     // Single image - send directly
 *     return await sendSinglePhoto(ctx, result, originalUrl);
 * }
 * ```
 */
export const SEND_STRATEGY = {
    /** Strategy selection keyboard */
    select: buildSendStrategyKeyboard,
    
    /** Keyboard shown after strategy is selected (with cancel option) */
    processing: (strategy: SendStrategy) => {
        const labels: Record<SendStrategy, string> = {
            group: '📦 Sending as album...',
            single: '📤 Sending one by one...',
            links: '🔗 Preparing links...',
        };
        return new InlineKeyboard().text(labels[strategy], 'noop').text('❌ Cancel', 'cancel');
    },
};

// ═══════════════════════════════════════════════════════════════
// STORIES NAVIGATION KEYBOARDS
// ═══════════════════════════════════════════════════════════════

/**
 * Stories initial menu keyboard - shown when multiple stories are detected
 * Allows user to download all stories or select specific ones
 * 
 * Callback patterns:
 * - story:{visitorId}:all - Download all stories
 * - story:{visitorId}:select - Open story selection/navigation
 * - cancel - Cancel the operation
 * 
 * @param storyCount - Number of stories detected
 * @param visitorId - Unique identifier for this download session
 * @returns InlineKeyboard with story menu options
 */
export function buildStoriesMenuKeyboard(storyCount: number, visitorId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(`📥 Download Semua (${storyCount})`, `story:${visitorId}:all`)
    .row()
    .text('🔢 Pilih Story', `story:${visitorId}:select`)
    .row()
    .text('❌ Cancel', 'cancel');
}

/**
 * Stories navigation keyboard - Prev/Next navigation for browsing stories
 * Shows current position and allows downloading current or all stories
 * 
 * Callback patterns:
 * - story:{visitorId}:prev - Go to previous story
 * - story:{visitorId}:next - Go to next story
 * - story:{visitorId}:current - Download current story
 * - story:{visitorId}:all - Download all stories
 * - cancel - Cancel the operation
 * - noop - Disabled button (no operation)
 * 
 * @param visitorId - Unique identifier for this download session
 * @param currentIndex - Current story index (0-based)
 * @param totalStories - Total number of stories
 * @returns InlineKeyboard with navigation and download options
 */
export function buildStoriesNavKeyboard(
  visitorId: string,
  currentIndex: number,
  totalStories: number
): InlineKeyboard {
  const kb = new InlineKeyboard();
  
  // Prev/Next row
  if (currentIndex > 0) {
    kb.text('◀️ Prev', `story:${visitorId}:prev`);
  } else {
    kb.text('◀️', 'noop'); // disabled
  }
  
  if (currentIndex < totalStories - 1) {
    kb.text('Next ▶️', `story:${visitorId}:next`);
  } else {
    kb.text('▶️', 'noop'); // disabled
  }
  
  kb.row()
    .text('📥 Download Story Ini', `story:${visitorId}:current`)
    .row()
    .text('📥 Download Semua', `story:${visitorId}:all`)
    .row()
    .text('❌ Cancel', 'cancel');
  
  return kb;
}

// ═══════════════════════════════════════════════════════════════
// YOUTUBE QUALITY KEYBOARDS
// ═══════════════════════════════════════════════════════════════

/**
 * YouTube quality option interface
 */
export interface YouTubeQuality {
  quality: string;  // e.g., '1080p', '720p', 'm4a'
  label: string;    // e.g., '🎬 1080p', '🎵 M4A'
}

/**
 * Build YouTube quality selection keyboard
 * Displays video qualities (2 per row) and audio qualities (same row)
 * 
 * Callback patterns:
 * - yt:{visitorId}:{quality} - Select specific quality
 * - yt:{visitorId}:cancel - Cancel the operation
 * 
 * @param visitorId - Unique identifier for this download session
 * @param qualities - Array of available quality options
 * @returns InlineKeyboard with quality selection buttons
 * 
 * @example
 * const qualities: YouTubeQuality[] = [
 *   { quality: '1080p', label: '🎬 1080p' },
 *   { quality: '720p', label: '📺 720p' },
 *   { quality: 'm4a', label: '🎵 M4A' },
 * ];
 * const keyboard = buildYouTubeQualityKeyboard(visitorId, qualities);
 */
export function buildYouTubeQualityKeyboard(
  visitorId: string,
  qualities: YouTubeQuality[]
): InlineKeyboard {
  const kb = new InlineKeyboard();
  
  // Video qualities (2 per row)
  const videoQualities = qualities.filter(q => !['m4a', 'mp3'].includes(q.quality.toLowerCase()));
  const audioQualities = qualities.filter(q => ['m4a', 'mp3'].includes(q.quality.toLowerCase()));
  
  for (let i = 0; i < videoQualities.length; i += 2) {
    const q1 = videoQualities[i];
    kb.text(q1.label, `yt:${visitorId}:${q1.quality}`);
    
    if (videoQualities[i + 1]) {
      const q2 = videoQualities[i + 1];
      kb.text(q2.label, `yt:${visitorId}:${q2.quality}`);
    }
    kb.row();
  }
  
  // Audio qualities (same row)
  if (audioQualities.length > 0) {
    for (const q of audioQualities) {
      kb.text(q.label, `yt:${visitorId}:${q.quality}`);
    }
    kb.row();
  }
  
  kb.text('❌ Cancel', `yt:${visitorId}:cancel`);
  
  return kb;
}

/**
 * Helper to build quality label with emoji
 * Maps quality strings to user-friendly labels
 * 
 * @param quality - Quality string (e.g., '1080p', 'm4a')
 * @returns Formatted label with emoji (e.g., '🎬 1080p', '🎵 M4A')
 */
export function getQualityLabel(quality: string): string {
  const labels: Record<string, string> = {
    '2160p': '🎬 4K',
    '1440p': '🎬 2K',
    '1080p': '🎬 1080p',
    '720p': '📺 720p',
    '480p': '📱 480p',
    '360p': '📼 360p',
    '240p': '📼 240p',
    'm4a': '🎵 M4A',
    'mp3': '🎵 MP3',
  };
  return labels[quality.toLowerCase()] || `📥 ${quality}`;
}

// ═══════════════════════════════════════════════════════════════
// DONATE UNLINK CONFIRMATION KEYBOARD
// ═══════════════════════════════════════════════════════════════

/**
 * Build unlink confirmation keyboard for donate feature
 * Shows confirmation buttons for unlinking API key
 * 
 * Callback patterns:
 * - donate_unlink_confirm - Confirm unlink action
 * - donate_unlink_cancel - Cancel unlink action
 * 
 * @returns InlineKeyboard with confirm/cancel buttons
 */
export function buildUnlinkConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Ya, Unlink', 'donate_unlink_confirm')
    .row()
    .text('❌ Batal', 'donate_unlink_cancel');
}

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
    extractYouTubeQualities,
    type QualityInfo,
    type QualityOption,
    type DetailedQualityInfo,
    type YouTubeQualityOptions,
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
