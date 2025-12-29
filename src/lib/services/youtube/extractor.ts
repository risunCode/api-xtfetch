/**
 * YouTube Extractor
 * 
 * Parses yt-dlp JSON output and extracts normalized formats.
 * Prioritizes video-only + audio (smaller filesize) over combined formats.
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
    tbr?: number;  // Total bitrate (kbps) - used for accurate filesize calculation
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
    author?: string;
    uploader?: string;
    channel?: string;
    uploader_id?: string;
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

/** Typical bitrates for estimation (kbps) */
const VIDEO_BITRATES: Record<number, number> = {
    2160: 8000, 1440: 4000, 1080: 2000, 720: 1200, 480: 600, 360: 350,
};
const AUDIO_BITRATE = 128;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function hasVideo(f: YtDlpFormat): boolean {
    return !!f.vcodec && f.vcodec !== 'none';
}

function hasAudio(f: YtDlpFormat): boolean {
    return !!f.acodec && f.acodec !== 'none';
}

function isVideoOnly(f: YtDlpFormat): boolean {
    return hasVideo(f) && !hasAudio(f);
}

function isAudioOnly(f: YtDlpFormat): boolean {
    return hasAudio(f) && !hasVideo(f);
}

function isCombined(f: YtDlpFormat): boolean {
    return hasVideo(f) && hasAudio(f);
}

/**
 * Get filesize - priority: exact > tbr calculation > approx
 * Formula: filesize = (tbr_kbps * 1000 * duration) / 8
 */
function getFilesize(f: YtDlpFormat, duration?: number): number | undefined {
    if (f.filesize && f.filesize > 0) return f.filesize;
    if (f.tbr && f.tbr > 0 && duration && duration > 0) {
        return Math.round((f.tbr * 1000 * duration) / 8);
    }
    if (f.filesize_approx && f.filesize_approx > 0) return f.filesize_approx;
    return undefined;
}

function estimateFilesize(height: number, duration: number, includeAudio: boolean): number {
    let bitrate = VIDEO_BITRATES[360];
    for (const h of Object.keys(VIDEO_BITRATES).map(Number).sort((a, b) => b - a)) {
        if (height >= h) { bitrate = VIDEO_BITRATES[h]; break; }
    }
    const total = bitrate + (includeAudio ? AUDIO_BITRATE : 0);
    return Math.round((total * 1000 * duration) / 8);
}

