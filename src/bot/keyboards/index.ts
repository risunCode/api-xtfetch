/**
 * Bot Keyboards
 * Reusable inline keyboards for Telegram bot
 */

import { InlineKeyboard } from 'grammy';
import { ADMIN_CONTACT_USERNAME } from '../config';
import { formatFilesize } from '../i18n';
import type { DownloadResult } from '../types';

// ============================================================================
// Quality Detection
// ============================================================================

export interface QualityInfo {
    hasHD: boolean;
    hasSD: boolean;
    hasAudio: boolean;
}

export interface QualityOption {
    available: boolean;
    label: string;      // "720p", "1080p", "480p", etc
    filesize?: number;  // bytes
}

export interface DetailedQualityInfo {
    hd: QualityOption;
    sd: QualityOption;
    audio: QualityOption;
}

/**
 * Extract resolution label from quality string
 * Returns formatted label like "720p", "1080p", etc.
 */
function extractResolutionLabel(quality: string): string {
    const q = quality.toLowerCase();
    
    // Check for specific resolutions
    if (q.includes('1080')) return '1080p';
    if (q.includes('720')) return '720p';
    if (q.includes('480')) return '480p';
    if (q.includes('360')) return '360p';
    if (q.includes('240')) return '240p';
    if (q.includes('4k') || q.includes('2160')) return '4K';
    if (q.includes('fullhd')) return '1080p';
    if (q.includes('hd')) return 'HD';
    if (q.includes('sd')) return 'SD';
    if (q.includes('high')) return 'High';
    if (q.includes('medium')) return 'Medium';
    if (q.includes('low')) return 'Low';
    if (q.includes('original')) return 'Original';
    
    return '';
}

/**
 * Detect detailed qualities from download result with resolution labels and filesizes
 */
export function detectDetailedQualities(result: DownloadResult): DetailedQualityInfo {
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    const audios = result.formats?.filter(f => f.type === 'audio') || [];
    
    // Find HD video (1080p, 720p, hd, fullhd, high, original)
    const hdVideo = videos.find(v => {
        const q = v.quality.toLowerCase();
        return q.includes('1080') || 
               q.includes('720') || 
               q.includes('hd') ||
               q.includes('fullhd') ||
               q.includes('high') ||
               q.includes('original');
    });
    
    // Find SD video (480p, 360p, sd, low, medium)
    const sdVideo = videos.find(v => {
        const q = v.quality.toLowerCase();
        return q.includes('480') || 
               q.includes('360') || 
               q.includes('sd') ||
               q.includes('low') ||
               q.includes('medium');
    }) || (videos.length > 0 && !hdVideo ? videos[videos.length - 1] : undefined);
    
    // Find audio format
    const audioFormat = audios[0] || (videos.length > 0 ? videos[0] : undefined);
    
    return {
        hd: {
            available: !!hdVideo,
            label: hdVideo ? extractResolutionLabel(hdVideo.quality) : '',
            filesize: hdVideo?.filesize,
        },
        sd: {
            available: !!sdVideo,
            label: sdVideo ? extractResolutionLabel(sdVideo.quality) : '',
            filesize: sdVideo?.filesize,
        },
        audio: {
            available: audios.length > 0 || videos.length > 0,
            label: audios.length > 0 ? 'MP3' : '',
            filesize: audioFormat?.filesize,
        },
    };
}

/**
 * Detect available qualities from download result
 * Checks various quality string formats from different scrapers
 * @deprecated Use detectDetailedQualities for more info
 */
export function detectQualities(result: DownloadResult): QualityInfo {
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    const audios = result.formats?.filter(f => f.type === 'audio') || [];
    
    // Check for HD quality - various formats from different scrapers
    const hasHD = videos.some(v => {
        const q = v.quality.toLowerCase();
        return q.includes('1080') || 
               q.includes('720') || 
               q.includes('hd') ||
               q.includes('fullhd') ||
               q.includes('high') ||
               q.includes('original');
    });
    
    // Check for SD quality - various formats
    const hasSD = videos.some(v => {
        const q = v.quality.toLowerCase();
        return q.includes('480') || 
               q.includes('360') || 
               q.includes('sd') ||
               q.includes('low') ||
               q.includes('medium');
    }) || (videos.length > 0 && !hasHD);
    
    // Has audio if explicit audio format or any video (can extract audio)
    const hasAudio = audios.length > 0 || videos.length > 0;
    
    return { hasHD, hasSD, hasAudio };
}

// ============================================================================
// Video/YouTube Keyboards
// ============================================================================

