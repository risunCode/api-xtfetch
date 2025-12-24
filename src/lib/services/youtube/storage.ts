/**
 * YouTube Session & Download Storage
 * 
 * Caches scraped YouTube data so we don't re-scrape on download.
 * Session valid for 5 minutes (YouTube CDN URLs expire ~6 hours but we keep it short)
 */

import { existsSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface YouTubeFormat {
    itag: number;
    quality: string;
    height?: number;
    type: 'video' | 'audio' | 'image';
    format?: string;
    url: string;
    filesize?: number;
    needsMerge?: boolean;
    audioUrl?: string;
}

export interface YouTubeSession {
    hash: string;
    videoUrl: string;
    videoId: string;
    title: string;
    author: string;
    thumbnail: string;
    duration: number;
    formats: YouTubeFormat[];
    bestAudioUrl: string;
    createdAt: number;
    expiresAt: number;
}

export interface PreparedDownload {
    hash: string;
    sessionHash: string;
    quality: string;
    title: string;
    filename: string;
    filepath: string;
    size: number;
    createdAt: number;
    expiresAt: number;
}

// ============================================================================
// Config
// ============================================================================

export const YOUTUBE_DOWNLOAD_BASE = path.join(tmpdir(), 'xtfetch-youtube');
export const SESSION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes (CDN URLs valid)
export const DOWNLOAD_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes (merged files)

// ============================================================================
// Storage (In-memory - use Redis in production)
// ============================================================================

const sessions = new Map<string, YouTubeSession>();
// File-based storage for downloads (survives across route invocations)
// Each download has a .meta.json file next to the video file

// ============================================================================
// Session Functions
// ============================================================================

export function ytSessionHash(videoUrl: string): string {
    // Extract video ID for consistent hashing
    const videoId = extractVideoId(videoUrl);
    return createHash('sha256').update(videoId).digest('hex').slice(0, 12);
}

export function ytSessionGet(hash: string): YouTubeSession | undefined {
    const session = sessions.get(hash);
    if (session && Date.now() > session.expiresAt) {
        sessions.delete(hash);
        return undefined;
    }
    return session;
}

export function ytSessionSet(session: YouTubeSession): void {
    sessions.set(session.hash, session);
}

export function ytSessionDelete(hash: string): void {
    sessions.delete(hash);
}

// ============================================================================
// Download Storage Functions (File-based)
// ============================================================================

function getMetaPath(hash: string): string {
    return path.join(YOUTUBE_DOWNLOAD_BASE, hash, 'meta.json');
}

export function ytDownloadGet(hash: string): PreparedDownload | undefined {
    try {
        const metaPath = getMetaPath(hash);
        if (!existsSync(metaPath)) {
            return undefined;
        }
        
        const data = JSON.parse(require('fs').readFileSync(metaPath, 'utf8'));
        if (Date.now() > data.expiresAt) {
            // Expired - cleanup
            try { rmSync(path.dirname(metaPath), { recursive: true, force: true }); } catch {}
            return undefined;
        }
        return data as PreparedDownload;
    } catch {
        return undefined;
    }
}

export function ytDownloadSet(hash: string, download: PreparedDownload): void {
    try {
        const metaPath = getMetaPath(hash);
        const dir = path.dirname(metaPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        require('fs').writeFileSync(metaPath, JSON.stringify(download, null, 2));
    } catch {
        // Silent fail
    }
}

export function ytDownloadDelete(hash: string): void {
    try {
        const folder = path.join(YOUTUBE_DOWNLOAD_BASE, hash);
        if (existsSync(folder)) {
            rmSync(folder, { recursive: true, force: true });
        }
    } catch {}
}

// ============================================================================
// Cleanup Functions
// ============================================================================

export function ytCleanupExpired(): void {
    const now = Date.now();
    
    // Cleanup expired sessions
    for (const [hash, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(hash);
        }
    }
    
    // Cleanup expired downloads (scan filesystem)
    try {
        if (existsSync(YOUTUBE_DOWNLOAD_BASE)) {
            const { readdirSync } = require('fs');
            const folders = readdirSync(YOUTUBE_DOWNLOAD_BASE);
            for (const folder of folders) {
                const metaPath = path.join(YOUTUBE_DOWNLOAD_BASE, folder, 'meta.json');
                if (existsSync(metaPath)) {
                    try {
                        const meta = JSON.parse(require('fs').readFileSync(metaPath, 'utf8'));
                        if (now > meta.expiresAt) {
                            rmSync(path.join(YOUTUBE_DOWNLOAD_BASE, folder), { recursive: true, force: true });
                        }
                    } catch {
                        // Invalid meta, cleanup
                        rmSync(path.join(YOUTUBE_DOWNLOAD_BASE, folder), { recursive: true, force: true });
                    }
                }
            }
        }
    } catch {}
}

export function ytEnsureDownloadDir(): void {
    if (!existsSync(YOUTUBE_DOWNLOAD_BASE)) {
        mkdirSync(YOUTUBE_DOWNLOAD_BASE, { recursive: true });
    }
}

// ============================================================================
// Helpers
// ============================================================================

export function extractVideoId(url: string): string {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return url;
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function qualityToHeight(quality: string): number {
    const q = quality.toLowerCase().replace('p', '');
    const height = parseInt(q, 10);
    if ([2160, 1440, 1080, 720, 480, 360, 240, 144].includes(height)) {
        return height;
    }
    return 720;
}
