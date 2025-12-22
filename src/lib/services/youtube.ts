/**
 * YouTube Scraper using yt-dlp
 * Requires Python + yt-dlp installed on server
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { createError, ScraperErrorCode, type ScraperResult, type ScraperOptions } from '@/core/scrapers/types';

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
export async function scrapeYouTube(url: string, _options?: ScraperOptions): Promise<ScraperResult> {
    // Validate URL
    if (!isYouTubeUrl(url)) {
        return createError(ScraperErrorCode.INVALID_URL, 'Invalid YouTube URL');
    }

    try {
        // Path to Python script
        const scriptPath = path.join(process.cwd(), 'scripts', 'ytdlp-extract.py');
        
        // Escape URL for shell
        const escapedUrl = url.replace(/"/g, '\\"');
        
        // Execute Python script
        const { stdout, stderr } = await execAsync(
            `python3 "${scriptPath}" "${escapedUrl}"`,
            { 
                timeout: 60000, // 60s timeout
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            }
        );

        if (stderr) {
            console.warn('[YouTube] yt-dlp stderr:', stderr);
        }

        // Parse result
        const result: YtdlpResult = JSON.parse(stdout);

        if (!result.success || !result.data) {
            return createError(ScraperErrorCode.PARSE_ERROR, result.error || 'Failed to extract video');
        }

        const { data } = result;

        // Map formats to XTFetch format
        const formats = data.formats
            .filter(f => f.url) // Only formats with URL
            .map(f => ({
                url: f.url,
                quality: f.quality,
                type: f.type as 'video' | 'audio',
                format: f.ext,
                filesize: f.filesize || undefined,
                width: f.width || undefined,
                height: f.height || undefined,
            }));

        // Filter: prefer combined video+audio, then separate
        const combinedFormats = formats.filter(f => 
            f.type === 'video' && data.formats.find(
                df => df.url === f.url && df.vcodec && df.acodec
            )
        );
        
        const videoOnlyFormats = formats.filter(f => 
            f.type === 'video' && !combinedFormats.find(cf => cf.url === f.url)
        );
        
        const audioFormats = formats.filter(f => f.type === 'audio');

        // Prioritize combined, then video-only, then audio
        const sortedFormats = [
            ...combinedFormats,
            ...videoOnlyFormats,
            ...audioFormats,
        ];

        const finalFormats = sortedFormats.length > 0 ? sortedFormats : formats;

        return {
            success: true,
            data: {
                title: data.title,
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
    } catch (error: any) {
        // Handle specific errors
        if (error.code === 'ETIMEDOUT' || error.killed) {
            return createError(ScraperErrorCode.TIMEOUT, 'YouTube extraction timed out');
        }
        
        if (error.message?.includes('not found') || error.code === 'ENOENT') {
            return createError(ScraperErrorCode.API_ERROR, 'yt-dlp not installed on server');
        }

        // Check for yt-dlp specific errors
        const msg = error.message?.toLowerCase() || '';
        if (msg.includes('private') || msg.includes('sign in')) {
            return createError(ScraperErrorCode.PRIVATE_CONTENT, 'This video is private or requires login');
        }
        if (msg.includes('unavailable') || msg.includes('removed')) {
            return createError(ScraperErrorCode.NOT_FOUND, 'Video unavailable or removed');
        }
        if (msg.includes('age') || msg.includes('confirm your age')) {
            return createError(ScraperErrorCode.AGE_RESTRICTED, 'This video is age-restricted');
        }

        return createError(ScraperErrorCode.UNKNOWN, error.message || 'Unknown error');
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
