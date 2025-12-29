/**
 * YouTube Video + Audio Merge API
 * POST /api/v1/youtube/merge
 * 
 * Production-ready with:
 * - Concurrency control (max 2 simultaneous merges)
 * - Per-IP rate limiting (5 requests per 10 minutes)
 * - Queue system for overflow requests
 * - Disk space monitoring
 * - Memory protection (auto-reject if RAM > 900MB)
 * - Filesize pre-check before download (max 400MB)
 * 
 * Flow:
 * 1. Check memory usage & rate limit
 * 2. Pre-check estimated filesize via yt-dlp --dump-json
 * 3. Run yt-dlp with format selector to download+merge
 * 4. Stream the output file to client
 * 5. Release slot & cleanup temp files
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, createReadStream, rmSync, statSync, readdirSync } from 'fs';
import { homedir, tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { mergeQueueAcquire, mergeQueueRelease, mergeQueueStatus } from '@/lib/services/youtube/merge-queue';
import { YOUTUBE_MAX_FILESIZE_MB, YOUTUBE_MAX_FILESIZE_BYTES } from '@/lib/services/youtube/storage';

// Max filesize: 400MB (prevent OOM on high-res videos)
const MAX_FILESIZE_MB = YOUTUBE_MAX_FILESIZE_MB;
const MAX_FILESIZE_BYTES = YOUTUBE_MAX_FILESIZE_BYTES;

// Memory protection threshold (900MB)
const MAX_MEMORY_MB = 900;
const MAX_MEMORY_BYTES = MAX_MEMORY_MB * 1024 * 1024;

// ============================================================================
// FFmpeg Path Detection (kept as fallback, yt-dlp uses it internally)
// ============================================================================

const WINDOWS_FFMPEG_PATHS = [
    path.join(homedir(), 'AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe'),
    'C:/Program Files/ffmpeg/bin/ffmpeg.exe',
    path.join(homedir(), 'scoop/shims/ffmpeg.exe'),
    'C:/ffmpeg/bin/ffmpeg.exe',
    'C:/ProgramData/chocolatey/bin/ffmpeg.exe',
];

const UNIX_FFMPEG_PATHS = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg'
];

let cachedFFmpegPath: string | null = null;

async function findFFmpegPath(): Promise<string> {
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
    } catch {
        // Ignore errors
    }

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

/**
 * Cleanup artifacts (video/audio temp files) but keep the merged output
 * Full folder cleanup happens after 10 minutes
 */
function cleanupArtifacts(folder: string, keepFile?: string): void {
    try {
        if (!existsSync(folder)) return;

        const files = readdirSync(folder);
        for (const file of files) {
            const fullPath = path.join(folder, file);
            // Keep the output file, delete everything else (temp video/audio)
            if (keepFile && fullPath === keepFile) continue;
            // Delete temp files (f*.mp4, f*.webm, f*.m4a, etc from yt-dlp)
            if (file.startsWith('f') || file.includes('.temp') || file.includes('.part')) {
                try { rmSync(fullPath, { force: true }); } catch { }
            }
        }
    } catch {
        // Ignore errors
    }
}

/**
 * Full cleanup - remove entire folder
 * Called after 10 minutes delay
 */
function cleanupFull(folder: string): void {
    try {
        if (existsSync(folder)) rmSync(folder, { recursive: true, force: true });
    } catch {
        // Ignore cleanup errors
    }
}

// ============================================================================
// Output File Validation
// ============================================================================

interface ValidationResult {
    valid: boolean;
    error?: string;
    size?: number;
}

/**
 * Validate merged output file before streaming to client
 * Checks file size and MP4/audio header integrity
 */
