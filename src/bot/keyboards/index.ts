/**
 * Bot Keyboards
 * Reusable inline keyboards for Telegram bot
 */

import { InlineKeyboard } from 'grammy';
import { ADMIN_CONTACT_USERNAME } from '../config';
import type { DownloadResult } from '../types';

// ============================================================================
// Quality Detection
// ============================================================================

export interface QualityInfo {
    hasHD: boolean;
    hasSD: boolean;
    hasAudio: boolean;
}

/**
 * Detect available qualities from download result
 */
export function detectQualities(result: DownloadResult): QualityInfo {
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    const audios = result.formats?.filter(f => f.type === 'audio') || [];
    
    const hasHD = videos.some(v => 
        v.quality.includes('1080') || 
        v.quality.includes('720') || 
        v.quality.toLowerCase().includes('hd')
    );
    
    const hasSD = videos.some(v => 
        v.quality.includes('480') || 
        v.quality.includes('360') || 
        v.quality.toLowerCase().includes('sd')
    ) || (videos.length > 0 && !hasHD);
    
    // Has audio if explicit audio format or any video (can extract audio)
    const hasAudio = audios.length > 0 || videos.length > 0;
    
    return { hasHD, hasSD, hasAudio };
}

// ============================================================================
// Video/YouTube Keyboards
// ============================================================================

/**
 * Build keyboard for video content with quality options
 */
export function buildVideoKeyboard(
    originalUrl: string,
    visitorId: string,
    qualities: QualityInfo
): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    
    // Row 1: Quality options
    if (qualities.hasHD) keyboard.text('🎬 HD', `dl:hd:${visitorId}`);
    if (qualities.hasSD) keyboard.text('📹 SD', `dl:sd:${visitorId}`);
    if (qualities.hasAudio) keyboard.text('🎵 Audio', `dl:audio:${visitorId}`);
    
    // Row 2: Original URL
    keyboard.row();
    keyboard.url('🔗 Original', originalUrl);
    
    return keyboard;
}

/**
 * Build keyboard for YouTube content (preview with cancel option)
 */
export function buildYouTubeKeyboard(
    originalUrl: string,
    visitorId: string,
    qualities: QualityInfo
): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    
    // Row 1: Quality options
    if (qualities.hasHD) keyboard.text('🎬 HD', `dl:hd:${visitorId}`);
    if (qualities.hasSD) keyboard.text('📹 SD', `dl:sd:${visitorId}`);
    if (qualities.hasAudio) keyboard.text('🎵 Audio', `dl:audio:${visitorId}`);
    
    // Row 2: Original URL + Cancel
    keyboard.row();
    keyboard.url('🔗 Original', originalUrl);
    keyboard.text('❌ Cancel', `dl:cancel:${visitorId}`);
    
    return keyboard;
}

/**
 * Build keyboard for photo content (just Original URL)
 */
export function buildPhotoKeyboard(originalUrl: string): InlineKeyboard {
    return new InlineKeyboard().url('🔗 Original', originalUrl);
}

// ============================================================================
// Main Menu Keyboards
// ============================================================================

/**
 * Start/Main menu keyboard
 */
export function startKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
        .text('📊 My Stats', 'cmd:mystatus')
        .text('⭐ Premium', 'cmd:premium')
        .row()
        .text('❓ Help', 'cmd:help')
        .url('🌐 Website', 'https://downaria.vercel.app');
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
        .text('« Back to Menu', 'cmd:menu');
}

/**
 * Menu keyboard
 */
export function menuKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
        .text('📊 My Status', 'cmd:mystatus')
        .text('📜 History', 'cmd:history')
        .row()
        .text('💎 Premium', 'cmd:premium')
        .text('🔒 Privacy', 'cmd:privacy')
        .row()
        .url('🌐 Website', 'https://downaria.vercel.app')
        .text('❓ Help', 'cmd:help');
}

/**
 * Settings keyboard
 */
export function settingsKeyboard(currentLang: string = 'en'): InlineKeyboard {
    return new InlineKeyboard()
        .text(`🌐 Language: ${currentLang.toUpperCase()}`, 'settings_language')
        .row()
        .text('« Back to Menu', 'cmd:menu');
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
        .text('« Back to Menu', 'cmd:menu');
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
        .text('« Back to Menu', 'cmd:menu');
}

/**
 * Confirm unlink keyboard
 */
export function confirmUnlinkKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
        .text('✅ Yes, Unlink', 'premium_unlink_confirm')
        .text('❌ Cancel', 'cmd:premium');
}

/**
 * API key input cancel keyboard
 */
export function cancelKeyboard(): InlineKeyboard {
    return new InlineKeyboard().text('❌ Cancel', 'cmd:premium');
}

// ============================================================================
// Download Keyboards
// ============================================================================

/**
 * Error keyboard with retry option
 */
export function errorKeyboard(url: string): InlineKeyboard {
    const encodedUrl = url.length > 50 ? url.substring(0, 50) : url;

    return new InlineKeyboard()
        .text('🔄 Retry', `retry:${encodedUrl}`)
        .row()
        .url(`💬 Report Issue`, `https://t.me/${ADMIN_CONTACT_USERNAME}`);
}

/**
 * Cookie error keyboard - simpler message with report to admin
 */
export function cookieErrorKeyboard(url: string, platform: string): InlineKeyboard {
    const encodedUrl = url.length > 50 ? url.substring(0, 50) : url;

    return new InlineKeyboard()
        .text('🔄 Retry', `retry:${encodedUrl}`)
        .row()
        .text('📢 Report to Admin', `report_cookie:${platform}`)
        .row()
        .url('🔗 Open in Browser', url);
}

/**
 * Download success keyboard
 */
export function downloadSuccessKeyboard(url: string): InlineKeyboard {
    return new InlineKeyboard()
        .url('🔗 Original Link', url)
        .row()
        .text('📊 My Stats', 'cmd:mystatus');
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
        .text('« Back to Menu', 'cmd:menu');
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

    keyboard.row().text('« Back to Stats', 'cmd:mystatus');

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
