/**
 * YouTube Video + Audio Merge API
 * POST /api/v1/youtube/merge
 * 
 * Production-ready with:
 * - Concurrency control (max 3 simultaneous merges)
 * - Per-IP rate limiting (5 requests per 10 minutes)
 * - Queue system for overflow requests
 * - Disk space monitoring
 * 
 * Flow:
 * 1. Check rate limit & acquire queue slot
 * 2. Run yt-dlp with format selector to download+merge
 * 3. Stream the output file to client
 * 4. Release slot & cleanup temp files
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, createReadStream, rmSync, statSync, readdirSync } from 'fs';
import { homedir, tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { mergeQueueAcquire, mergeQueueRelease, mergeQueueStatus } from '@/lib/services/youtube/merge-queue';

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
                try { rmSync(fullPath, { force: true }); } catch {}
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

/**
 * Schedule full cleanup after delay (default 10 minutes)
 */
function scheduleCleanup(folder: string, delayMs: number = 10 * 60 * 1000): void {
    setTimeout(() => cleanupFull(folder), delayMs);
}

// ============================================================================
// YouTube URL Validation
// ============================================================================

const YOUTUBE_URL_PATTERNS = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
    /^https?:\/\/m\.youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/music\.youtube\.com\/watch\?v=[\w-]+/,
];

function isValidYouTubeUrl(url: string): boolean {
    return YOUTUBE_URL_PATTERNS.some(pattern => pattern.test(url));
}

// ============================================================================
// Quality to Height Mapping
// ============================================================================

function qualityToHeight(quality: string): number {
    const q = quality.toLowerCase().replace('p', '');
    const height = parseInt(q, 10);
    
    // Valid heights
    if ([2160, 1440, 1080, 720, 480, 360, 240, 144].includes(height)) {
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
            
            console.log(`[merge] Running yt-dlp (audio-only, format=${audioFormat})...`);
        } else {
            // Video: best video up to height + best audio, merged to mp4
            const formatSelector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
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
            
            console.log(`[merge] Running yt-dlp (video height<=${height})...`);
        }
        
        console.log(`[merge] Command: ${pythonCmd} ${ytdlpArgs.join(' ')}`);
        
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
            if (line && !line.includes('[download]')) {
                console.log(`[merge] yt-dlp: ${line}`);
            }
        });
        
        proc.on('close', (code) => {
            console.log(`[merge] yt-dlp exited with code ${code}`);
            
            if (code === 0) {
                const outputPath = stdout.trim().split('\n').pop()?.trim();
                
                if (outputPath && existsSync(outputPath)) {
                    const stats = statSync(outputPath);
                    console.log(`[merge] Output: ${outputPath} (${stats.size} bytes)`);
                    const ext = path.extname(outputPath);
                    const basename = path.basename(outputPath, ext);
                    
                    resolve({
                        success: true,
                        outputPath,
                        title: basename
                    });
                } else {
                    const files = readdirSync(outputDir);
                    // Look for mp4 or mp3 output
                    const outputFile = files.find((f: string) => f.endsWith('.mp4') || f.endsWith('.mp3'));
                    
                    if (outputFile) {
                        const fullPath = path.join(outputDir, outputFile);
                        const stats = statSync(fullPath);
                        console.log(`[merge] Found output: ${fullPath} (${stats.size} bytes)`);
                        const ext = path.extname(outputFile);
                        
                        resolve({
                            success: true,
                            outputPath: fullPath,
                            title: path.basename(outputFile, ext)
                        });
                    } else {
                        console.error(`[merge] No output file found. stdout: ${stdout}, stderr: ${stderr}`);
                        resolve({
                            success: false,
                            error: 'Download completed but output file not found'
                        });
                    }
                }
            } else {
                console.error(`[merge] yt-dlp failed:`, stderr.slice(-1000));
                
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
        const body = await req.json();
        const { url, quality = '720p', filename } = body;
        
        // Also support legacy field names
        const youtubeUrl = url || body.youtubeUrl;
        
        // Validate URL
        if (!youtubeUrl) {
            return NextResponse.json({ 
                error: 'Missing url parameter' 
            }, { status: 400 });
        }
        
        if (!isValidYouTubeUrl(youtubeUrl)) {
            return NextResponse.json({ 
                error: 'Invalid YouTube URL' 
            }, { status: 400 });
        }
        
        // ========================================
        // Acquire queue slot (rate limit + concurrency)
        // ========================================
        const queueResult = await mergeQueueAcquire(id, ip);
        
        if (!queueResult.allowed) {
            console.log(`[merge] Request ${id} rejected: ${queueResult.error}`);
            return NextResponse.json({ 
                error: queueResult.error,
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
        
        // Determine output format for audio
        const audioOutputFormat = quality.toLowerCase() === 'mp3' ? 'mp3' : 
                                  quality.toLowerCase() === 'm4a' ? 'm4a' : 
                                  quality.toLowerCase().includes('kbps') ? 'm4a' :
                                  'mp3';
        
        // Parse quality - for video, extract height
        let targetValue: number;
        if (isAudioOnly) {
            targetValue = 320; // Placeholder, not used for audio
        } else {
            targetValue = qualityToHeight(quality);
        }
        
        console.log(`[merge] URL: ${youtubeUrl}, Quality: ${quality}, AudioOnly: ${isAudioOnly}`);
        
        // Setup temp folder
        temp = getTempFolder(id);
        
        // Find FFmpeg path for yt-dlp to use
        const ffmpegPath = await findFFmpegPath();
        
        // Download using yt-dlp
        const result = await downloadAndMergeWithYtdlp(
            youtubeUrl, 
            targetValue, 
            temp, 
            ffmpegPath, 
            isAudioOnly,
            audioOutputFormat as 'mp3' | 'm4a'
        );
        
        if (!result.success || !result.outputPath) {
            if (temp) cleanupFull(temp);
            mergeQueueRelease(id);
            return NextResponse.json({ 
                error: result.error || 'Download failed' 
            }, { status: 500 });
        }
        
        // Cleanup artifacts but keep output
        cleanupArtifacts(temp, result.outputPath);
        
        // Get file stats
        const stats = statSync(result.outputPath);
        console.log(`[merge] Output: ${stats.size} bytes`);
        
        // Prepare filename
        const ext = isAudioOnly ? `.${audioOutputFormat}` : '.mp4';
        const safeFilename = (filename || result.title || 'video')
            .replace(/[^\w\s.-]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/\.(mp4|mp3|m4a|webm)$/i, '')
            .substring(0, 100) + ext;
        
        // Stream the file to response
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
                    cleanupFull(folder); 
                });
            },
            cancel() { 
                stream.destroy(); 
                mergeQueueRelease(requestId);
                cleanupFull(folder); 
            }
        });
        
        console.log(`[merge] Streaming: ${safeFilename}`);
        
        const contentType = isAudioOnly 
            ? (audioOutputFormat === 'mp3' ? 'audio/mpeg' : 'audio/mp4')
            : 'video/mp4';
        
        return new NextResponse(webStream, {
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(stats.size),
                'Content-Disposition': `attachment; filename="${safeFilename}"`,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
                'X-RateLimit-Remaining': String(queueResult.rateLimitRemaining || 0)
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
