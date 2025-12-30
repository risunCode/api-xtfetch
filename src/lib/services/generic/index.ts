/**
 * Generic yt-dlp/gallery-dl based scraper
 * 
 * Supports multiple platforms via yt-dlp and gallery-dl backends.
 * Each platform has its own URL patterns and extraction config.
 */

import { spawn } from 'child_process';
import type { ScraperResult, ScraperOptions } from '@/core/scrapers/types';
import { ScraperErrorCode, createError } from '@/core/scrapers/types';
import type { MediaFormat } from '@/lib/types';
import { logger } from '../shared/logger';
import { formatBytes } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type GenericPlatform = 
    | 'bilibili' | 'reddit' | 'soundcloud' 
    | 'eporner' | 'pornhub' | 'rule34video'
    | 'threads' | 'erome' | 'pixiv';

interface PlatformConfig {
    name: string;
    backend: 'ytdlp' | 'gallerydl';
    urlPatterns: RegExp[];
    isNsfw?: boolean;
    requiresAuth?: boolean;
}

interface YtdlpFormat {
    format_id: string;
    url: string;
    ext: string;
    width?: number;
    height?: number;
    filesize?: number;
    filesize_approx?: number;
    vcodec?: string;
    acodec?: string;
    tbr?: number;
    abr?: number;
    quality?: string | number; // Some sites use this as resolution (e.g., "1080", "720")
    protocol?: string; // http, https, m3u8, m3u8_native, etc.
}

interface YtdlpOutput {
    id: string;
    title: string;
    description?: string;
    uploader?: string;
    uploader_id?: string;
    thumbnail?: string;
    thumbnails?: { url: string }[];
    duration?: number;
    view_count?: number;
    like_count?: number;
    timestamp?: number;
    formats?: YtdlpFormat[];
    url?: string; // For single-format results
    ext?: string;
    webpage_url?: string;
}

interface GalleryDlOutput {
    category: string;
    filename: string;
    url: string;
    extension: string;
    width?: number;
    height?: number;
    filesize?: number;
    description?: string;
    user?: string;
    title?: string;
    date?: string;
}


// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════

const PLATFORMS: Record<GenericPlatform, PlatformConfig> = {
    bilibili: {
        name: 'BiliBili',
        backend: 'ytdlp',
        urlPatterns: [
            /bilibili\.com\/video\//i,
            /b23\.tv\//i,
        ],
    },
    reddit: {
        name: 'Reddit',
        backend: 'ytdlp',
        urlPatterns: [
            /reddit\.com\/r\/\w+\/comments\//i,
            /redd\.it\//i,
            /v\.redd\.it\//i,
        ],
    },
    soundcloud: {
        name: 'SoundCloud',
        backend: 'ytdlp',
        urlPatterns: [
            /soundcloud\.com\/[\w-]+\/[\w-]+/i,
        ],
    },
    eporner: {
        name: 'Eporner',
        backend: 'ytdlp',
        urlPatterns: [
            /eporner\.com\/video-/i,
        ],
        isNsfw: true,
    },
    pornhub: {
        name: 'PornHub',
        backend: 'ytdlp',
        urlPatterns: [
            /pornhub\.com\/view_video/i,
            /pornhub\.com\/embed\//i,
        ],
        isNsfw: true,
    },
    rule34video: {
        name: 'Rule34Video',
        backend: 'ytdlp',
        urlPatterns: [
            /rule34video\.com\/videos?\//i,
        ],
        isNsfw: true,
    },
    threads: {
        name: 'Threads',
        backend: 'gallerydl',
        urlPatterns: [
            /threads\.net\/@[\w.]+\/post\//i,
        ],
    },
    erome: {
        name: 'Erome',
        backend: 'gallerydl',
        urlPatterns: [
            /erome\.com\/a\//i,
            /erome\.com\/[\w]+$/i,
        ],
        isNsfw: true,
    },
    pixiv: {
        name: 'Pixiv',
        backend: 'gallerydl',
        urlPatterns: [
            /pixiv\.net\/.*artworks\/\d+/i,
            /pixiv\.net\/.*illust_id=\d+/i,
        ],
        requiresAuth: true,
    },
};

