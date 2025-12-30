// engines/ytdlp.ts - yt-dlp based Facebook scraper engine
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ScraperResult, ScraperOptions } from '@/core/scrapers/types';
import { ScraperErrorCode, createError } from '@/core/scrapers/types';
import type { MediaFormat } from '../types';
import { logger } from '../../shared/logger';
import { cookiePoolGetRotating, cookiePoolMarkSuccess, cookiePoolMarkError } from '@/lib/cookies';

const TIMEOUT_MS = 30000;

// yt-dlp JSON output types
interface YtdlpFormat {
    format_id: string;
    url: string;
    ext: string;
    width?: number;
    height?: number;
    tbr?: number;
    vbr?: number;
    abr?: number;
    asr?: number;
    vcodec?: string;
    acodec?: string;
    format_note?: string;
    filesize?: number;
    filesize_approx?: number;
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
    timestamp?: number;
    formats: YtdlpFormat[];
    webpage_url?: string;
}

interface JsonCookie {
    domain: string;
    name: string;
    value: string;
    path?: string;
    expirationDate?: number;
    secure?: boolean;
}

/**
 * Format duration from seconds to string
 */
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convert cookie to Netscape format for yt-dlp
 */
function convertToNetscapeFormat(cookieInput: string): string {
    const trimmed = cookieInput.trim();
    
    // JSON format
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
            const cookies: JsonCookie[] = JSON.parse(trimmed);
            const lines = ['# Netscape HTTP Cookie File'];
            for (const c of cookies) {
                if (!c.name || !c.value) continue;
                const domain = c.domain || '.facebook.com';
                const subdom = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                const path = c.path || '/';
                const secure = c.secure ? 'TRUE' : 'FALSE';
                const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
                lines.push(`${domain}\t${subdom}\t${path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`);
            }
            return lines.join('\n');
        } catch {
            // Fall through to simple format
        }
    }
    
    // Already Netscape format
    if (trimmed.startsWith('# ') || trimmed.startsWith('.')) {
        return trimmed;
    }
    
    // Simple cookie string (key=value; key2=value2)
    const lines = ['# Netscape HTTP Cookie File'];
    const cookies = trimmed.split(';').map(c => c.trim()).filter(Boolean);
    for (const cookie of cookies) {
        const eqIndex = cookie.indexOf('=');
        if (eqIndex === -1) continue;
        const name = cookie.substring(0, eqIndex).trim();
        const value = cookie.substring(eqIndex + 1).trim();
        if (name && value) {
            lines.push(`.facebook.com\tTRUE\t/\tTRUE\t0\t${name}\t${value}`);
        }
    }
    return lines.join('\n');
}

/**
 * Run yt-dlp and get JSON output
 */
