/**
 * Unified YouTube API
 * 
 * GET /api/v1/youtube?url=xxx
 *   → Returns available resolutions
 * 
 * GET /api/v1/youtube?url=xxx&quality=720p
 *   → Downloads video, returns direct URL to file
 */

import { NextRequest, NextResponse } from 'next/server';
import { scrapeYouTube, isYouTubeUrl } from '@/lib/services/youtube';
import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, statSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/services/helper/logger';

// ============================================================================
// Config
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
const DOWNLOAD_BASE = path.join(tmpdir(), 'xtfetch-yt-api');

// ============================================================================
// FFmpeg Path Detection
// ============================================================================

const WINDOWS_FFMPEG_PATHS = [
    path.join(homedir(), 'AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe'),
    'C:/Program Files/ffmpeg/bin/ffmpeg.exe',
    path.join(homedir(), 'scoop/shims/ffmpeg.exe'),
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
    } catch {}
    
    return 'ffmpeg';
}

// ============================================================================
// Helpers
// ============================================================================

function qualityToHeight(quality: string): number {
    const q = quality.toLowerCase().replace('p', '');
    const height = parseInt(q, 10);
    if ([2160, 1440, 1080, 720, 480, 360, 240, 144].includes(height)) {
        return height;
    }
    return 720;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function ensureDownloadDir(): void {
    if (!existsSync(DOWNLOAD_BASE)) {
        mkdirSync(DOWNLOAD_BASE, { recursive: true });
    }
}

// ============================================================================
// Download with yt-dlp (most reliable)
// ============================================================================

interface DownloadResult {
    success: boolean;
    filepath?: string;
    filename?: string;
    size?: number;
    error?: string;
}

async function downloadWithYtdlp(url: string, height: number, outputDir: string): Promise<DownloadResult> {
    return new Promise((resolve) => {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const ffmpegPath = findFFmpegPath();
        const outputTemplate = path.join(outputDir, '%(title).80B.%(ext)s');
        const formatSelector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;

        const args = [
            '-m', 'yt_dlp',
            '-f', formatSelector,
            '--merge-output-format', 'mp4',
            '-o', outputTemplate,
            '--no-playlist',
            '--no-warnings',
            '--restrict-filenames',
            '--ffmpeg-location', ffmpegPath,
            '--print', 'after_move:filepath',
            url
        ];

        logger.debug('youtube', `yt-dlp downloading at ${height}p...`);
        const proc = spawn(pythonCmd, args, { timeout: 300000 });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                const outputPath = stdout.trim().split('\n').pop()?.trim();

                if (outputPath && existsSync(outputPath)) {
                    const stats = statSync(outputPath);
                    const filename = path.basename(outputPath);
                    logger.debug('youtube', `Downloaded: ${filename} (${stats.size} bytes)`);

                    resolve({
                        success: true,
                        filepath: outputPath,
                        filename,
                        size: stats.size
                    });
                } else {
                    // Try to find mp4 in output dir
                    const { readdirSync } = require('fs');
                    const files = readdirSync(outputDir);
                    const mp4 = files.find((f: string) => f.endsWith('.mp4'));
                    if (mp4) {
                        const fullPath = path.join(outputDir, mp4);
                        const stats = statSync(fullPath);
                        resolve({
                            success: true,
                            filepath: fullPath,
                            filename: mp4,
                            size: stats.size
                        });
                    } else {
                        resolve({ success: false, error: 'Output file not found' });
                    }
                }
            } else {
                let error = 'Download failed';
                if (stderr.includes('Video unavailable')) error = 'Video unavailable';
                else if (stderr.includes('Private')) error = 'Video is private';
                else if (stderr.includes('age')) error = 'Age-restricted video';
                logger.error('youtube', stderr.slice(-300));
                resolve({ success: false, error });
            }
        });

        proc.on('error', (e) => {
            resolve({ success: false, error: e.message });
        });
    });
}

// ============================================================================
// Meta file helpers (for download route)
// ============================================================================

interface DownloadMeta {
    hash: string;
    filepath: string;
    filename: string;
    size: number;
    title: string;
    quality: string;
    createdAt: number;
    expiresAt: number;
}

function saveDownloadMeta(hash: string, meta: DownloadMeta): void {
    const metaPath = path.join(DOWNLOAD_BASE, hash, 'meta.json');
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    logger.debug('youtube', `Meta saved: ${hash}`);
}