const TIMEOUT_MS = 45000;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function detectPlatform(url: string): GenericPlatform | null {
    for (const [platform, config] of Object.entries(PLATFORMS)) {
        for (const pattern of config.urlPatterns) {
            if (pattern.test(url)) {
                return platform as GenericPlatform;
            }
        }
    }
    return null;
}

export function getPlatformConfig(platform: GenericPlatform): PlatformConfig {
    return PLATFORMS[platform];
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}


// ═══════════════════════════════════════════════════════════════════════════════
// YT-DLP BACKEND
// ═══════════════════════════════════════════════════════════════════════════════

async function runYtdlp(url: string): Promise<YtdlpOutput> {
    return new Promise((resolve, reject) => {
        const args = ['--dump-json', '--no-download', '--no-warnings', '--no-playlist', url];
        const proc = spawn('yt-dlp', args, { timeout: TIMEOUT_MS, windowsHide: true });
        let stdout = '', stderr = '';
        
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        
        const timeout = setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error('TIMEOUT'));
        }, TIMEOUT_MS);
        
        proc.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                const errLower = stderr.toLowerCase();
                if (errLower.includes('not found') || errLower.includes('404')) reject(new Error('NOT_FOUND'));
                else if (errLower.includes('private')) reject(new Error('PRIVATE'));
                else if (errLower.includes('login') || errLower.includes('sign in')) reject(new Error('LOGIN_REQUIRED'));
                else if (errLower.includes('unavailable')) reject(new Error('UNAVAILABLE'));
                else if (errLower.includes('geo') || errLower.includes('country')) reject(new Error('GEO_BLOCKED'));
                else if (errLower.includes('no video')) reject(new Error('NO_VIDEO'));
                else if (errLower.includes('no media')) reject(new Error('NO_MEDIA'));
                else reject(new Error(stderr.split('\n')[0] || 'UNKNOWN'));
                return;
            }
            try { resolve(JSON.parse(stdout)); }
            catch { reject(new Error('INVALID_JSON')); }
        });
        
        proc.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
}


