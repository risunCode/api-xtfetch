/**
 * General Media Merge/Convert API
 * POST /api/v1/merge
 * 
 * Converts HLS streams (m3u8) and other formats to downloadable mp4/mp3/m4a.
 * Works for all platforms EXCEPT YouTube (which has special handling).
 * 
 * For YouTube, use /api/v1/merge/youtube instead.
 * 
 * Flow:
 * 1. Validate request & check rate limits
 * 2. Download/convert via ffmpeg
 * 3. Stream output file to client
 * 4. Cleanup temp files
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, createReadStream, rmSync, statSync } from 'fs';
import { homedir, tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { mergeQueueAcquire, mergeQueueRelease, mergeQueueStatus } from '@/lib/services/youtube/merge-queue';

// ============================================================================
// Constants
// ============================================================================

const MAX_FILESIZE_MB = 200;
const MAX_FILESIZE_BYTES = MAX_FILESIZE_MB * 1024 * 1024;
const TIMEOUT_MS = 180000; // 3 minutes
const MAX_MEMORY_MB = 900;
const MAX_MEMORY_BYTES = MAX_MEMORY_MB * 1024 * 1024;

// Valid output formats
const VALID_FORMATS = ['mp4', 'mp3', 'm4a'];

// ============================================================================
// FFmpeg Path Detection
// ============================================================================

const WINDOWS_FFMPEG_PATHS = [
    path.join(homedir(), 'AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe'),
    'C:/Program Files/ffmpeg/bin/ffmpeg.exe',
    path.join(homedir(), 'scoop/shims/ffmpeg.exe'),
    'C:/ffmpeg/bin/ffmpeg.exe',
];

const UNIX_FFMPEG_PATHS = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg'
];

let cachedFFmpegPath: string | null = null;

function findFFmpegPath(): string {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
    if (cachedFFmpegPath) return cachedFFmpegPath;

    const paths = process.platform === 'win32' ? WINDOWS_FFMPEG_PATHS : UNIX_FFMPEG_PATHS;
    for (const p of paths) {
        if (existsSync(p)) {
            cachedFFmpegPath = p;
            return p;
        }
    }

    try {
        const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
        const result = execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0];
        if (result && existsSync(result)) {
            cachedFFmpegPath = result;
            return result;
        }
    } catch { /* ignore */ }

    return 'ffmpeg';
}

// ============================================================================
// Temp Folder Management
// ============================================================================

const TEMP_BASE = path.join(tmpdir(), 'xtfetch-merge');

function getTempFolder(id: string): string {
    const folder = path.join(TEMP_BASE, id);
    if (!existsSync(TEMP_BASE)) mkdirSync(TEMP_BASE, { recursive: true });
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
    return folder;
}

function cleanupFolder(folder: string): void {
    try {
        if (existsSync(folder)) rmSync(folder, { recursive: true, force: true });
    } catch { /* ignore */ }
}

function scheduleCleanup(folder: string, delayMs: number = 5 * 60 * 1000): void {
    setTimeout(() => cleanupFolder(folder), delayMs);
}

// ============================================================================
// Memory Check
// ============================================================================

function checkMemoryUsage(): { ok: boolean; usedMB: number; maxMB: number } {
    const used = process.memoryUsage();
    const heapUsed = used.heapUsed;
    const usedMB = Math.round(heapUsed / 1024 / 1024);
    return {
        ok: heapUsed < MAX_MEMORY_BYTES,
        usedMB,
        maxMB: MAX_MEMORY_MB
    };
}

// ============================================================================
// URL Validation
// ============================================================================

function isValidMediaUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        // Must be HTTPS (or HTTP for local dev)
        if (!['https:', 'http:'].includes(parsed.protocol)) return false;
        // Basic character validation - allow most URL chars
        const safePattern = /^[a-zA-Z0-9\-_=&?\/%.~:@]+$/;
        return safePattern.test(url);
    } catch {
        return false;
    }
}

function isYouTubeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        const ytHosts = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'];
        return ytHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
    } catch {
        return false;
    }
}

// ============================================================================
// FFmpeg Headers for CDN Access
// ============================================================================