function getDownloadMeta(hash: string): DownloadMeta | null {
    try {
        const metaPath = path.join(DOWNLOAD_BASE, hash, 'meta.json');
        if (!existsSync(metaPath)) return null;
        const data = JSON.parse(readFileSync(metaPath, 'utf8'));
        if (Date.now() > data.expiresAt) {
            // Expired
            try { rmSync(path.join(DOWNLOAD_BASE, hash), { recursive: true, force: true }); } catch {}
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

// Export for download route - REMOVED, use youtube-storage.ts instead
// export { getDownloadMeta, DOWNLOAD_BASE, type DownloadMeta };

// ============================================================================
// API Handler
// ============================================================================

export async function GET(req: NextRequest) {
    try {
        const url = req.nextUrl.searchParams.get('url');
        const quality = req.nextUrl.searchParams.get('quality');

        if (!url) {
            return NextResponse.json({
                success: false,
                error: 'Missing url parameter',
                usage: {
                    list: 'GET /api/v1/youtube?url=https://youtu.be/xxx',
                    download: 'GET /api/v1/youtube?url=https://youtu.be/xxx&quality=720p'
                }
            }, { status: 400 });
        }

        if (!isYouTubeUrl(url)) {
            return NextResponse.json({
                success: false,
                error: 'Invalid YouTube URL'
            }, { status: 400 });
        }

        // ====================================================================
        // Mode 1: List available resolutions
        // ====================================================================
        if (!quality) {
            const result = await scrapeYouTube(url);

            if (!result.success || !result.data) {
                return NextResponse.json({
                    success: false,
                    error: result.error || 'Failed to fetch video info'
                }, { status: 500 });
            }

            const { data } = result;

            // Build resolution list
            const resolutions = data.formats
                .filter(f => f.type === 'video')
                .map(f => ({
                    quality: f.quality,
                    height: f.height,
                    needsMerge: f.needsMerge || false,
                    filesize: f.filesize,
                    downloadUrl: `${API_BASE_URL}/api/v1/youtube?url=${encodeURIComponent(url)}&quality=${f.quality}`
                }));

            const audioFormats = data.formats
                .filter(f => f.type === 'audio')
                .map(f => ({
                    quality: f.quality,
                    format: f.format,
                    filesize: f.filesize,
                    downloadUrl: `${API_BASE_URL}/api/v1/youtube?url=${encodeURIComponent(url)}&quality=audio`
                }));

            return NextResponse.json({
                success: true,
                data: {
                    title: data.title,
                    author: data.author,
                    thumbnail: data.thumbnail,
                    engagement: data.engagement,
                    resolutions,
                    audio: audioFormats,
                }
            });
        }

        // ====================================================================
        // Mode 2: Download specific quality
        // ====================================================================
        const height = quality === 'audio' ? 128 : qualityToHeight(quality);

        // Setup download folder
        ensureDownloadDir();
        const downloadId = randomUUID().slice(0, 12);
        const outputDir = path.join(DOWNLOAD_BASE, downloadId);
        mkdirSync(outputDir, { recursive: true });

        logger.url('youtube', `${url} @ ${height}p`);

        // Download with yt-dlp
        const downloadResult = await downloadWithYtdlp(url, height, outputDir);

        if (!downloadResult.success || !downloadResult.filepath) {
            logger.error('youtube', downloadResult.error || 'Download failed');
            try { rmSync(outputDir, { recursive: true, force: true }); } catch {}
            return NextResponse.json({
                success: false,
                error: downloadResult.error || 'Download failed'
            }, { status: 500 });
        }

        // Save meta for download route
        const safeFilename = downloadResult.filename || 'video.mp4';
        const meta: DownloadMeta = {
            hash: downloadId,
            filepath: downloadResult.filepath,
            filename: safeFilename,
            size: downloadResult.size || 0,
            title: path.basename(safeFilename, '.mp4'),
            quality,
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
        };
        saveDownloadMeta(downloadId, meta);

        // Build direct URL
        const directUrl = `${API_BASE_URL}/api/v1/youtube/download/${downloadId}/${encodeURIComponent(safeFilename)}`;

        return NextResponse.json({
            success: true,
            data: {
                directUrl,
                filename: safeFilename,
                filesize: downloadResult.size,
                filesizeFormatted: formatBytes(downloadResult.size || 0),
                quality,
                expiresIn: 600,
                expiresAt: new Date(meta.expiresAt).toISOString()
            }
        });

    } catch (error) {
        logger.error('youtube', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
