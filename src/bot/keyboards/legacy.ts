/**
 * Legacy Keyboard Functions
 * 
 * These functions are kept for backward compatibility during migration.
 * They will be removed after all commands are updated to use the new grouped exports.
 * 
 * @deprecated Use grouped exports from index.ts instead:
 * - MENU.main(), MENU.start(), MENU.help()
 * - DOWNLOAD.success(), DOWNLOAD.fallback(), DOWNLOAD.youtube()
 * - PREMIUM.info(), PREMIUM.status()
 * - etc.
 */

import { InlineKeyboard } from 'grammy';
import { formatFilesize } from '../i18n';
import type { DownloadResult } from '../types';

// ============================================================================
// Types
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

/** All available quality options for YouTube */
export interface YouTubeQualityOptions {
    qualities: Array<{
        resolution: string;  // "1080p", "720p", "480p", "360p"
        label: string;       // Display label
        filesize?: number;   // bytes
        type: 'video' | 'audio';
    }>;
}

// ============================================================================
// Quality Detection
// ============================================================================

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
 * Build quality button label with optional resolution
 * For YouTube: hide filesize (estimated, changes after merge)
 * Examples: "🎬 HD (720p)", "🎬 HD", "📹 SD (480p)"
 */
function buildQualityButtonLabel(
    icon: string,
    type: string,
    label?: string,
    _filesize?: number, // Ignored - filesize hidden from buttons
    _isYouTube: boolean = false // Reserved for future use
): string {
    let text = `${icon} ${type}`;
    
    // Only show resolution label, NOT filesize
    // Filesize is estimated and changes after merge/compression
    if (label) {
        text += ` (${label})`;
    }
    
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
 * Extract all available YouTube qualities from download result
 * Returns all video qualities (1080p, 720p, 480p, 360p) and audio option
 */
export function extractYouTubeQualities(result: DownloadResult): YouTubeQualityOptions {
    const videos = result.formats?.filter(f => f.type === 'video') || [];
    const audios = result.formats?.filter(f => f.type === 'audio') || [];
    
    const qualities: YouTubeQualityOptions['qualities'] = [];
    
    // Define quality priority order
    const qualityOrder = ['1080p', '720p', '480p', '360p'];
    
    for (const targetQuality of qualityOrder) {
        const video = videos.find(v => {
            const q = v.quality.toLowerCase();
            return q.includes(targetQuality.replace('p', ''));
        });
        
        if (video) {
            qualities.push({
                resolution: targetQuality,
                label: targetQuality,
                filesize: video.filesize,
                type: 'video',
            });
        }
    }
    
    // If no specific qualities found, check for generic HD/SD
    if (qualities.length === 0) {
        const hdVideo = videos.find(v => {
            const q = v.quality.toLowerCase();
            return q.includes('hd') || q.includes('high') || q.includes('original');
        });
        if (hdVideo) {
            qualities.push({
                resolution: 'HD',
                label: extractResolutionLabel(hdVideo.quality) || 'HD',
                filesize: hdVideo.filesize,
                type: 'video',
            });
        }
        
        const sdVideo = videos.find(v => {
            const q = v.quality.toLowerCase();
            return q.includes('sd') || q.includes('low') || q.includes('medium');
        });
        if (sdVideo) {
            qualities.push({
                resolution: 'SD',
                label: extractResolutionLabel(sdVideo.quality) || 'SD',
                filesize: sdVideo.filesize,
                type: 'video',
            });
        }
    }
    
    // Add audio option (from audio formats or first video for extraction)
    const audioFormat = audios[0];
    if (audioFormat || videos.length > 0) {
        qualities.push({
            resolution: 'audio',
            label: 'MP3',
            filesize: audioFormat?.filesize,
            type: 'audio',
        });
    }
    
    return { qualities };
}

/**
 * Build quality button label with filesize for YouTube
 * Examples: "🎬 1080p (25MB)", "🎵 Audio (3.5MB)"
 */
function buildYouTubeQualityLabel(
    icon: string,
    label: string,
    filesize?: number
): string {
    let text = `${icon} ${label}`;
    
    // Show filesize if available
    if (filesize && filesize > 0) {
        text += ` (${formatFilesize(filesize)})`;
    }
    
    return text;
}

/**
 * Build keyboard for YouTube content showing all available qualities
 * Shows all quality options (1080p, 720p, 480p, 360p, audio) with filesizes
 */
export function buildYouTubeKeyboard(
    originalUrl: string,
    visitorId: string,
    qualities: QualityInfo | DetailedQualityInfo,
    result?: DownloadResult
): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    
    // If result is provided, extract all YouTube qualities
    if (result) {
        const ytQualities = extractYouTubeQualities(result);
        
        // Add video quality buttons (2 per row)
        let buttonCount = 0;
        for (const quality of ytQualities.qualities) {
            if (quality.type === 'video') {
                const icon = quality.resolution === '1080p' || quality.resolution === '720p' || quality.resolution === 'HD' 
                    ? '🎬' : '📹';
                const callbackQuality = quality.resolution.toLowerCase().replace('p', '');
                
                keyboard.text(
                    buildYouTubeQualityLabel(icon, quality.label, quality.filesize),
                    `dl:${callbackQuality}:${visitorId}`
                );
                buttonCount++;
                
                // New row after every 2 buttons
                if (buttonCount % 2 === 0) {
                    keyboard.row();
                }
            }
        }
        
        // Add audio button on new row if we have odd number of video buttons
        const audioQuality = ytQualities.qualities.find(q => q.type === 'audio');
        if (audioQuality) {
            if (buttonCount % 2 !== 0) {
                keyboard.row();
            }
            keyboard.text(
                buildYouTubeQualityLabel('🎵', 'Audio', audioQuality.filesize),
                `dl:audio:${visitorId}`
            );
        }
    } else {
        // Fallback to legacy behavior if no result provided
        const isDetailed = 'hd' in qualities && typeof qualities.hd === 'object';
        
        if (isDetailed) {
            const detailed = qualities as DetailedQualityInfo;
            
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
            
            if (simple.hasHD) keyboard.text('🎬 HD', `dl:hd:${visitorId}`);
            if (simple.hasSD) keyboard.text('📹 SD', `dl:sd:${visitorId}`);
            if (simple.hasAudio) keyboard.text('🎵 Audio', `dl:audio:${visitorId}`);
        }
    }
    
    // Row: Original URL + Cancel
    keyboard.row();
    keyboard.url('🔗 Original', originalUrl);
    keyboard.text('❌ Cancel', `dl:cancel:${visitorId}`);
    
    return keyboard;
}