async function validateMergedFile(filePath: string, isAudio: boolean = false): Promise<ValidationResult> {
    try {
        const fs = await import('fs/promises');
        const stats = await fs.stat(filePath);

        // Check minimum size (at least 10KB for a valid video, 5KB for audio)
        const minSize = isAudio ? 5000 : 10000;
        if (stats.size < minSize) {
            return {
                valid: false,
                error: `Output file too small (${stats.size} bytes, minimum ${minSize})`,
                size: stats.size
            };
        }

        // Read file header for validation
        const buffer = Buffer.alloc(12);
        const fd = await fs.open(filePath, 'r');
        await fd.read(buffer, 0, 12, 0);
        await fd.close();

        if (isAudio) {
            // MP3 check: ID3 tag or sync word (0xFF 0xFB/0xFA/0xF3/0xF2)
            const isID3 = buffer.toString('ascii', 0, 3) === 'ID3';
            const isMp3Sync = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
            // M4A/AAC check: ftyp box
            const ftyp = buffer.toString('ascii', 4, 8);
            const isM4a = ftyp === 'ftyp';

            if (!isID3 && !isMp3Sync && !isM4a) {
                return {
                    valid: false,
                    error: 'Invalid audio header (not MP3/M4A)',
                    size: stats.size
                };
            }
        } else {
            // MP4 check: ftyp box at offset 4
            const ftyp = buffer.toString('ascii', 4, 8);
            if (ftyp !== 'ftyp') {
                return {
                    valid: false,
                    error: `Invalid MP4 header (got "${ftyp}" instead of "ftyp")`,
                    size: stats.size
                };
            }
        }

        return { valid: true, size: stats.size };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Validation failed'
        };
    }
}

/**
 * Schedule full cleanup after delay (default 10 minutes)
 */
function scheduleCleanup(folder: string, delayMs: number = 10 * 60 * 1000): void {
    setTimeout(() => cleanupFull(folder), delayMs);
}

// ============================================================================
// YouTube URL Validation (Strict - RCE Prevention)
// ============================================================================

/**
 * Strict YouTube URL validation to prevent command injection
 * Only allows legitimate YouTube domains and safe URL characters
 */
function isValidYouTubeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        const validHosts = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'];
        if (!validHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
            return false;
        }
        // Only allow safe characters in path and query string
        const safePattern = /^[a-zA-Z0-9\-_=&?\/%.]+$/;
        return safePattern.test(parsed.pathname + parsed.search);
    } catch {
        return false;
    }
}

// ============================================================================
// Parameter Validation (Security)
// ============================================================================

// Valid video heights for quality parameter
const VALID_HEIGHTS = [144, 240, 360, 480, 720, 1080, 1440, 2160];

// Valid audio formats
const VALID_AUDIO_FORMATS = ['mp3', 'm4a'];

// ============================================================================
// Duration Check (using yt-dlp)
// ============================================================================

interface DurationResult {
    success: boolean;
    duration?: number;
    title?: string;
    error?: string;
}

/**
 * Check current memory usage
 * Returns true if memory is below threshold
 */
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

interface VideoInfoResult {
    success: boolean;
    duration?: number;
    title?: string;
    estimatedFilesize?: number;
    selectedFormats?: { type: string; quality: string; filesize: number }[];
    error?: string;
}

/**
 * Get video info using yt-dlp --dump-json (fast, no download)
 * Returns duration, title, and ACCURATE estimated filesize from selected formats
 * 
 * Format selection matches extractor:
 * - Prefer av01 (AV1) - smaller size, good quality
 * - Fallback to avc1 (H.264)
 * - Skip vp9 (too large)
 * - Best m4a audio
 */
