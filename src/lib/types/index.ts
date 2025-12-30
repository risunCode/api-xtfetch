// Platform types
export type PlatformId = 
    | 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo' | 'youtube'
    | 'bilibili' | 'reddit' | 'soundcloud'
    | 'eporner' | 'pornhub' | 'rule34video' | 'threads' | 'erome' | 'pixiv';

// Alert type for monitoring
export type AlertType = 'error_rate' | 'response_time' | 'cookie_health' | 'rate_limit' | 'platform_down';

/**
 * Unified Engagement Stats
 * Normalized across all platforms for consistent display
 */
export interface EngagementStats {
    views?: number;       // View/play count
    plays?: number;       // Play count (Instagram reels/videos)
    likes?: number;       // Like/favorite/heart count
    comments?: number;    // Comment count
    shares?: number;      // Unified: retweets, reposts, shares
    bookmarks?: number;   // Save/bookmark count
    saves?: number;       // Save count (Instagram)
    replies?: number;     // Reply count (Twitter)
}

// Media format interface
export interface MediaFormat {
    quality: string;
    type: 'video' | 'audio' | 'image';
    url: string;
    size?: string;
    fileSize?: string; // Human-readable file size (e.g. "32.5 MB")
    filesize?: number; // File size in bytes
    filesizeEstimated?: boolean; // True if filesize is estimated (YouTube)
    format?: string;
    mimeType?: string;
    filename?: string; // Custom filename hint
    itemId?: string; // To group multiple formats of the same item (e.g. multiple images in a post)
    thumbnail?: string; // Specific thumbnail for this item
    width?: number;
    height?: number;
    isHLS?: boolean; // Flag for HLS/m3u8 streams (YouTube)
    needsMerge?: boolean; // YouTube: video-only format that needs audio merge
    audioUrl?: string; // YouTube: best audio URL for merging
}

// Download response from API
export interface DownloadResponse {
    success: boolean;
    platform: PlatformId;
    data?: MediaData;
    error?: string;
    errorCode?: string; // Scraper error code for frontend handling
    // Flattened structure support (used by some route handlers)
    title?: string;
    thumbnail?: string;
    author?: string;
    formats?: MediaFormat[];
}

// Media data extracted from URL
export interface MediaData {
    title: string;
    thumbnail: string;
    duration?: string;
    author?: string;
    authorUrl?: string;
    views?: string;
    description?: string;
    formats: MediaFormat[];
    url: string;
    embedHtml?: string; // Embed HTML for iframe preview (fallback when no direct download)
    usedCookie?: boolean; // Whether cookie was used to fetch this media (indicates private/authenticated content)
    cached?: boolean; // Whether this response was served from cache
    responseTime?: number; // API response time in milliseconds
    engagement?: EngagementStats;
}

// API request body
export interface DownloadRequest {
    url: string;
}

// Platform configuration
export interface PlatformConfig {
    id: PlatformId;
    name: string;
    icon: string;
    color: string;
    placeholder: string;
    patterns: RegExp[];
}

// Platform configurations
export const PLATFORMS: PlatformConfig[] = [
    {
        id: 'facebook',
        name: 'Facebook',
        icon: '📘',
        color: '#1877f2',
        placeholder: 'https://www.facebook.com/watch?v=...',
        patterns: [
            /^(https?:\/\/)?(www\.|m\.|web\.)?facebook\.com\/.+/,
            /^(https?:\/\/)?(www\.)?fb\.(watch|gg|me)\/.+/,
            /^(https?:\/\/)?l\.facebook\.com\/.+/,
        ],
    },
    {
        id: 'instagram',
        name: 'Instagram',
        icon: '📸',
        color: '#e4405f',
        placeholder: 'https://www.instagram.com/reel/...',
        patterns: [
            /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|reels|tv|stories)\/.+/,
            /^(https?:\/\/)?instagr\.am\/.+/,
            /^(https?:\/\/)?(www\.)?ig\.me\/.+/,
            /^(https?:\/\/)?ddinstagram\.com\/.+/,
        ],
    },
    {
        id: 'twitter',
        name: 'X',
        icon: '𝕏',
        color: '#ffffff',
        placeholder: 'https://twitter.com/user/status/...',
        patterns: [
            /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/.+\/status\/.+/,
            /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/i\/status\/.+/,
            /^(https?:\/\/)?t\.co\/.+/,
            /^(https?:\/\/)?(www\.)?fxtwitter\.com\/.+/,
            /^(https?:\/\/)?(www\.)?vxtwitter\.com\/.+/,
            /^(https?:\/\/)?(www\.)?fixupx\.com\/.+/,
        ],
    },
    {
        id: 'tiktok',
        name: 'TikTok',
        icon: '🎵',
        color: '#00f2ea',
        placeholder: 'https://www.tiktok.com/@user/video/...',
        patterns: [
            /^(https?:\/\/)?(www\.|vm\.|vt\.|m\.)?tiktok\.com\/.+/,
            /^(https?:\/\/)?tiktok\.com\/.+/,
        ],
    },
    {
        id: 'weibo',
        name: 'Weibo',
        icon: '🔴',
        color: '#e6162d',
        placeholder: 'https://weibo.com/...',
        patterns: [
            /^(https?:\/\/)?(www\.|m\.|video\.)?weibo\.(com|cn)\/.+/,
            /^(https?:\/\/)?t\.cn\/.+/,
        ],
    },
    {
        id: 'youtube',
        name: 'YouTube',
        icon: '▶️',
        color: '#ff0000',
        placeholder: 'https://www.youtube.com/watch?v=...',
        patterns: [
            /^(https?:\/\/)?(www\.|m\.|music\.)?youtube\.com\/(watch|shorts|embed)\?.+/,
            /^(https?:\/\/)?(www\.|m\.|music\.)?youtube\.com\/shorts\/.+/,
            /^(https?:\/\/)?youtu\.be\/.+/,
        ],
    },
];

// Helper to detect platform from URL
export function detectPlatform(url: string): PlatformId | null {
    for (const platform of PLATFORMS) {
        for (const pattern of platform.patterns) {
            if (pattern.test(url)) {
                return platform.id;
            }
        }
    }
    return null;
}

// Helper to validate URL for platform
export function validateUrl(url: string, platform: PlatformId): boolean {
    const config = PLATFORMS.find(p => p.id === platform);
    if (!config) return false;
    return config.patterns.some(pattern => pattern.test(url));
}

// Generate unique ID
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Format duration from seconds
export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Format file size
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Sanitize pasted text to extract just the URL
export function sanitizeUrl(text: string): string {
    if (!text) return '';

    let cleaned = text
        .replace(/[\r\n]+/g, ' ')
        .trim();

    const urlPattern = /https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/gi;
    const matches = cleaned.match(urlPattern);

    if (matches && matches.length > 0) {
        let url = matches[0]
            .replace(/[,，。！!?？、；;：:]+$/, '')
            .replace(/\/+$/, '')
            .trim();
        
        if (/\/(v|vm|vt|t|s)\./.test(url) && !url.includes('?')) {
            url = url.replace(/\/?$/, '/');
        }
        
        return url;
    }

    const noProtocolPattern = /(vm\.tiktok\.com|vt\.tiktok\.com|t\.co|fb\.watch|instagr\.am)\/[^\s\u4e00-\u9fff]+/gi;
    const noProtoMatches = cleaned.match(noProtocolPattern);
    
    if (noProtoMatches && noProtoMatches.length > 0) {
        return 'https://' + noProtoMatches[0].replace(/[,，。！!?？]+$/, '').trim();
    }

    return '';
}