function findTargetHeight(height: number): number | null {
    // Map actual height to target quality label
    // Only match if height is close to target (within reasonable range)
    for (const target of TARGET_HEIGHTS) {
        // Match if height is within target range:
        // - 1080p: 1030-1180 (allows 1080, but not 1440)
        // - 720p: 670-820
        // - 480p: 430-580
        // - 360p: 310-460
        const minHeight = target - 50;
        const maxHeight = target + 100;
        if (height >= minHeight && height <= maxHeight) return target;
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract formats from yt-dlp output
 * 
 * Priority:
 * 1. Video-only + best audio (smaller filesize, same quality)
 * 2. Combined formats as fallback
 * 3. NO HDR/fps filtering - accept all formats
 */
export function extractFormats(output: YtDlpOutput): MediaFormat[] {
    const rawFormats = output.formats.filter(f => f.url);
    const duration = output.duration || 0;
    const formats: MediaFormat[] = [];
    const addedHeights = new Set<number>();
    
    // Separate by type
    const videoOnly = rawFormats.filter(isVideoOnly);
    const audioOnly = rawFormats.filter(isAudioOnly);
    const combined = rawFormats.filter(isCombined);
    
    // Get best audio (prefer m4a for compatibility)
    const bestAudio = audioOnly
        .filter(f => f.ext === 'm4a' || f.ext === 'mp4')
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0]
        || audioOnly.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
    
    // 1. PRIORITY: Video-only + audio
    // Strategy: Prefer av01 (AV1) - smaller size, good quality, will be merged to mp4/h264
    // Fallback to avc1 (H.264) if no av01 available
    // Skip vp9 - too large
    if (bestAudio) {
        // Group by height, prefer av01 (smaller) > avc1 (fallback), skip vp9
        const byHeight = new Map<number, YtDlpFormat>();
        
        for (const f of videoOnly.filter(f => f.height && f.height >= 360)) {
            const target = findTargetHeight(f.height!);
            if (!target) continue;
            
            const existing = byHeight.get(target);
            const vcodec = (f.vcodec || '').toLowerCase();
            const existVcodec = existing ? (existing.vcodec || '').toLowerCase() : '';
            
            // Skip vp9 - too large
            if (vcodec.startsWith('vp9') || vcodec.startsWith('vp09')) continue;
            
            // Codec priority: av01 (AV1) > avc1 (H.264)
            // av01 = smaller size, good quality
            // avc1 = fallback, compatible
            const getCodecPriority = (codec: string): number => {
                if (codec.startsWith('av01') || codec.startsWith('av1')) return 2; // AV1 - preferred (smaller)
                if (codec.startsWith('avc1') || codec.startsWith('avc')) return 1; // H.264 - fallback
                return 0;
            };
            
            if (!existing) {
                byHeight.set(target, f);
            } else {
                const existPriority = getCodecPriority(existVcodec);
                const newPriority = getCodecPriority(vcodec);
                
                if (newPriority > existPriority) {
                    // Better codec (av01 over avc1)
                    byHeight.set(target, f);
                } else if (newPriority === existPriority) {
                    // Same codec, prefer higher bitrate for better quality
                    const existTbr = existing.tbr || 0;
                    const newTbr = f.tbr || 0;
                    if (newTbr > existTbr) {
                        byHeight.set(target, f);
                    }
                }
            }
        }
        
        // Add video-only formats
        for (const [height, f] of byHeight) {
            const videoSize = getFilesize(f, duration);
            const audioSize = getFilesize(bestAudio, duration);
            
            let filesize: number | undefined;
            if (videoSize && audioSize) {
                filesize = videoSize + audioSize;
            } else if (videoSize) {
                const audioBitrate = bestAudio.abr || AUDIO_BITRATE;
                filesize = videoSize + Math.round((audioBitrate * 1000 * duration) / 8);
            } else if (duration) {
                filesize = estimateFilesize(f.height!, duration, true);
            }
            
            formats.push({
                quality: `${height}p`,
                type: 'video',
                url: f.url,
                format: 'mp4',
                width: f.width,
                height: f.height,
                filesize,
                fileSize: filesize ? formatBytes(filesize) : undefined,
                filesizeEstimated: !f.filesize,
                needsMerge: true,
                audioUrl: bestAudio.url,
            });
            
            addedHeights.add(height);
        }
    }
    
    // 2. FALLBACK: Combined formats for missing resolutions
    for (const f of combined.filter(f => f.height && f.height >= 360).sort((a, b) => (b.height || 0) - (a.height || 0))) {
        const target = findTargetHeight(f.height!);
        if (!target || addedHeights.has(target)) continue;
        
        const filesize = getFilesize(f, duration) || (duration ? estimateFilesize(f.height!, duration, true) : undefined);
        
        formats.push({
            quality: `${target}p`,
            type: 'video',
            url: f.url,
            format: f.ext || 'mp4',
            width: f.width,
            height: f.height,
            filesize,
            fileSize: filesize ? formatBytes(filesize) : undefined,
            filesizeEstimated: !f.filesize,
        });
        
        addedHeights.add(target);
    }
    
    // 3. Audio formats
    if (audioOnly.length > 0) {
        const best = audioOnly.filter(f => f.abr).sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
        if (best) {
            const size = getFilesize(best, duration);
            
            formats.push({
                quality: 'M4A',
                type: 'audio',
                url: best.url,
                format: 'm4a',
                filesize: size,
                fileSize: size ? formatBytes(size) : undefined,
                filesizeEstimated: !best.filesize,
            });
            
            formats.push({
                quality: 'MP3',
                type: 'audio',
                url: best.url,
                format: 'mp3',
                filesize: size ? Math.round(size * 0.9) : undefined,
                fileSize: size ? formatBytes(Math.round(size * 0.9)) : undefined,
                filesizeEstimated: true,
            });
        }
    }
    
    // Sort: video by height desc, then audio
    formats.sort((a, b) => {
        if (a.type === 'audio' && b.type !== 'audio') return 1;
        if (a.type !== 'audio' && b.type === 'audio') return -1;
        return (b.height || 0) - (a.height || 0);
    });
    
    return formats.slice(0, MAX_FORMATS);
}

/**
 * Extract metadata from yt-dlp output
 */
export function extractMetadata(output: YtDlpOutput): ExtractedMetadata {
    return {
        title: output.title || 'Untitled',
        author: output.author || output.uploader || output.channel || output.uploader_id || 'Unknown',
        thumbnail: output.thumbnail || '',
        description: output.description,
        postedAt: output.upload_date ? `${output.upload_date.slice(0, 4)}-${output.upload_date.slice(4, 6)}-${output.upload_date.slice(6, 8)}` : undefined,
        engagement: {
            views: output.view_count ?? undefined,
            likes: output.like_count ?? undefined,
        },
    };
}
