/**
 * YouTube Extractor
 * 
 * Parses yt-dlp JSON output and extracts normalized formats.
 * Handles format filtering, quality selection, and metadata extraction.
 * 
 * @module youtube/extractor
 */

import type { MediaFormat } from '@/lib/types';
import { formatBytes } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Raw format from yt-dlp output
 */
export interface YtDlpFormat {
    format_id: string;
    ext: string;
    url: string;
    width?: number;
    height?: number;
    filesize?: number;
    filesize_approx?: number;
    vcodec?: string;
    acodec?: string;
    tbr?: number;
    abr?: number;
    fps?: number;
    quality?: string;
}

/**
 * Raw yt-dlp JSON output structure
 */
export interface YtDlpOutput {
    id: string;
    title: string;
    uploader: string;
    thumbnail: string;
    description?: string;
    upload_date?: string;
    view_count?: number;
    like_count?: number;
    duration?: number;
    formats: YtDlpFormat[];
}

/**
 * Extracted metadata from yt-dlp output
 */
export interface ExtractedMetadata {
    title: string;
    author: string;
    thumbnail: string;
    description?: string;
    postedAt?: string;
    engagement?: {
        views?: number;
        likes?: number;
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Target resolutions to keep (in pixels) */
const TARGET_HEIGHTS = [1080, 720, 480, 360];

/** Maximum number of formats to return */
const MAX_FORMATS = 10;

/** Typical bitrates for YouTube video streams (in kbps) for estimation */
const VIDEO_BITRATES: Record<number, number> = {
    2160: 8000,   // 4K
    1440: 4000,   // 2K
    1080: 2000,   // FHD
    720: 1200,    // HD
    480: 600,     // SD
    360: 350,     // Low
};

/** Audio bitrate for estimation (kbps) */
const AUDIO_BITRATE = 128;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checks if format has video codec
 */
function hasVideo(format: YtDlpFormat): boolean {
    return !!format.vcodec && format.vcodec !== 'none';
}

/**
 * Checks if format has audio codec
 */
function hasAudio(format: YtDlpFormat): boolean {
    return !!format.acodec && format.acodec !== 'none';
}

/**
 * Checks if format is combined (has both video and audio)
 */
function isCombined(format: YtDlpFormat): boolean {
    return hasVideo(format) && hasAudio(format);
}

/**
 * Checks if format is video-only (needs audio merge)
 */
function isVideoOnly(format: YtDlpFormat): boolean {
    return hasVideo(format) && !hasAudio(format);
}

/**
 * Checks if format is audio-only
 */
function isAudioOnly(format: YtDlpFormat): boolean {
    return hasAudio(format) && !hasVideo(format);
}

/**
 * Gets filesize from format (actual or approximate)
 */
function getFilesize(format: YtDlpFormat): number | undefined {
    if (format.filesize && format.filesize > 0) return format.filesize;
    if (format.filesize_approx && format.filesize_approx > 0) return format.filesize_approx;
    return undefined;
}

/**
 * Estimates filesize based on resolution and duration
 */
function estimateFilesize(height: number, duration: number, includeAudio: boolean): number {
    const heights = Object.keys(VIDEO_BITRATES).map(Number).sort((a, b) => b - a);
    let videoBitrate = VIDEO_BITRATES[360];
    
    for (const h of heights) {
        if (height >= h) {
            videoBitrate = VIDEO_BITRATES[h];
            break;
        }
    }
    
    const totalBitrate = videoBitrate + (includeAudio ? AUDIO_BITRATE : 0);
    return Math.round((totalBitrate * duration * 1000) / 8);
}

/**
 * Finds the closest target height for a given resolution
 */
function findClosestTargetHeight(height: number): number | null {
    for (const target of TARGET_HEIGHTS) {
        if (height >= target - 50) return target; // Allow 50px tolerance
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts and filters formats from yt-dlp output
 * 
 * Rules:
 * 1. Prefer formats with both video AND audio (no merge needed)
 * 2. Keep only: 1080p, 720p, 480p, 360p, audio-only
 * 3. Max 10 formats total
 * 4. Sort by quality (highest first)
 */
export function extractFormats(output: YtDlpOutput): MediaFormat[] {
    const rawFormats = output.formats.filter(f => f.url);
    const duration = output.duration || 0;
    const formats: MediaFormat[] = [];
    
    // Separate formats by type
    const combinedFormats = rawFormats.filter(isCombined);
    const videoOnlyFormats = rawFormats.filter(isVideoOnly);
    const audioOnlyFormats = rawFormats.filter(isAudioOnly);
    
    // Get best audio for merging
    const bestAudio = audioOnlyFormats
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    
    // Track which heights we've added
    const addedHeights = new Set<number>();
    
    // 1. Process combined formats first (preferred - no merge needed)
    const sortedCombined = combinedFormats
        .filter(f => f.height && f.height >= 360)
        .sort((a, b) => (b.height || 0) - (a.height || 0));
    
    for (const format of sortedCombined) {
        const targetHeight = findClosestTargetHeight(format.height!);
        if (!targetHeight || addedHeights.has(targetHeight)) continue;
        
        const actualSize = getFilesize(format);
        const filesize = actualSize || (duration ? estimateFilesize(format.height!, duration, true) : undefined);
        
        formats.push({
            quality: `${targetHeight}p`,
            type: 'video',
            url: format.url,
            format: format.ext || 'mp4',
            width: format.width,
            height: format.height,
            filesize,
            fileSize: filesize ? formatBytes(filesize) : undefined,
            filesizeEstimated: !actualSize && !!filesize,
        });
        
        addedHeights.add(targetHeight);
    }
    
    // 2. Fill missing resolutions with video-only formats (need merge)
    if (bestAudio) {
        const sortedVideoOnly = videoOnlyFormats
            .filter(f => f.height && f.height >= 360)
            .sort((a, b) => (b.height || 0) - (a.height || 0));
        
        // Group by height, prefer mp4 over webm
        const byHeight = new Map<number, YtDlpFormat>();
        for (const format of sortedVideoOnly) {
            const targetHeight = findClosestTargetHeight(format.height!);
            if (!targetHeight || addedHeights.has(targetHeight)) continue;
            
            const existing = byHeight.get(targetHeight);
            if (!existing) {
                byHeight.set(targetHeight, format);
            } else if (format.ext === 'mp4' && existing.ext !== 'mp4') {
                byHeight.set(targetHeight, format);
            }
        }
        
        for (const [targetHeight, format] of byHeight) {
            const videoSize = getFilesize(format);
            const audioSize = getFilesize(bestAudio);
            
            let filesize: number | undefined;
            let isEstimated = false;
            
            if (videoSize && audioSize) {
                filesize = videoSize + audioSize;
            } else if (videoSize) {
                const estimatedAudio = duration ? Math.round((AUDIO_BITRATE * duration * 1000) / 8) : Math.round(videoSize * 0.1);
                filesize = videoSize + estimatedAudio;
                isEstimated = true;
            } else if (duration) {
                filesize = estimateFilesize(format.height!, duration, true);
                isEstimated = true;
            }
            
            formats.push({
                quality: `${targetHeight}p`,
                type: 'video',
                url: format.url,
                format: 'mp4', // Output as mp4 after merge
                width: format.width,
                height: format.height,
                filesize,
                fileSize: filesize ? formatBytes(filesize) : undefined,
                filesizeEstimated: isEstimated,
                needsMerge: true,
                audioUrl: bestAudio.url,
            });
            
            addedHeights.add(targetHeight);
        }
    }
    
    // 3. Add audio-only formats
    if (audioOnlyFormats.length > 0) {
        const bestAudioFormat = audioOnlyFormats
            .filter(f => f.abr && f.abr > 0)
            .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
        
        if (bestAudioFormat) {
            const actualSize = getFilesize(bestAudioFormat);
            const bitrate = Math.round(bestAudioFormat.abr || 128);
            const audioFilesize = actualSize || (duration ? Math.round((bitrate * duration * 1000) / 8) : undefined);
            
            // M4A format (best quality)
            formats.push({
                quality: 'M4A',
                type: 'audio',
                url: bestAudioFormat.url,
                format: 'm4a',
                filesize: audioFilesize,
                fileSize: audioFilesize ? formatBytes(audioFilesize) : undefined,
                filesizeEstimated: !actualSize && !!audioFilesize,
            });
            
            // MP3 format (most compatible, converted)
            formats.push({
                quality: 'MP3',
                type: 'audio',
                url: bestAudioFormat.url,
                format: 'mp3',
                filesize: audioFilesize ? Math.round(audioFilesize * 0.9) : undefined,
                fileSize: audioFilesize ? formatBytes(Math.round(audioFilesize * 0.9)) : undefined,
                filesizeEstimated: true,
            });
        }
    }
    
    // 4. Sort by quality (video first by height desc, then audio)
    formats.sort((a, b) => {
        if (a.type === 'audio' && b.type !== 'audio') return 1;
        if (a.type !== 'audio' && b.type === 'audio') return -1;
        return (b.height || 0) - (a.height || 0);
    });
    
    // 5. Limit to max formats
    return formats.slice(0, MAX_FORMATS);
}

/**
 * Extracts metadata from yt-dlp output
 */
export function extractMetadata(output: YtDlpOutput): ExtractedMetadata {
    return {
        title: output.title,
        author: output.uploader,
        thumbnail: output.thumbnail,
        description: output.description,
        postedAt: output.upload_date ? formatUploadDate(output.upload_date) : undefined,
        engagement: {
            views: output.view_count,
            likes: output.like_count,
        },
    };
}

/**
 * Formats yt-dlp upload_date (YYYYMMDD) to ISO date string
 */
function formatUploadDate(date: string): string {
    if (date.length !== 8) return date;
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}