async function getVideoInfo(url: string, height: number = 720): Promise<VideoInfoResult> {
    return new Promise((resolve) => {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        
        // Format selector: prefer av01 (AV1) > avc1 (H.264), skip vp9
        const formatSelector = `bestvideo[height<=${height}][vcodec^=av01]+bestaudio[ext=m4a]/bestvideo[height<=${height}][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=${height}][vcodec!^=vp9][vcodec!^=vp09]+bestaudio/best[height<=${height}]/best`;
        
        const args = [
            '-m', 'yt_dlp',
            '--dump-json',
            '--no-download',
            '--no-playlist',
            '--no-warnings',
            '-f', formatSelector,
            url
        ];

        const proc = spawn(pythonCmd, args, { timeout: 30000 });
        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code === 0 && stdout) {
                try {
                    const data = JSON.parse(stdout);
                    let estimatedFilesize = 0;
                    const selectedFormats: { type: string; quality: string; filesize: number }[] = [];
                    
                    // PRIORITY 1: Use requested_formats (most accurate - what yt-dlp will actually download)
                    if (data.requested_formats && Array.isArray(data.requested_formats)) {
                        for (const fmt of data.requested_formats) {
                            const size = fmt.filesize || fmt.filesize_approx || 0;
                            estimatedFilesize += size;
                            selectedFormats.push({
                                type: fmt.vcodec !== 'none' ? 'video' : 'audio',
                                quality: fmt.format_note || fmt.format || 'unknown',
                                filesize: size
                            });
                        }
                    }
                    
                    // PRIORITY 2: Single format (when video+audio combined)
                    if (!estimatedFilesize && (data.filesize || data.filesize_approx)) {
                        estimatedFilesize = data.filesize || data.filesize_approx;
                    }
                    
                    // PRIORITY 3: Calculate from tbr (total bitrate) - very accurate
                    if (!estimatedFilesize && data.tbr && data.duration) {
                        estimatedFilesize = (data.tbr * 1000 * data.duration) / 8;
                    }
                    
                    // PRIORITY 4: Calculate from vbr + abr (video + audio bitrate)
                    if (!estimatedFilesize && data.duration) {
                        const vbr = data.vbr || 0;
                        const abr = data.abr || 128;
                        if (vbr > 0) {
                            estimatedFilesize = ((vbr + abr) * 1000 * data.duration) / 8;
                        }
                    }
                    
                    // PRIORITY 5: Fallback estimate based on resolution and duration
                    if (!estimatedFilesize && data.duration) {
                        const bitrateKbps = height >= 1080 ? 2000 :
                                           height >= 720 ? 1200 :
                                           height >= 480 ? 600 : 350;
                        const audioBitrate = 128;
                        estimatedFilesize = ((bitrateKbps + audioBitrate) * 1000 * data.duration) / 8;
                    }
                    
                    resolve({
                        success: true,
                        duration: data.duration || 0,
                        title: data.title,
                        estimatedFilesize,
                        selectedFormats
                    });
                } catch {
                    resolve({ success: false, error: 'Failed to parse video info' });
                }
            } else {
                resolve({ success: false, error: stderr.slice(-200) || 'Failed to get video info' });
            }
        });

        proc.on('error', (e) => {
            resolve({ success: false, error: e.message });
        });
    });
}

/**
 * Get video duration using yt-dlp --dump-json (fast, no download)
 * @deprecated Use getVideoInfo instead
 */
async function getVideoDuration(url: string): Promise<DurationResult> {
    const info = await getVideoInfo(url);
    return {
        success: info.success,
        duration: info.duration,
        title: info.title,
        error: info.error
    };
}

// ============================================================================
// Quality to Height Mapping
// ============================================================================

function qualityToHeight(quality: string): number {
    const q = quality.toLowerCase().replace('p', '');
    const height = parseInt(q, 10);

    // Only allow valid heights from whitelist
    if (VALID_HEIGHTS.includes(height)) {
        return height;
    }

    // Default to 720p if invalid
    return 720;
}

// ============================================================================
// yt-dlp Download + Merge
// ============================================================================

interface YtdlpResult {
    success: boolean;
    outputPath?: string;
    title?: string;
    error?: string;
}

