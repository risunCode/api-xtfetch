/**
 * YouTube Scraper using yt-dlp
 * Requires Python + yt-dlp installed on server
 * 
 * NOTE: Cache is handled at the route level (lib/cache.ts), not in scrapers.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { createError, ScraperErrorCode, type ScraperResult, type ScraperOptions } from '@/core/scrapers/types';
import { logger } from './helper/logger';

const execAsync = promisify(exec);

interface YtdlpFormat {
    format_id: string;
    quality: string;
    ext: string;
    filesize: number | null;
    url: string;
    type: 'video' | 'audio';
    height: number | null;
    width: number | null;
    fps: number | null;
    vcodec: string | null;
    acodec: string | null;
    abr: number | null;
}

interface YtdlpResult {
    success: boolean;
    error?: string;
    data?: {
        id: string;
        title: string;
        description?: string;
        author: string;
        duration: number;
        thumbnail: string;
        view_count: number;
        like_count: number;
        formats: YtdlpFormat[];
    };
}

/**
 * Scrape YouTube video using yt-dlp
 */
export async function scrapeYouTube(url: string, options?: ScraperOptions): Promise<ScraperResult> {
    // Validate URL
    if (!isYouTubeUrl(url)) {
        return createError(ScraperErrorCode.INVALID_URL, 'Invalid YouTube URL');
    }

    try {
        // Clean URL - remove playlist parameter to speed up extraction
        const cleanUrl = cleanYouTubeUrl(url);
        
        // Path to Python script
        const scriptPath = path.join(process.cwd(), 'scripts', 'ytdlp-extract.py');
        
        // Escape URL for shell
        const escapedUrl = cleanUrl.replace(/"/g, '\\"');
        
        // Execute Python script (use 'python' on Windows, 'python3' on Linux/Mac)
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        
        logger.debug('youtube', `Extracting with yt-dlp: ${cleanUrl}`);
        const startTime = Date.now();
        
        const { stdout, stderr } = await execAsync(
            `${pythonCmd} "${scriptPath}" "${escapedUrl}"`,
            { 
                timeout: 90000, // 90s timeout (YouTube can be slow)
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            }
        );
        
        const extractTime = Date.now() - startTime;
        logger.debug('youtube', `yt-dlp extraction took ${extractTime}ms`);

        if (stderr) {
            logger.warn('youtube', `yt-dlp stderr: ${stderr}`);
        }

        // Parse result
        const ytdlpResult: YtdlpResult = JSON.parse(stdout);

        if (!ytdlpResult.success || !ytdlpResult.data) {
            return createError(ScraperErrorCode.PARSE_ERROR, ytdlpResult.error || 'Failed to extract video');
        }

        const { data } = ytdlpResult;

        // Separate formats by type
        const rawFormats = data.formats.filter(f => f.url);
        
        // Find combined formats (has both video and audio codec)
        const combinedFormats = rawFormats.filter(f => 
            f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none'
        );
        
        // Find video-only formats (no audio)
        const videoOnlyFormats = rawFormats.filter(f => 
            f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none')
        );
        
        // Find audio-only formats
        const audioOnlyFormats = rawFormats.filter(f => 
            f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
        );
        
        // Get best audio for merging (highest bitrate)
        const bestAudio = audioOnlyFormats
            .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
        
        // Build final formats list - ONLY playable formats for users
        const finalFormats: Array<{
            url: string;
            quality: string;
            type: 'video' | 'audio';
            format: string;
            filesize?: number;
            width?: number;
            height?: number;
            needsMerge?: boolean;
            audioUrl?: string;
        }> = [];
        
        // Track seen qualities to avoid duplicates
        const seenQualities = new Set<string>();
        
        // 1. Add combined formats (playable as-is) - prioritize these
        for (const f of combinedFormats) {
            const qualityKey = `combined-${f.height}p-${f.ext}`;
            if (seenQualities.has(qualityKey)) continue;
            seenQualities.add(qualityKey);
            
            finalFormats.push({
                url: f.url,
                quality: f.quality || `${f.height}p`,
                type: 'video',
                format: f.ext,
                filesize: f.filesize || undefined,
                width: f.width || undefined,
                height: f.height || undefined,
            });
        }
        
        // 2. Add video-only formats that need merge (ALL resolutions)
        // Only add if we have audio to merge with
        // Deduplicate by height, prefer mp4 over webm
        if (bestAudio) {
            // Group by height, pick best format per height
            const byHeight = new Map<number, typeof videoOnlyFormats[0]>();
            
            for (const f of videoOnlyFormats) {
                // Include ALL video-only formats (they all need merge for audio)
                if (!f.height) continue;
                
                const existing = byHeight.get(f.height);
                if (!existing) {
                    byHeight.set(f.height, f);
                } else {
                    // Prefer mp4 over webm
                    if (f.ext === 'mp4' && existing.ext !== 'mp4') {
                        byHeight.set(f.height, f);
                    }
                    // If same ext, prefer smaller file (usually better codec)
                    else if (f.ext === existing.ext && (f.filesize || 0) < (existing.filesize || Infinity)) {
                        byHeight.set(f.height, f);
                    }
                }
            }
            
            // Add deduplicated formats
            for (const f of byHeight.values()) {
                const qualityKey = `merge-${f.height}p`;
                if (seenQualities.has(qualityKey)) continue;
                seenQualities.add(qualityKey);
                
                finalFormats.push({
                    url: f.url,
                    quality: `${f.height}p`,
                    type: 'video',
                    format: 'mp4', // Always output as mp4 after merge
                    filesize: f.filesize || undefined,
                    width: f.width || undefined,
                    height: f.height || undefined,
                    needsMerge: true,
                    audioUrl: bestAudio.url,
                });
            }
        }
        
        // 3. Add best audio format for audio-only download
        if (bestAudio) {
            finalFormats.push({
                url: bestAudio.url,
                quality: bestAudio.quality || `${Math.round(bestAudio.abr || 128)}kbps`,
                type: 'audio',
                format: bestAudio.ext,
                filesize: bestAudio.filesize || undefined,
            });
        }
        
        // Deduplicate by height - prefer combined (has audio) over needsMerge for low res
        // For HD (480p+), prefer needsMerge (better quality video-only streams)
        // For SD (360p and below), prefer combined (already has audio, no merge needed)
        const heightMap = new Map<number, typeof finalFormats[0]>();
        for (const f of finalFormats) {
            if (f.type !== 'video' || !f.height) continue;
            const existing = heightMap.get(f.height);
            if (!existing) {
                heightMap.set(f.height, f);
            } else {
                // For 480p and above: prefer needsMerge (better quality)
                // For 360p and below: prefer combined (already has audio)
                if (f.height >= 480) {
                    if (f.needsMerge && !existing.needsMerge) {
                        heightMap.set(f.height, f);
                    }
                } else {
                    // For low res, prefer combined (no merge needed)
                    if (!f.needsMerge && existing.needsMerge) {
                        heightMap.set(f.height, f);
                    }
                }
            }
        }
        
        // Rebuild formats: deduplicated videos + audio
        // Filter out 144p and 240p (useless quality)
        const deduplicatedFormats = [
            ...Array.from(heightMap.values()).filter(f => !f.height || f.height >= 360),
            ...finalFormats.filter(f => f.type === 'audio')
        ];
        
        // Sort by height desc
        deduplicatedFormats.sort((a, b) => {
            // Audio last
            if (a.type === 'audio' && b.type !== 'audio') return 1;
            if (a.type !== 'audio' && b.type === 'audio') return -1;
            // Then by height
            return (b.height || 0) - (a.height || 0);
        });
        
        // Replace finalFormats
        finalFormats.length = 0;
        finalFormats.push(...deduplicatedFormats);

        const result: ScraperResult = {
            success: true,
            data: {
                title: data.title,
                description: data.description || undefined,
                author: data.author,
                thumbnail: data.thumbnail,
                url,
                formats: finalFormats,
                engagement: {
                    views: data.view_count,
                    likes: data.like_count,
                },
            },
        };

        logger.complete('youtube', Date.now());
        
        return result;
    } catch (error: unknown) {
        const err = error as { code?: string; killed?: boolean; message?: string };
        // Handle specific errors
        if (err.code === 'ETIMEDOUT' || err.killed) {
            return createError(ScraperErrorCode.TIMEOUT, 'YouTube extraction timed out');
        }
        
        if (err.message?.includes('not found') || err.code === 'ENOENT') {
            return createError(ScraperErrorCode.API_ERROR, 'yt-dlp not installed on server');
        }

        // Check for yt-dlp specific errors
        const msg = err.message?.toLowerCase() || '';
        if (msg.includes('private') || msg.includes('sign in')) {
            return createError(ScraperErrorCode.PRIVATE_CONTENT, 'This video is private or requires login');
        }
        if (msg.includes('unavailable') || msg.includes('removed')) {
            return createError(ScraperErrorCode.NOT_FOUND, 'Video unavailable or removed');
        }
        if (msg.includes('age') || msg.includes('confirm your age')) {
            return createError(ScraperErrorCode.AGE_RESTRICTED, 'This video is age-restricted');
        }

        return createError(ScraperErrorCode.UNKNOWN, err.message || 'Unknown error');
    }
}

/**
 * Clean YouTube URL - remove playlist and other slow parameters
 * This speeds up yt-dlp extraction significantly
 */
function cleanYouTubeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        
        // Handle youtu.be short URLs
        if (urlObj.hostname === 'youtu.be') {
            const videoId = urlObj.pathname.slice(1).split('/')[0];
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        
        // Handle youtube.com URLs - keep only 'v' parameter
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        
        // Handle /shorts/ URLs
        const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (shortsMatch) {
            return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
        }
        
        // Fallback - return original
        return url;
    } catch {
        return url;
    }
}

/**
 * Check if URL is YouTube
 */
export function isYouTubeUrl(url: string): boolean {
    return /(?:youtube\.com|youtu\.be|music\.youtube\.com)/i.test(url);
}

/**
 * Extract video ID from YouTube URL
 */
export function extractYouTubeId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/|youtube\.com\/e\/)([a-zA-Z0-9_-]{11})/,
        /(?:music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}