/**
 * Build quality button label with optional resolution and filesize
 * Examples: "🎬 HD (720p) 15MB", "🎬 HD (720p)", "🎬 HD 15MB", "🎬 HD"
 */
function buildQualityButtonLabel(
    icon: string,
    type: string,
    label?: string,
    filesize?: number
): string {
    let text = `${icon} ${type}`;
    
    if (label && filesize) {
        // Has resolution + filesize: "🎬 HD (720p) 15MB"
        text += ` (${label}) ${formatFilesize(filesize)}`;
    } else if (label) {
        // Has resolution only: "🎬 HD (720p)"
        text += ` (${label})`;
    } else if (filesize) {
        // Has filesize only: "🎬 HD 15MB"
        text += ` ${formatFilesize(filesize)}`;
    }
    // Neither: just "🎬 HD"
    
    return text;
}

/**
 * Build keyboard for video content with quality options
 * Supports both QualityInfo (legacy) and DetailedQualityInfo
 */
export function buildVideoKeyboard(
    originalUrl: string,
    visitorId: string,
    qualities: QualityInfo | DetailedQualityInfo
): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    
    // Check if it's DetailedQualityInfo
    const isDetailed = 'hd' in qualities && typeof qualities.hd === 'object';
    
    if (isDetailed) {
        const detailed = qualities as DetailedQualityInfo;
        
        // Row 1: Quality options with labels and filesizes
        if (detailed.hd.available) {
            keyboard.text(
                buildQualityButtonLabel('🎬', 'HD', detailed.hd.label, detailed.hd.filesize),
                `dl:hd:${visitorId}`
            );
        }
        if (detailed.sd.available) {
            keyboard.text(
                buildQualityButtonLabel('📹', 'SD', detailed.sd.label, detailed.sd.filesize),
                `dl:sd:${visitorId}`
            );
        }
        if (detailed.audio.available) {
            keyboard.text(
                buildQualityButtonLabel('🎵', 'Audio', detailed.audio.label, detailed.audio.filesize),
                `dl:audio:${visitorId}`
            );
        }
    } else {
        const simple = qualities as QualityInfo;
        
        // Row 1: Quality options (legacy)
        if (simple.hasHD) keyboard.text('🎬 HD', `dl:hd:${visitorId}`);
        if (simple.hasSD) keyboard.text('📹 SD', `dl:sd:${visitorId}`);
        if (simple.hasAudio) keyboard.text('🎵 Audio', `dl:audio:${visitorId}`);
    }
    
    // Row 2: Original URL
    keyboard.row();
    keyboard.url('🔗 Original', originalUrl);
    
    return keyboard;
}

/**
 * Build keyboard for YouTube content (preview with cancel option)
 * Supports both QualityInfo (legacy) and DetailedQualityInfo
 */
export function buildYouTubeKeyboard(
    originalUrl: string,
    visitorId: string,
    qualities: QualityInfo | DetailedQualityInfo
): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    
    // Check if it's DetailedQualityInfo
    const isDetailed = 'hd' in qualities && typeof qualities.hd === 'object';
    
    if (isDetailed) {
        const detailed = qualities as DetailedQualityInfo;
        
        // Row 1: Quality options with labels and filesizes
        if (detailed.hd.available) {
            keyboard.text(
                buildQualityButtonLabel('🎬', 'HD', detailed.hd.label, detailed.hd.filesize),
                `dl:hd:${visitorId}`
            );
        }
        if (detailed.sd.available) {
            keyboard.text(
                buildQualityButtonLabel('📹', 'SD', detailed.sd.label, detailed.sd.filesize),
                `dl:sd:${visitorId}`
            );
        }
        if (detailed.audio.available) {
            keyboard.text(
                buildQualityButtonLabel('🎵', 'Audio', detailed.audio.label, detailed.audio.filesize),
                `dl:audio:${visitorId}`
            );
        }
    } else {
        const simple = qualities as QualityInfo;
        
        // Row 1: Quality options (legacy)
        if (simple.hasHD) keyboard.text('🎬 HD', `dl:hd:${visitorId}`);
        if (simple.hasSD) keyboard.text('📹 SD', `dl:sd:${visitorId}`);
        if (simple.hasAudio) keyboard.text('🎵 Audio', `dl:audio:${visitorId}`);
    }
    
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
 * Simplified layout: [📊 My Status] [🔓 Unlink] / [« Back to Menu]
 */
export function premiumStatusKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
        .text('📊 My Status', 'cmd:mystatus')
        .text('🔓 Unlink', 'premium_unlink')
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