async function runYtdlp(url: string, cookieFile?: string): Promise<YtdlpOutput> {
    return new Promise((resolve, reject) => {
        const args = ['--dump-json', '--no-download', '--no-warnings', '--no-playlist'];
        if (cookieFile) args.push('--cookies', cookieFile);
        args.push(url);
        
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
                // Parse error type
                if (stderr.includes('No video formats found') || stderr.includes('no video formats')) {
                    reject(new Error('NO_VIDEO'));
                } else if (stderr.includes('Cannot parse data')) {
                    reject(new Error('PARSE_ERROR'));
                } else if (stderr.includes('HTTP Error 404') || stderr.includes('Not Found')) {
                    reject(new Error('NOT_FOUND'));
                } else if (stderr.includes('HTTP Error 403') || stderr.includes('Forbidden')) {
                    reject(new Error('FORBIDDEN'));
                } else if (stderr.includes('login') || stderr.includes('log in')) {
                    reject(new Error('LOGIN_REQUIRED'));
                } else if (stderr.includes('private') || stderr.includes('Private')) {
                    reject(new Error('PRIVATE'));
                } else if (stderr.includes('not available') || stderr.includes('unavailable')) {
                    reject(new Error('UNAVAILABLE'));
                } else if (stderr.includes('Unsupported URL')) {
                    reject(new Error('UNSUPPORTED_URL'));
                } else if (stderr.includes('age') || stderr.includes('Age')) {
                    reject(new Error('AGE_RESTRICTED'));
                } else if (stderr.includes('checkpoint') || stderr.includes('Checkpoint')) {
                    reject(new Error('CHECKPOINT'));
                } else {
                    reject(new Error(stderr.split('\n')[0] || 'UNKNOWN'));
                }
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch {
                reject(new Error('INVALID_JSON'));
            }
        });
        
        proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Map yt-dlp format to MediaFormat
 * Returns null for formats we don't want (video-only DASH without audio)
 */
function mapFormat(fmt: YtdlpFormat, thumbnail?: string): MediaFormat | null {
    // Skip DASH manifest URLs
    if (fmt.url.includes('dash_mpd')) return null;
    
    const hasVideo = fmt.vcodec && fmt.vcodec !== 'none';
    const hasAudio = fmt.acodec && fmt.acodec !== 'none';
    
    // Audio-only format (DASH audio) - return as audio type
    if (!hasVideo && hasAudio) {
        return {
            quality: 'Audio',
            type: 'audio',
            url: fmt.url,
            format: fmt.ext || 'm4a',
            thumbnail,
            filesize: fmt.filesize || fmt.filesize_approx,
            hasMuxedAudio: true,
        };
    }
    
    // Video-only DASH format (no audio) - SKIP these
    // These are useless for users because they have no sound
    if (hasVideo && !hasAudio) {
        // Exception: sd and hd format_ids are progressive (have muxed audio)
        if (fmt.format_id !== 'sd' && fmt.format_id !== 'hd') {
            return null; // Skip video-only DASH
        }
    }
    
    // Video with audio (muxed) - this is what we want
    // Determine quality label based on height
    let quality: string;
    const height = fmt.height || 0;
    
    if (height >= 1080) {
        quality = 'FHD'; // 1080p+
    } else if (height >= 720) {
        quality = 'HD'; // 720p
    } else if (height > 0) {
        quality = 'SD'; // Below 720p
    } else if (fmt.format_id === 'hd') {
        quality = 'HD';
    } else {
        quality = 'SD';
    }
    
    return {
        quality,
        type: 'video',
        url: fmt.url,
        format: fmt.ext || 'mp4',
        thumbnail,
        width: fmt.width,
        height: fmt.height,
        filesize: fmt.filesize || fmt.filesize_approx,
        hasMuxedAudio: true, // Only return videos that have audio
    };
}

/**
 * Extract author from yt-dlp data with validation
 * yt-dlp sometimes returns wrong author from suggested content
 */
function extractAuthor(data: YtdlpOutput): string {
    // yt-dlp provides uploader and uploader_id
    const uploader = data.uploader;
    const uploaderId = data.uploader_id;
    
    // If uploader_id looks like a Facebook ID (numeric or username), trust it more
    if (uploaderId && uploader) {
        // Check if uploader_id is in the webpage_url - this validates it's the actual author
        if (data.webpage_url?.includes(uploaderId)) {
            return uploader;
        }
    }
    
    // Check if uploader appears in the title (common pattern: "Author - Title")
    if (uploader && data.title) {
        const titleLower = data.title.toLowerCase();
        const uploaderLower = uploader.toLowerCase();
        if (titleLower.includes(uploaderLower) || titleLower.startsWith(uploaderLower)) {
            return uploader;
        }
    }
    
    // Fallback to uploader if available
    return uploader || 'Unknown';
}

/**
 * yt-dlp engine - scrape Facebook using yt-dlp binary
 */
export async function scrapeWithYtdlp(url: string, options: ScraperOptions = {}): Promise<ScraperResult> {
    const t0 = Date.now();
    let cookieFile: string | undefined;
    let usedCookie = false;
    
    try {
        let data: YtdlpOutput;
        
        // Try without cookie first
        try {
            data = await runYtdlp(url);
            logger.debug('facebook', `[yt-dlp] OK without cookie`);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'UNKNOWN';
            logger.debug('facebook', `[yt-dlp] Failed: ${errMsg}`);
            
            // Get cookie for retry
            const cookie = options.cookie || await cookiePoolGetRotating('facebook');
            if (!cookie) {
                return mapErrorToResult(errMsg);
            }
            
            // Write cookie file
            cookieFile = join(tmpdir(), `fb_cookie_${Date.now()}.txt`);
            await writeFile(cookieFile, convertToNetscapeFormat(cookie));
            usedCookie = true;
            
            try {
                data = await runYtdlp(url, cookieFile);
                logger.debug('facebook', `[yt-dlp] OK with cookie`);
                cookiePoolMarkSuccess().catch(() => {});
            } catch (err2) {
                const errMsg2 = err2 instanceof Error ? err2.message : 'UNKNOWN';
                logger.debug('facebook', `[yt-dlp] Failed with cookie: ${errMsg2}`);
                cookiePoolMarkError(errMsg2).catch(() => {});
                return mapErrorToResult(errMsg2);
            }
        }
        
        // Map formats
        const thumbnail = data.thumbnail || data.thumbnails?.[0]?.url;
        const formats: MediaFormat[] = [];
        
        for (const fmt of data.formats) {
            const mapped = mapFormat(fmt, thumbnail);
            if (mapped) formats.push(mapped);
        }
        
        // Sort: HD first, then by height desc, audio last
        formats.sort((a, b) => {
            // Audio always at the end
            if (a.type === 'audio' && b.type !== 'audio') return 1;
            if (a.type !== 'audio' && b.type === 'audio') return -1;
            
            // Priority order: FHD > HD > SD
            const qualityOrder: Record<string, number> = { 'FHD': 3, 'HD': 2, 'SD': 1, 'Audio': 0 };
            const aOrder = qualityOrder[a.quality] || 0;
            const bOrder = qualityOrder[b.quality] || 0;
            if (aOrder !== bOrder) return bOrder - aOrder;
            return (b.height || 0) - (a.height || 0);
        });
        
        // Dedupe by quality - keep best (largest filesize) per quality tier
        // But always keep audio format if present
        const bestByQuality = new Map<string, MediaFormat>();
        let audioFormat: MediaFormat | null = null;
        
        for (const f of formats) {
            if (f.type === 'audio') {
                // Keep best audio (largest bitrate/filesize)
                if (!audioFormat || (f.filesize || 0) > (audioFormat.filesize || 0)) {
                    audioFormat = f;
                }
                continue;
            }
            
            const existing = bestByQuality.get(f.quality);
            if (!existing) {
                bestByQuality.set(f.quality, f);
            } else {
                // Keep the one with larger filesize (better quality)
                const existingSize = existing.filesize || 0;
                const newSize = f.filesize || 0;
                if (newSize > existingSize) {
                    bestByQuality.set(f.quality, f);
                }
            }
        }
        
        // Combine video formats + audio format
        const deduped = Array.from(bestByQuality.values());
        if (audioFormat) {
            deduped.push(audioFormat);
        }
        
        if (deduped.length === 0) {
            return createError(ScraperErrorCode.NO_MEDIA, 'Tidak ada media ditemukan');
        }
        
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        logger.debug('facebook', `[yt-dlp] Done ${elapsed}s, ${deduped.length} formats`);
        
        // Extract author with validation
        const author = extractAuthor(data);
        
        return {
            success: true,
            data: {
                title: data.title || 'Facebook Media',
                thumbnail: thumbnail || deduped[0]?.url || '',
                author,
                authorName: data.uploader,
                description: data.description,
                formats: deduped,
                url: data.webpage_url || url,
                postedAt: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : undefined,
                engagement: data.view_count ? { views: data.view_count } : undefined,
                type: 'video',
                duration: data.duration ? formatDuration(data.duration) : undefined,
                usedCookie,
            },
        };
        
    } finally {
        if (cookieFile) unlink(cookieFile).catch(() => {});
    }
}

/**
 * Map error code to ScraperResult
 */
function mapErrorToResult(errCode: string): ScraperResult {
    switch (errCode) {
        case 'NO_VIDEO':
        case 'NO_MEDIA':
            return createError(ScraperErrorCode.NO_MEDIA, 'Tidak ada video ditemukan');
        case 'PARSE_ERROR':
            // Parse error - let fallback engine try
            return createError(ScraperErrorCode.PARSE_ERROR, 'Gagal memproses data');
        case 'LOGIN_REQUIRED':
            return createError(ScraperErrorCode.COOKIE_REQUIRED, 'Konten memerlukan login');
        case 'PRIVATE':
            return createError(ScraperErrorCode.PRIVATE_CONTENT, 'Konten ini privat');
        case 'NOT_FOUND':
        case 'UNAVAILABLE':
            return createError(ScraperErrorCode.NOT_FOUND, 'Konten tidak ditemukan');
        case 'FORBIDDEN':
            return createError(ScraperErrorCode.BLOCKED, 'Akses ditolak');
        case 'UNSUPPORTED_URL':
            return createError(ScraperErrorCode.UNSUPPORTED_CONTENT, 'URL tidak didukung');
        case 'AGE_RESTRICTED':
            return createError(ScraperErrorCode.AGE_RESTRICTED, 'Konten dibatasi usia');
        case 'CHECKPOINT':
            return createError(ScraperErrorCode.CHECKPOINT_REQUIRED, 'Akun memerlukan verifikasi');
        default:
            return createError(ScraperErrorCode.UNKNOWN, errCode);
    }
}