function mapYtdlpFormats(data: YtdlpOutput): MediaFormat[] {
    const formats: MediaFormat[] = [];
    const thumbnail = data.thumbnail || data.thumbnails?.[0]?.url;
    
    // Handle single-format results (e.g., audio)
    if (!data.formats && data.url) {
        const isHLS = data.url.includes('.m3u8') || data.url.includes('/playlist');
        formats.push({
            quality: 'Original',
            type: data.ext === 'mp3' || data.ext === 'm4a' ? 'audio' : 'video',
            url: data.url,
            format: data.ext || 'mp4',
            thumbnail,
            isHLS,
        });
        return formats;
    }
    
    if (!data.formats) return formats;
    
    // Group by quality tier
    const bestByQuality = new Map<string, MediaFormat>();
    
    for (const fmt of data.formats) {
        if (!fmt.url) continue;
        if (fmt.vcodec === 'none' && fmt.acodec === 'none') continue;
        
        const isAudioOnly = fmt.vcodec === 'none' && fmt.acodec && fmt.acodec !== 'none';
        
        // Detect HLS streams
        const isHLS = fmt.url.includes('.m3u8') || 
                     fmt.url.includes('/playlist') || 
                     fmt.protocol === 'm3u8' || 
                     fmt.protocol === 'm3u8_native' ||
                     fmt.format_id?.startsWith('hls');
        
        // Get height from: height field OR quality field (some sites use quality as resolution string)
        let height = fmt.height || 0;
        if (!height && fmt.quality) {
            // Parse quality string like "1080", "720", "480p", etc.
            const qualityNum = parseInt(String(fmt.quality).replace(/p$/i, ''), 10);
            if (!isNaN(qualityNum) && qualityNum > 0) {
                height = qualityNum;
            }
        }
        
        let quality: string;
        if (isAudioOnly) {
            quality = fmt.abr ? `${Math.round(fmt.abr)}kbps` : 'Audio';
        } else if (height >= 4320) quality = '8K';
        else if (height >= 2160) quality = '4K';
        else if (height >= 1440) quality = '2K';
        else if (height >= 1080) quality = 'FHD';
        else if (height >= 720) quality = 'HD';
        else if (height >= 480) quality = '480p';
        else if (height >= 360) quality = '360p';
        else if (height >= 240) quality = '240p';
        else if (height > 0) quality = `${height}p`;
        else quality = 'SD';
        
        const filesize = fmt.filesize || fmt.filesize_approx;
        const existing = bestByQuality.get(quality);
        
        // Priority: prefer direct HTTP over HLS, then prefer larger filesize
        const shouldReplace = !existing || 
            (!isHLS && existing.isHLS) || // Prefer direct over HLS
            (isHLS === existing.isHLS && filesize && filesize > (existing.filesize || 0));
            
        if (shouldReplace) {
            bestByQuality.set(quality, {
                quality,
                type: isAudioOnly ? 'audio' : 'video',
                url: fmt.url,
                format: isHLS ? 'm3u8' : (fmt.ext || 'mp4'),
                thumbnail,
                width: fmt.width,
                height: height || undefined,
                filesize,
                fileSize: filesize ? formatBytes(filesize) : undefined,
                isHLS,
            });
        }
    }
    
    // Sort by height descending (FHD > HD > 480p > 360p > SD)
    return Array.from(bestByQuality.values()).sort((a, b) => (b.height || 0) - (a.height || 0));
}


// ═══════════════════════════════════════════════════════════════════════════════
// GALLERY-DL BACKEND
// ═══════════════════════════════════════════════════════════════════════════════

async function runGalleryDl(url: string): Promise<GalleryDlOutput[]> {
    return new Promise((resolve, reject) => {
        const args = ['-j', '--no-download', url];
        const proc = spawn('gallery-dl', args, { timeout: TIMEOUT_MS, windowsHide: true });
        let stdout = '', stderr = '';
        
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        
        const timeout = setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error('TIMEOUT'));
        }, TIMEOUT_MS);
        
        proc.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                const errLower = stderr.toLowerCase();
                if (errLower.includes('not found') || errLower.includes('404')) reject(new Error('NOT_FOUND'));
                else if (errLower.includes('private')) reject(new Error('PRIVATE'));
                else if (errLower.includes('login') || errLower.includes('auth')) reject(new Error('LOGIN_REQUIRED'));
                else reject(new Error(stderr.split('\n')[0] || 'UNKNOWN'));
                return;
            }
            try {
                // gallery-dl outputs one JSON per line
                const results = stdout.trim().split('\n')
                    .filter(line => line.startsWith('[') || line.startsWith('{'))
                    .map(line => JSON.parse(line))
                    .flat();
                resolve(results);
            } catch { reject(new Error('INVALID_JSON')); }
        });
        
        proc.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
}