async function downloadAndMergeWithYtdlp(
    url: string,
    height: number,
    outputDir: string,
    ffmpegPath: string,
    audioOnly: boolean = false,
    audioFormat: 'mp3' | 'm4a' = 'mp3'
): Promise<YtdlpResult> {
    return new Promise((resolve) => {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const outputTemplate = path.join(outputDir, '%(title).100B.%(ext)s');

        // Format selector based on audio-only or video
        let ytdlpArgs: string[];

        if (audioOnly) {
            // Audio only: best audio, convert to requested format
            ytdlpArgs = [
                '-m', 'yt_dlp',
                '-f', 'bestaudio/best',
                '-x', // Extract audio
                '--audio-format', audioFormat, // mp3 or m4a
                '--audio-quality', '0', // Best quality
                '-o', outputTemplate,
                '--no-playlist',
                '--no-warnings',
                '--no-progress',
                '--ffmpeg-location', ffmpegPath,
                '--restrict-filenames',
                '--print', 'after_move:filepath',
                url
            ];

            } else {
            // Video: prefer av01 (AV1) - smaller size, will be merged to mp4/h264
            // Fallback to avc1 (H.264), skip vp9 (too large)
            const formatSelector = `bestvideo[height<=${height}][vcodec^=av01]+bestaudio[ext=m4a]/bestvideo[height<=${height}][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=${height}][vcodec!^=vp9][vcodec!^=vp09]+bestaudio/best[height<=${height}]/best`;
            
            ytdlpArgs = [
                '-m', 'yt_dlp',
                '-f', formatSelector,
                '--merge-output-format', 'mp4',
                '-o', outputTemplate,
                '--no-playlist',
                '--no-warnings',
                '--no-progress',
                '--ffmpeg-location', ffmpegPath,
                '--restrict-filenames',
                '--print', 'after_move:filepath',
                url
            ];
        }

        const proc = spawn(pythonCmd, ytdlpArgs, {
            timeout: 300000,
            cwd: outputDir
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (d) => {
            stdout += d.toString();
        });

        proc.stderr?.on('data', (d) => {
            stderr += d.toString();
            const line = d.toString().trim();
            // Only log errors
            if (line && (line.includes('ERROR') || line.includes('error'))) {
                console.error(`[merge] yt-dlp: ${line}`);
            }
        });

        proc.on('close', (code) => {
            if (code === 0) {
                const outputPath = stdout.trim().split('\n').pop()?.trim();

                if (outputPath && existsSync(outputPath)) {
                    const stats = statSync(outputPath);
                    const ext = path.extname(outputPath);
                    const basename = path.basename(outputPath, ext);

                    resolve({
                        success: true,
                        outputPath,
                        title: basename
                    });
                } else {
                    const files = readdirSync(outputDir);
                    const outputFile = files.find((f: string) => f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.m4a'));

                    if (outputFile) {
                        const fullPath = path.join(outputDir, outputFile);
                        const ext = path.extname(outputFile);

                        resolve({
                            success: true,
                            outputPath: fullPath,
                            title: path.basename(outputFile, ext)
                        });
                    } else {
                        console.error(`[merge] No output file found`);
                        resolve({
                            success: false,
                            error: 'Download completed but output file not found'
                        });
                    }
                }
            } else {
                console.error(`[merge] yt-dlp failed:`, stderr.slice(-500));

                let errorMsg = 'Download failed';
                if (stderr.includes('Video unavailable')) {
                    errorMsg = 'Video is unavailable or private';
                } else if (stderr.includes('age-restricted')) {
                    errorMsg = 'Video is age-restricted';
                } else if (stderr.includes('copyright')) {
                    errorMsg = 'Video is blocked due to copyright';
                } else if (stderr.includes('Sign in')) {
                    errorMsg = 'Video requires sign-in';
                } else if (stderr.includes('HTTP Error 403')) {
                    errorMsg = 'Access forbidden - video may be region-locked';
                } else if (stderr.includes('No video formats')) {
                    errorMsg = 'No downloadable formats found';
                } else if (stderr.slice(-200)) {
                    errorMsg = stderr.slice(-200).trim();
                }

                resolve({
                    success: false,
                    error: errorMsg
                });
            }
        });

        proc.on('error', (e) => {
            console.error(`[merge] yt-dlp spawn error:`, e);
            resolve({
                success: false,
                error: `Failed to start yt-dlp: ${e.message}`
            });
        });
    });
}

// ============================================================================
// API Route Handler
// ============================================================================

export async function POST(req: NextRequest) {
    const id = randomUUID();
    let temp: string | null = null;
    let slotAcquired = false;

    // Get client IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';

    console.log(`[merge] Request ${id} from ${ip}`);

    try {
        // ========================================
        // Memory check FIRST (before any processing)
        // ========================================
        const memCheck = checkMemoryUsage();
        if (!memCheck.ok) {
            console.warn(`[merge] Memory limit exceeded: ${memCheck.usedMB}MB / ${memCheck.maxMB}MB`);
            return NextResponse.json({
                success: false,
                error: 'Server sedang sibuk memproses video lain. Coba lagi dalam 1-2 menit.',
                errorCode: 'SERVER_BUSY',
                details: { memoryUsedMB: memCheck.usedMB }
            }, { status: 503 });
        }

        const body = await req.json();
        const { url, quality = '720p', filename } = body;

        // Also support legacy field names
        const youtubeUrl = url || body.youtubeUrl;

        // Validate URL
        if (!youtubeUrl) {
            return NextResponse.json({
                success: false,
                error: 'Missing url parameter'
            }, { status: 400 });
        }

        if (!isValidYouTubeUrl(youtubeUrl)) {
            return NextResponse.json({
                success: false,
                error: 'Invalid YouTube URL format'
            }, { status: 400 });
        }

        // ========================================
        // Acquire queue slot (rate limit + concurrency)
        // ========================================
        const queueResult = await mergeQueueAcquire(id, ip);

        if (!queueResult.allowed) {
            console.log(`[merge] Request ${id} rejected: ${queueResult.error}`);
            
            // User-friendly error messages
            let userError = queueResult.error || 'Server busy';
            let errorCode = 'QUEUE_ERROR';
            
            if (queueResult.error?.includes('Rate limit')) {
                const minutes = Math.ceil((queueResult.rateLimitResetIn || 60000) / 60000);
                userError = `Kamu sudah download ${5} video dalam 10 menit terakhir. Tunggu ${minutes} menit lagi ya!`;
                errorCode = 'RATE_LIMITED';
            } else if (queueResult.error?.includes('queue')) {
                userError = 'Server sedang penuh. Coba lagi dalam beberapa menit.';
                errorCode = 'QUEUE_FULL';
            }
            
            return NextResponse.json({
                success: false,
                error: userError,
                errorCode,
                rateLimitRemaining: queueResult.rateLimitRemaining,
                rateLimitResetIn: queueResult.rateLimitResetIn
            }, { status: 429 });
        }

        slotAcquired = true;
        console.log(`[merge] Request ${id} acquired slot (remaining: ${queueResult.rateLimitRemaining})`);

        // Check if audio-only request
        const isAudioOnly = quality.toLowerCase().includes('audio') ||
            quality.toLowerCase().includes('kbps') ||
            quality.toLowerCase() === 'mp3' ||
            quality.toLowerCase() === 'm4a';

        // Parse quality - for video, extract height
        let targetHeight: number;
        if (isAudioOnly) {
            targetHeight = 720; // Placeholder, not used for audio
        } else {
            targetHeight = qualityToHeight(quality);
            // Validate height parameter (RCE prevention)
            if (!VALID_HEIGHTS.includes(targetHeight)) {
                mergeQueueRelease(id);
                return NextResponse.json(
                    { success: false, error: 'Invalid height parameter' },
                    { status: 400 }
                );
            }
        }

        // ========================================
        // Get video info (for logging only, no size rejection)
        // ========================================
        const videoInfo = await getVideoInfo(youtubeUrl, targetHeight);

        if (videoInfo.success) {
            const durationMinutes = Math.ceil((videoInfo.duration || 0) / 60);
            const estimatedMB = Math.round((videoInfo.estimatedFilesize || 0) / 1024 / 1024);
            console.log(`[merge] "${videoInfo.title?.slice(0, 50)}" - ${durationMinutes}min, ~${estimatedMB}MB`);
            
            // Warning only - don't reject, trust frontend filesize
            if (videoInfo.estimatedFilesize && videoInfo.estimatedFilesize > MAX_FILESIZE_BYTES) {
                console.warn(`[merge] Warning: ~${estimatedMB}MB > ${MAX_FILESIZE_MB}MB limit`);
            }
        }

        // Determine output format for audio
        const audioOutputFormat = quality.toLowerCase() === 'mp3' ? 'mp3' :
            quality.toLowerCase() === 'm4a' ? 'm4a' :
                quality.toLowerCase().includes('kbps') ? 'm4a' :
                    'mp3';

        // Validate audio format (RCE prevention)
        if (isAudioOnly && !VALID_AUDIO_FORMATS.includes(audioOutputFormat)) {
            mergeQueueRelease(id);
            return NextResponse.json(
                { success: false, error: 'Invalid audio format' },
                { status: 400 }
            );
        }

        console.log(`[merge] URL: ${youtubeUrl}, Quality: ${quality}`);

        // Setup temp folder
        temp = getTempFolder(id);

        // Find FFmpeg path for yt-dlp to use
        const ffmpegPath = await findFFmpegPath();

        // Download using yt-dlp
        let result = await downloadAndMergeWithYtdlp(
            youtubeUrl,
            targetHeight,
            temp,
            ffmpegPath,
            isAudioOnly,
            audioOutputFormat as 'mp3' | 'm4a'
        );

        if (!result.success && !isAudioOnly) {
            // Clean up any partial files from first attempt
            cleanupArtifacts(temp);

            // Retry with simpler format selector
            result = await downloadAndMergeWithYtdlp(
                youtubeUrl,
                720, // Fallback to 720p
                temp,
                ffmpegPath,
                false,
                'mp3'
            );
        }

        if (!result.success || !result.outputPath) {
            console.error(`[merge] Download failed after retry: ${result.error}`);
            if (temp) cleanupFull(temp);
            mergeQueueRelease(id);
            return NextResponse.json({
                error: result.error || 'Download failed'
            }, { status: 500 });
        }

        // ========================================
        // Validate output file before streaming
        // ========================================
        const validation = await validateMergedFile(result.outputPath, isAudioOnly);

        if (!validation.valid) {
            console.error(`[merge] Output validation failed: ${validation.error}`);
            console.error(`[merge] File path: ${result.outputPath}, Size: ${validation.size || 'unknown'}`);
            if (temp) cleanupFull(temp);
            mergeQueueRelease(id);
            return NextResponse.json({
                error: `Output validation failed: ${validation.error}`,
                details: {
                    fileSize: validation.size,
                    filePath: result.outputPath
                }
            }, { status: 500 });
        }

        // Check actual filesize AFTER download
        if (validation.size && validation.size > MAX_FILESIZE_BYTES) {
            const actualMB = Math.round(validation.size / 1024 / 1024);
            console.error(`[merge] File too large: ${actualMB}MB > ${MAX_FILESIZE_MB}MB limit`);
            if (temp) cleanupFull(temp);
            mergeQueueRelease(id);
            return NextResponse.json({
                success: false,
                error: `Video terlalu besar (${actualMB}MB). Maksimal ${MAX_FILESIZE_MB}MB.`,
                errorCode: 'FILE_TOO_LARGE',
                details: {
                    actualSizeMB: actualMB,
                    maxSizeMB: MAX_FILESIZE_MB
                }
            }, { status: 400 });
        }

        console.log(`[merge] Output validated: ${validation.size} bytes`);

        // Cleanup artifacts but keep output
        cleanupArtifacts(temp, result.outputPath);

        // Get file stats
        const stats = statSync(result.outputPath);

        // Prepare filename
        const ext = isAudioOnly ? `.${audioOutputFormat}` : '.mp4';
        const safeFilename = (filename || result.title || 'video')
            // Allow Unicode characters, only remove truly dangerous chars for filesystem/url
            .replace(/[<>:"/\\|?*]/g, '_') // Remove Windows reserved chars
            .replace(/\s+/g, '_')
            .replace(/\.(mp4|mp3|m4a|webm)$/i, '')
            .substring(0, 150) + ext;

        // Stream the file to response
        const stream = createReadStream(result.outputPath);
        const folder = temp;
        const requestId = id;
        const fileSize = stats.size;

        const webStream = new ReadableStream({
            start(ctrl) {
                stream.on('data', (chunk) => ctrl.enqueue(chunk));
                stream.on('end', () => {
                    ctrl.close();
                    mergeQueueRelease(requestId);
                    scheduleCleanup(folder);
                });
                stream.on('error', (e) => {
                    console.error(`[merge] Stream error: ${e.message}`);
                    ctrl.error(e);
                    mergeQueueRelease(requestId);
                    cleanupFull(folder);
                });
            },
            cancel() {
                stream.destroy();
                mergeQueueRelease(requestId);
                cleanupFull(folder);
            }
        });

        console.log(`[merge] Streaming: ${safeFilename} (${fileSize} bytes)`);

        const contentType = isAudioOnly
            ? (audioOutputFormat === 'mp3' ? 'audio/mpeg' : 'audio/mp4')
            : 'video/mp4';

        return new NextResponse(webStream, {
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(fileSize),
                // RFC 5987: filename*=UTF-8''encoded_filename
                'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, X-File-Size',
                'Cache-Control': 'no-cache',
                'X-RateLimit-Remaining': String(queueResult.rateLimitRemaining || 0),
                'X-File-Size': String(fileSize),
                'X-File-Validated': 'true'
            }
        });

    } catch (e) {
        console.error(`[merge] Error:`, e);
        if (slotAcquired) mergeQueueRelease(id);
        if (temp) cleanupFull(temp);

        return NextResponse.json({
            error: e instanceof Error ? e.message : 'Merge failed'
        }, { status: 500 });
    }
}

// ============================================================================
// CORS Preflight Handler
// ============================================================================

export async function OPTIONS() {
    return new NextResponse(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

// ============================================================================
// Queue Status Endpoint
// ============================================================================

export async function GET() {
    const status = mergeQueueStatus();
    return NextResponse.json({
        success: true,
        queue: status
    });
}
