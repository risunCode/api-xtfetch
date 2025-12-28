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
import { formatBytes } from '@/lib/utils';

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
export const DOWNLOAD_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes (merged files - cleanup faster)

// Duration limits
export const YOUTUBE_MAX_DURATION_SECONDS = 5 * 60; // 5 minutes max for YouTube videos
export const GENERAL_MAX_DURATION_SECONDS = 2 * 60 * 60; // 2 hours max for other platforms
// Note: Non-YouTube platforms are limited by Telegram's 50MB file size limit,
// which effectively limits video duration to ~10-15 minutes for HD quality

// ============================================================================
// Storage (Redis-backed with in-memory fallback)
// ============================================================================

import { redis, isRedisAvailable } from '@/lib/database';

// In-memory fallback when Redis unavailable
const sessionsMemory = new Map<string, YouTubeSession>();

// Redis key prefix for YouTube sessions
const REDIS_SESSION_PREFIX = 'yt:session:';
const REDIS_SESSION_TTL = Math.ceil(SESSION_EXPIRY_MS / 1000); // Convert to seconds

// File-based storage for downloads (survives across route invocations)
// Each download has a .meta.json file next to the video file

// ============================================================================
// Session Functions (Redis-backed with in-memory fallback)
// ============================================================================

export function ytSessionHash(videoUrl: string): string {
    // Extract video ID for consistent hashing
    const videoId = extractVideoId(videoUrl);
    return createHash('sha256').update(videoId).digest('hex').slice(0, 12);
}

/**
 * Get YouTube session from Redis (with in-memory fallback)
 */
export async function ytSessionGet(hash: string): Promise<YouTubeSession | undefined> {
    // Try Redis first
    if (isRedisAvailable() && redis) {
        try {
            const key = `${REDIS_SESSION_PREFIX}${hash}`;
            const session = await redis.get<YouTubeSession>(key);
            if (session) {
                // Check expiry (Redis TTL handles this, but double-check)
                if (Date.now() > session.expiresAt) {
                    await redis.del(key);
                    return undefined;
                }
                return session;
            }
        } catch {
            // Fall through to memory
        }
    }
    
    // Fallback to in-memory
    const session = sessionsMemory.get(hash);
    if (session && Date.now() > session.expiresAt) {
        sessionsMemory.delete(hash);
        return undefined;
    }
    return session;
}

/**
 * Sync version for backward compatibility (checks memory only)
 */
export function ytSessionGetSync(hash: string): YouTubeSession | undefined {
    const session = sessionsMemory.get(hash);
    if (session && Date.now() > session.expiresAt) {
        sessionsMemory.delete(hash);
        return undefined;
    }
    return session;
}

/**
 * Set YouTube session in Redis (with in-memory fallback)
 */
export async function ytSessionSet(session: YouTubeSession): Promise<void> {
    // Always set in memory for sync access
    sessionsMemory.set(session.hash, session);
    
    // Also set in Redis if available
    if (isRedisAvailable() && redis) {
        try {
            const key = `${REDIS_SESSION_PREFIX}${session.hash}`;
            await redis.set(key, session, { ex: REDIS_SESSION_TTL });
        } catch {
            // Redis failed, memory fallback is already set
        }
    }
}

/**
 * Delete YouTube session from Redis and memory
 */
export async function ytSessionDelete(hash: string): Promise<void> {
    sessionsMemory.delete(hash);
    
    if (isRedisAvailable() && redis) {
        try {
            await redis.del(`${REDIS_SESSION_PREFIX}${hash}`);
        } catch {
            // Ignore Redis errors
        }
    }
}

/**
 * Invalidate cache for a specific video (for retry with fresh data)
 */
export async function ytSessionInvalidate(videoUrl: string): Promise<void> {
    const hash = ytSessionHash(videoUrl);
    await ytSessionDelete(hash);
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

export async function ytCleanupExpired(): Promise<void> {
    const now = Date.now();
    
    // Cleanup expired in-memory sessions
    for (const [hash, session] of sessionsMemory.entries()) {
        if (now > session.expiresAt) {
            sessionsMemory.delete(hash);
        }
    }
    
    // Note: Redis sessions auto-expire via TTL, no manual cleanup needed
    
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
                            console.log(`[YouTube.Cleanup] Deleted expired: ${folder}`);
                        }
                    } catch {
                        // Invalid meta, cleanup
                        rmSync(path.join(YOUTUBE_DOWNLOAD_BASE, folder), { recursive: true, force: true });
                        console.log(`[YouTube.Cleanup] Deleted invalid: ${folder}`);
                    }
                } else {
                    // No meta file, cleanup orphaned folder
                    try {
                        rmSync(path.join(YOUTUBE_DOWNLOAD_BASE, folder), { recursive: true, force: true });
                        console.log(`[YouTube.Cleanup] Deleted orphaned: ${folder}`);
                    } catch {}
                }
            }
        }
    } catch (e) {
        console.error('[YouTube.Cleanup] Error:', e);
    }
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

// Re-export formatBytes from shared utils for backward compatibility
export { formatBytes } from '@/lib/utils';

export function qualityToHeight(quality: string): number {
    const q = quality.toLowerCase().replace('p', '');
    const height = parseInt(q, 10);
    if ([2160, 1440, 1080, 720, 480, 360, 240, 144].includes(height)) {
        return height;
    }
    return 720;
}