function mapGalleryDlFormats(data: GalleryDlOutput[]): { formats: MediaFormat[]; meta: { title?: string; author?: string; thumbnail?: string } } {
    const formats: MediaFormat[] = [];
    let title: string | undefined;
    let author: string | undefined;
    let thumbnail: string | undefined;
    
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (!item.url) continue;
        
        const ext = item.extension || item.url.split('.').pop() || '';
        const isVideo = ['mp4', 'webm', 'mov', 'avi'].includes(ext.toLowerCase());
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext.toLowerCase());
        
        if (!isVideo && !isImage) continue;
        
        if (!title && item.title) title = item.title;
        if (!author && item.user) author = item.user;
        if (!thumbnail && isImage) thumbnail = item.url;
        
        formats.push({
            quality: isVideo ? 'Original' : `Image ${i + 1}`,
            type: isVideo ? 'video' : 'image',
            url: item.url,
            format: ext,
            thumbnail: isImage ? item.url : thumbnail,
            width: item.width,
            height: item.height,
            filesize: item.filesize,
            fileSize: item.filesize ? formatBytes(item.filesize) : undefined,
            itemId: `item-${i}`,
        });
    }
    
    return { formats, meta: { title, author, thumbnail } };
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCRAPER
// ═══════════════════════════════════════════════════════════════════════════════

export async function scrapeGeneric(url: string, platform: GenericPlatform, _options: ScraperOptions = {}): Promise<ScraperResult> {
    const config = PLATFORMS[platform];
    const t0 = Date.now();
    
    logger.debug(platform, `Scraping with ${config.backend}: ${url}`);
    
    try {
        if (config.backend === 'ytdlp') {
            const data = await runYtdlp(url);
            const formats = mapYtdlpFormats(data);
            
            if (formats.length === 0) {
                return createError(ScraperErrorCode.NO_MEDIA, 'No media found');
            }
            
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            logger.debug(platform, `Done ${elapsed}s, ${formats.length} formats`);
            
            return {
                success: true,
                data: {
                    title: data.title || `${config.name} Media`,
                    thumbnail: data.thumbnail || data.thumbnails?.[0]?.url || formats[0]?.thumbnail || '',
                    author: data.uploader || data.uploader_id || 'Unknown',
                    description: data.description,
                    formats,
                    url: data.webpage_url || url,
                    duration: data.duration ? formatDuration(data.duration) : undefined,
                    engagement: data.view_count || data.like_count ? {
                        views: data.view_count,
                        likes: data.like_count,
                    } : undefined,
                    type: formats[0]?.type === 'audio' ? 'video' : 'video',
                },
            };
        } else {
            // gallery-dl
            const data = await runGalleryDl(url);
            const { formats, meta } = mapGalleryDlFormats(data);
            
            if (formats.length === 0) {
                return createError(ScraperErrorCode.NO_MEDIA, 'No media found');
            }
            
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            logger.debug(platform, `Done ${elapsed}s, ${formats.length} formats`);
            
            return {
                success: true,
                data: {
                    title: meta.title || `${config.name} Media`,
                    thumbnail: meta.thumbnail || formats[0]?.thumbnail || '',
                    author: meta.author || 'Unknown',
                    formats,
                    url,
                    type: formats.some(f => f.type === 'video') ? 'video' : 'image',
                },
            };
        }
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'UNKNOWN';
        logger.error(platform, `Failed: ${errMsg}`);
        return mapErrorToResult(errMsg);
    }
}

function mapErrorToResult(errCode: string): ScraperResult {
    switch (errCode) {
        case 'NOT_FOUND': return createError(ScraperErrorCode.NOT_FOUND, 'Content not found');
        case 'PRIVATE': return createError(ScraperErrorCode.PRIVATE_CONTENT, 'Content is private');
        case 'LOGIN_REQUIRED': return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Login required');
        case 'UNAVAILABLE': return createError(ScraperErrorCode.NOT_FOUND, 'Content unavailable');
        case 'GEO_BLOCKED': return createError(ScraperErrorCode.BLOCKED, 'Content geo-blocked');
        case 'TIMEOUT': return createError(ScraperErrorCode.TIMEOUT, 'Request timeout');
        case 'NO_VIDEO': return createError(ScraperErrorCode.NO_MEDIA, 'No video found in this post');
        case 'NO_MEDIA': return createError(ScraperErrorCode.NO_MEDIA, 'No media found');
        default: return createError(ScraperErrorCode.UNKNOWN, errCode);
    }
}