function getFFmpegHeaders(url: string, platform?: string): string | null {
    const headers: string[] = [];
    
    // Detect platform from URL if not provided
    const urlLower = url.toLowerCase();
    let detectedPlatform = platform?.toLowerCase() || '';
    
    if (!detectedPlatform) {
        if (urlLower.includes('fbcdn') || urlLower.includes('facebook')) detectedPlatform = 'facebook';
        else if (urlLower.includes('cdninstagram') || urlLower.includes('instagram')) detectedPlatform = 'instagram';
        else if (urlLower.includes('twimg')) detectedPlatform = 'twitter';
        else if (urlLower.includes('tiktok')) detectedPlatform = 'tiktok';
        else if (urlLower.includes('sinaimg') || urlLower.includes('weibo')) detectedPlatform = 'weibo';
    }
    
    // Platform-specific referer
    const referers: Record<string, string> = {
        facebook: 'https://www.facebook.com/',
        instagram: 'https://www.instagram.com/',
        twitter: 'https://twitter.com/',
        tiktok: 'https://www.tiktok.com/',
        weibo: 'https://weibo.com/',
    };
    
    if (detectedPlatform && referers[detectedPlatform]) {
        headers.push(`Referer: ${referers[detectedPlatform]}`);
    }
    
    // Common headers
    headers.push('Accept: */*');
    headers.push('Accept-Language: en-US,en;q=0.9');
    
    return headers.length > 0 ? headers.join('\r\n') : null;
}

// ============================================================================
// FFmpeg Conversion
// ============================================================================

interface ConvertResult {
    success: boolean;
    outputPath?: string;
    error?: string;
}

async function convertMedia(
    inputUrl: string,
    outputDir: string,
    outputFormat: 'mp4' | 'mp3' | 'm4a',
    filename: string,
    platform?: string
): Promise<ConvertResult> {
    return new Promise((resolve) => {
        const ffmpegPath = findFFmpegPath();
        const outputFile = path.join(outputDir, `${filename}.${outputFormat}`);
        
        // Ensure filename is safe for Windows paths
        if (!filename || filename.length === 0) {
            resolve({ success: false, error: 'Invalid filename' });
            return;
        }
        
        // Build FFmpeg args with proper headers for CDN access
        const args: string[] = [
            '-y', // Overwrite output
        ];
        
        // Add headers based on platform/URL for CDN access
        const headers = getFFmpegHeaders(inputUrl, platform);
        if (headers) {
            args.push('-headers', headers);
        }
        
        // Add user agent
        args.push('-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        args.push('-i', inputUrl);
        
        // Format-specific encoding
        if (outputFormat === 'mp3') {
            // Audio only - extract and convert to MP3
            args.push('-vn', '-acodec', 'libmp3lame', '-q:a', '2');
        } else if (outputFormat === 'm4a') {
            // Audio only - extract and convert to M4A/AAC
            args.push('-vn', '-acodec', 'aac', '-b:a', '192k');
        } else {
            // Video - copy streams if possible, otherwise re-encode
            args.push('-c', 'copy');
        }
        
        args.push(outputFile);
        
        console.log(`[merge] Starting ffmpeg: ${outputFormat}, file: ${filename}, platform: ${platform || 'unknown'}`);
        
        const proc = spawn(ffmpegPath, args, {
            timeout: TIMEOUT_MS,
            windowsHide: true,
        });
        
        let stderr = '';
        
        proc.stderr?.on('data', (d) => {
            stderr += d.toString();
        });
        
        const timeout = setTimeout(() => {
            proc.kill('SIGTERM');
            resolve({ success: false, error: 'Conversion timeout' });
        }, TIMEOUT_MS);
        
        proc.on('close', (code) => {
            clearTimeout(timeout);
            
            if (code === 0 && existsSync(outputFile)) {
                const stats = statSync(outputFile);
                if (stats.size > 1000) { // At least 1KB
                    console.log(`[merge] Success: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
                    resolve({ success: true, outputPath: outputFile });
                } else {
                    resolve({ success: false, error: 'Output file too small - conversion may have failed' });
                }
            } else {
                // Check for common errors and provide better messages
                if (stderr.includes('does not contain any stream') || stderr.includes('Output file is empty')) {
                    // This usually means FFmpeg couldn't access/download the URL
                    resolve({ success: false, error: 'Gagal mengakses video. URL mungkin expired atau butuh autentikasi.' });
                } else if (stderr.includes('Server returned 403') || stderr.includes('403 Forbidden')) {
                    resolve({ success: false, error: 'Akses ditolak (403). Coba refresh halaman dan download ulang.' });
                } else if (stderr.includes('Server returned 404') || stderr.includes('404 Not Found')) {
                    resolve({ success: false, error: 'Video tidak ditemukan (404). URL mungkin sudah expired.' });
                } else if (stderr.includes('Invalid argument') || stderr.includes('Invalid data')) {
                    // Filename or path issue - retry with simpler name
                    console.log(`[merge] Retrying with simple filename...`);
                    retryWithReencode(inputUrl, outputDir, outputFormat, 'output', resolve, platform);
                } else if (stderr.includes('codec copy')) {
                    console.log(`[merge] Retrying with re-encode...`);
                    retryWithReencode(inputUrl, outputDir, outputFormat, filename, resolve, platform);
                } else if (stderr.includes('Connection refused') || stderr.includes('Connection timed out')) {
                    resolve({ success: false, error: 'Koneksi ke server gagal. Coba lagi nanti.' });
                } else {
                    const errMsg = stderr.slice(-300) || 'Conversion failed';
                    console.error(`[merge] Failed: ${errMsg}`);
                    resolve({ success: false, error: errMsg });
                }
            }
        });
        
        proc.on('error', (e) => {
            clearTimeout(timeout);
            resolve({ success: false, error: e.message });
        });
    });
}

function retryWithReencode(
    inputUrl: string,
    outputDir: string,
    outputFormat: 'mp4' | 'mp3' | 'm4a',
    filename: string,
    resolve: (result: ConvertResult) => void,
    platform?: string
): void {
    const ffmpegPath = findFFmpegPath();
    const outputFile = path.join(outputDir, `${filename}.${outputFormat}`);
    
    const args: string[] = ['-y'];
    
    // Add headers
    const headers = getFFmpegHeaders(inputUrl, platform);
    if (headers) {
        args.push('-headers', headers);
    }
    args.push('-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    args.push('-i', inputUrl);
    
    if (outputFormat === 'mp4') {
        // Re-encode video to H.264
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k');
    } else if (outputFormat === 'mp3') {
        args.push('-vn', '-acodec', 'libmp3lame', '-q:a', '2');
    } else {
        args.push('-vn', '-acodec', 'aac', '-b:a', '192k');
    }
    
    args.push(outputFile);
    
    const proc = spawn(ffmpegPath, args, { timeout: TIMEOUT_MS * 2, windowsHide: true });
    let stderr = '';
    
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    
    proc.on('close', (code) => {
        if (code === 0 && existsSync(outputFile)) {
            const stats = statSync(outputFile);
            if (stats.size > 1000) {
                resolve({ success: true, outputPath: outputFile });
            } else {
                resolve({ success: false, error: 'Output file too small after re-encode' });
            }
        } else {
            resolve({ success: false, error: stderr.slice(-300) || 'Re-encode failed' });
        }
    });
    
    proc.on('error', (e) => {
        resolve({ success: false, error: e.message });
    });
}

// ============================================================================
// Output Validation
// ============================================================================

async function validateOutput(filePath: string, isAudio: boolean): Promise<{ valid: boolean; error?: string; size?: number }> {
    try {
        const fs = await import('fs/promises');
        const stats = await fs.stat(filePath);
        
        const minSize = isAudio ? 5000 : 10000;
        if (stats.size < minSize) {
            return { valid: false, error: `File too small (${stats.size} bytes)`, size: stats.size };
        }
        
        // Read header for validation
        const buffer = Buffer.alloc(12);
        const fd = await fs.open(filePath, 'r');
        await fd.read(buffer, 0, 12, 0);
        await fd.close();
        
        if (isAudio) {
            const isID3 = buffer.toString('ascii', 0, 3) === 'ID3';
            const isMp3Sync = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
            const ftyp = buffer.toString('ascii', 4, 8);
            const isM4a = ftyp === 'ftyp';
            
            if (!isID3 && !isMp3Sync && !isM4a) {
                return { valid: false, error: 'Invalid audio header', size: stats.size };
            }
        } else {
            const ftyp = buffer.toString('ascii', 4, 8);
            if (ftyp !== 'ftyp') {
                return { valid: false, error: `Invalid MP4 header`, size: stats.size };
            }
        }
        
        return { valid: true, size: stats.size };
    } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : 'Validation failed' };
    }
}

// ============================================================================
// API Route Handler
// ============================================================================

export async function POST(req: NextRequest) {
    const id = randomUUID();
    let temp: string | null = null;
    let slotAcquired = false;
    
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';
    
    console.log(`[merge] Request ${id} from ${ip}`);
    
    try {
        // Memory check
        const memCheck = checkMemoryUsage();
        if (!memCheck.ok) {
            return NextResponse.json({
                success: false,
                error: 'Server sedang sibuk. Coba lagi dalam 1-2 menit.',
                errorCode: 'SERVER_BUSY'
            }, { status: 503 });
        }
        
        const body = await req.json();
        const { url, format = 'mp4', filename = 'download', platform = '' } = body;
        
        // Validate URL
        if (!url) {
            return NextResponse.json({ success: false, error: 'Missing url parameter' }, { status: 400 });
        }
        
        if (!isValidMediaUrl(url)) {
            return NextResponse.json({ success: false, error: 'Invalid URL' }, { status: 400 });
        }
        
        // Redirect YouTube to dedicated endpoint
        if (isYouTubeUrl(url)) {
            return NextResponse.json({
                success: false,
                error: 'Untuk YouTube, gunakan /api/v1/merge/youtube',
                errorCode: 'USE_YOUTUBE_ENDPOINT'
            }, { status: 400 });
        }
        
        // Validate format
        const outputFormat = VALID_FORMATS.includes(format) ? format : 'mp4';
        const isAudio = outputFormat === 'mp3' || outputFormat === 'm4a';
        
        // Sanitize filename - remove ALL non-ASCII and problematic characters
        const safeFilename = filename
            .normalize('NFD')                    // Decompose unicode
            .replace(/[\u0300-\u036f]/g, '')     // Remove diacritics
            .replace(/[^\x00-\x7F]/g, '')        // Remove non-ASCII (emoji, CJK, etc)
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Remove Windows forbidden chars
            .replace(/\s+/g, '_')                // Spaces to underscore
            .replace(/_+/g, '_')                 // Collapse multiple underscores
            .replace(/^_|_$/g, '')               // Trim leading/trailing underscores
            .slice(0, 100) || 'download';
        
        // Acquire queue slot
        const queueResult = await mergeQueueAcquire(id, ip);
        if (!queueResult.allowed) {
            let userError = queueResult.error || 'Server busy';
            if (queueResult.error?.includes('Rate limit')) {
                const minutes = Math.ceil((queueResult.rateLimitResetIn || 60000) / 60000);
                userError = `Kamu sudah download 5 file dalam 10 menit terakhir. Tunggu ${minutes} menit lagi!`;
            }
            return NextResponse.json({
                success: false,
                error: userError,
                errorCode: 'RATE_LIMITED'
            }, { status: 429 });
        }
        
        slotAcquired = true;
        console.log(`[merge] Processing: ${outputFormat}`);
        
        // Setup temp folder
        temp = getTempFolder(id);
        
        // Convert
        const result = await convertMedia(url, temp, outputFormat as 'mp4' | 'mp3' | 'm4a', safeFilename, platform);
        
        if (!result.success || !result.outputPath) {
            if (temp) cleanupFolder(temp);
            mergeQueueRelease(id);
            return NextResponse.json({
                success: false,
                error: result.error || 'Conversion failed'
            }, { status: 500 });
        }
        
        // Validate output
        const validation = await validateOutput(result.outputPath, isAudio);
        if (!validation.valid) {
            if (temp) cleanupFolder(temp);
            mergeQueueRelease(id);
            return NextResponse.json({
                success: false,
                error: validation.error || 'Output validation failed'
            }, { status: 500 });
        }
        
        // Check filesize
        if (validation.size && validation.size > MAX_FILESIZE_BYTES) {
            const actualMB = Math.round(validation.size / 1024 / 1024);
            if (temp) cleanupFolder(temp);
            mergeQueueRelease(id);
            return NextResponse.json({
                success: false,
                error: `File terlalu besar (${actualMB}MB). Maksimal ${MAX_FILESIZE_MB}MB.`,
                errorCode: 'FILE_TOO_LARGE'
            }, { status: 400 });
        }
        
        // Stream file to client
        const stats = statSync(result.outputPath);
        const stream = createReadStream(result.outputPath);
        const folder = temp;
        const requestId = id;
        
        const webStream = new ReadableStream({
            start(ctrl) {
                stream.on('data', (chunk) => ctrl.enqueue(chunk));
                stream.on('end', () => {
                    ctrl.close();
                    mergeQueueRelease(requestId);
                    scheduleCleanup(folder);
                });
                stream.on('error', (e) => {
                    ctrl.error(e);
                    mergeQueueRelease(requestId);
                    cleanupFolder(folder);
                });
            },
            cancel() {
                stream.destroy();
                mergeQueueRelease(requestId);
                cleanupFolder(folder);
            }
        });
        
        const contentType = outputFormat === 'mp3' ? 'audio/mpeg' :
                          outputFormat === 'm4a' ? 'audio/mp4' :
                          'video/mp4';
        
        const finalFilename = `${safeFilename}.${outputFormat}`;
        
        console.log(`[merge] Streaming: ${finalFilename} (${stats.size} bytes)`);
        
        return new NextResponse(webStream, {
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(stats.size),
                'Content-Disposition': `attachment; filename="${encodeURIComponent(finalFilename)}"; filename*=UTF-8''${encodeURIComponent(finalFilename)}`,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
                'X-File-Size': String(stats.size),
            }
        });
        
    } catch (error) {
        console.error(`[merge] Error:`, error);
        if (slotAcquired) mergeQueueRelease(id);
        if (temp) cleanupFolder(temp);
        
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal error'
        }, { status: 500 });
    }
}

// Queue status
export async function GET() {
    const status = mergeQueueStatus();
    return NextResponse.json({ success: true, queue: status });
}

// CORS
export async function OPTIONS() {
    return new NextResponse(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}
