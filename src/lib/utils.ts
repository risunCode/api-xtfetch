/**
 * Unified Utilities Module
 * 
 * This file merges utilities from multiple source files:
 * - security.ts: Input sanitization, URL validation, encryption, API key hashing
 * - http.ts: URL helpers, response builders, format helpers, extraction utilities
 * - format-utils.ts: Byte/speed formatting utilities
 * - retry.ts: Retry strategies with exponential backoff
 * - error-ui.ts: User-friendly error display system
 * 
 * @module utils
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { DownloadResponse, MediaFormat, MediaData } from '@/lib/types';
import { type PlatformId, platformGetReferer, platformGetDomainConfig } from '@/core/config';
import { httpGetUserAgent, UA_DESKTOP, httpRandomSleep } from '@/lib/http';
import { ScraperErrorCode, ScraperResult, isRetryable, ERROR_MESSAGES } from '@/core/scrapers/types';
import { sysConfigScraperMaxRetries, sysConfigScraperRetryDelay } from '@/core/config';
import { logger } from '@/lib/services/shared/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/** Result of URL validation */
export interface ValidationResult {
    valid: boolean;
    error?: string;
}

/** Options for retry strategies */
export interface RetryOptions {
    maxRetries?: number;
    baseDelay?: number;
    backoff?: 'linear' | 'exponential' | 'none';
    retryWithCookie?: boolean;
    cookie?: string;
    onRetry?: (attempt: number, error: ScraperErrorCode) => void;
}

/** Result from smart scraper */
export interface ScrapeResult {
    formats: MediaFormat[];
    title: string;
    thumbnail: string;
    author: string;
    description?: string;
}

/** Error display configuration for UI */
export interface ErrorDisplay {
    icon: string;
    color: string;
    bgColor: string;
    title: string;
    message: string;
    action?: string;
    actionType?: 'retry' | 'login' | 'cookie' | 'none';
    retryable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

// --- Constants ---

const ALLOWED_DOMAINS = [
    // Facebook
    'facebook.com', 'fb.com', 'fb.watch', 'fbcdn.net', 'fbsbx.com',
    // Instagram
    'instagram.com', 'cdninstagram.com', 'instagr.am',
    // Twitter/X
    'twitter.com', 'x.com', 't.co', 'twimg.com', 'video.twimg.com', 'pbs.twimg.com',
    // TikTok / Douyin
    'tiktok.com', 'tiktokcdn.com', 'musical.ly', 'tiktokcdn-us.com', 'tiktokv.com',
    'douyin.com', 'douyinpic.com', 'douyinvod.com', 'amemv.com', 'snssdk.com', 'bytedance.com', 'bytecdn.cn', 'ixigua.com',
    // Weibo
    'weibo.com', 'weibo.cn', 'sinaimg.cn', 'weibocdn.com', 'miaopai.com',
    // YouTube
    'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'ggpht.com',
    // BiliBili
    'bilibili.com', 'bilivideo.com', 'bilivideo.cn', 'hdslb.com', 'biliimg.com', 'acgvideo.com',
    // Reddit
    'reddit.com', 'redd.it', 'redditmedia.com', 'redditstatic.com', 'redgifs.com', 'i.redd.it', 'v.redd.it', 'preview.redd.it',
    // SoundCloud
    'soundcloud.com', 'sndcdn.com', 'soundcloud.app.goo.gl',
    // Eporner
    'eporner.com', 'cdn.eporner.com', 'static-cdn.eporner.com', 'boomio-cdn.com',
    // PornHub
    'pornhub.com', 'phncdn.com', 'pornhubpremium.com', 'modelhub.com',
    // Rule34Video
    'rule34video.com', 'rule34.xxx', 'rule34.paheal.net', 'rule34hentai.net', 'thisvid.com',
    // Erome
    'erome.com', 'cdn.erome.com', 'media.erome.com', 's.erome.com',
    // Pixiv
    'pixiv.net', 'pximg.net', 'fanbox.cc', 'i.pximg.net',
];

const BLOCKED_PATTERNS = [
    // Private IPv4 ranges
    /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.)/,
    // Special IPv4 addresses
    /^255\.255\.255\.255$/,           // Broadcast
    /^169\.254\./,                     // Link-local
    /^224\./,                          // Multicast (224.0.0.0 - 239.255.255.255)
    /^239\./,                          // Multicast
    /^240\./,                          // Reserved
    /^0\.0\.0\.0$/,                    // All interfaces
    // Hostname patterns
    /localhost/i, /\.local$/i, /\.internal$/i,
    // IPv6 patterns (bracketed)
    /\[::1\]/i, /\[::\]/i, /\[fe80:/i, /\[fc00:/i, /\[fd00:/i, /\[ff00:/i,
    // IPv6 patterns (unbracketed)
    /^::1$/,                           // IPv6 localhost
    /^fe80:/i,                         // IPv6 link-local
    /^fc00:/i,                         // IPv6 unique local
    /^fd00:/i,                         // IPv6 unique local
    /^ff00:/i,                         // IPv6 multicast
    // Cloud metadata endpoints
    /169\.254\.169\.254/, /metadata\.google\.internal/i, /metadata\.azure\.com/i,
    // DNS rebinding protection
    /\.xip\.io$/i, /\.nip\.io$/i, /\.sslip\.io$/i,
    // Dangerous protocols
    /^file:/i, /^ftp:/i, /^data:/i, /^gopher:/i, /^dict:/i,
    // IP obfuscation patterns
    /0x[0-9a-f]+\./i, /\d+\.\d+\.\d+\.\d+\.\d+/,
];

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const KEY_CACHE_MAX_SIZE = 100;

// --- Key Derivation Cache ---
// LRU-style cache to avoid repeated expensive scrypt operations
const keyCache = new Map<string, Buffer>();
const keyCacheOrder: string[] = []; // Track insertion order for LRU eviction

/**
 * Gets a derived key from cache or derives it using scrypt
 * Uses LRU eviction when cache exceeds max size
 * @param salt - Salt buffer for key derivation
 * @returns Derived key buffer
 */
function getDerivedKey(salt: Buffer): Buffer {
    const encryptionKey = getEncryptionKey();
    const cacheKey = salt.toString('hex');

    // Check cache first
    const cachedKey = keyCache.get(cacheKey);
    if (cachedKey) {
        // Move to end of order (most recently used)
        const idx = keyCacheOrder.indexOf(cacheKey);
        if (idx > -1) {
            keyCacheOrder.splice(idx, 1);
            keyCacheOrder.push(cacheKey);
        }
        return cachedKey;
    }

    // Derive key using scrypt (expensive operation)
    const derivedKey = crypto.scryptSync(encryptionKey, salt, 32);

    // Evict oldest entry if cache is full (LRU eviction)
    if (keyCache.size >= KEY_CACHE_MAX_SIZE) {
        const oldestKey = keyCacheOrder.shift();
        if (oldestKey) {
            keyCache.delete(oldestKey);
        }
    }

    // Add to cache
    keyCache.set(cacheKey, derivedKey);
    keyCacheOrder.push(cacheKey);

    return derivedKey;
}

// --- Private Helpers ---

/**
 * Checks if a string has sufficient entropy (randomness)
 * Uses Shannon entropy calculation
 * @param str - String to check
 * @returns True if entropy is sufficient (>3.5 bits per character)
 */
function hasEnoughEntropy(str: string): boolean {
    if (!str || str.length < 32) return false;

    // Calculate character frequency
    const freq: Record<string, number> = {};
    for (const char of str) {
        freq[char] = (freq[char] || 0) + 1;
    }

    // Calculate Shannon entropy
    let entropy = 0;
    const len = str.length;
    for (const count of Object.values(freq)) {
        const p = count / len;
        entropy -= p * Math.log2(p);
    }

    // Require at least 3.5 bits of entropy per character
    // A truly random 32-char string should have ~5-6 bits
    return entropy >= 3.5;
}

function getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY;

    // SECURITY: Always require ENCRYPTION_KEY in all environments
    if (!key) {
        throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    // Validate key length
    if (key.length < 32) {
        throw new Error('ENCRYPTION_KEY must be at least 32 characters');
    }

    // Validate key entropy to prevent weak keys
    if (!hasEnoughEntropy(key)) {
        throw new Error('ENCRYPTION_KEY has insufficient entropy - use a cryptographically random key');
    }

    return key;
}

// --- Input Sanitization ---

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param str - String to escape
 * @returns Escaped string safe for HTML output
 */
export function securityEscapeHtml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Recursively sanitizes an object by escaping all string values
 * @param obj - Object to sanitize
 * @returns Sanitized object with escaped strings
 */
export function securitySanitizeObject<T>(obj: T): T {
    if (typeof obj === 'string') return securityEscapeHtml(obj) as T;
    if (Array.isArray(obj)) return obj.map(securitySanitizeObject) as T;
    if (obj && typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[securityEscapeHtml(key)] = securitySanitizeObject(value);
        }
        return sanitized as T;
    }
    return obj;
}

// --- URL Validation (SSRF Prevention) ---

/**
 * Validates a social media URL for security (SSRF prevention)
 * @param url - URL to validate
 * @returns Validation result with error message if invalid
 */
export function securityValidateSocialUrl(url: string): ValidationResult {
    if (!url || typeof url !== 'string') return { valid: false, error: 'URL is required' };
    if (url.length > 2000) return { valid: false, error: 'URL too long' };
    if (!/^https?:\/\//i.test(url)) return { valid: false, error: 'Invalid URL protocol' };

    let decodedUrl = url;
    try { decodedUrl = decodeURIComponent(url); } catch { /* ignore */ }

    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(url) || pattern.test(decodedUrl)) {
            return { valid: false, error: 'Invalid URL' };
        }
    }

    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return { valid: false, error: 'Direct IP access not allowed' };
        if (hostname.startsWith('[') || hostname.includes(':')) return { valid: false, error: 'IPv6 not allowed' };
        const isAllowed = ALLOWED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
        if (!isAllowed) return { valid: false, error: 'Unsupported platform' };
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}

// --- Cookie Validation ---

/**
 * Validates a cookie string for security
 * @param cookie - Cookie string to validate
 * @returns Validation result with error message if invalid
 */
export function securityValidateCookie(cookie: string): ValidationResult {
    if (!cookie) return { valid: true };
    if (typeof cookie !== 'string') return { valid: false, error: 'Cookie must be a string' };
    if (cookie.length > 10000) return { valid: false, error: 'Cookie too long' };
    if (/[\r\n]/.test(cookie)) return { valid: false, error: 'Invalid cookie format' };
    const suspicious = [/<script/i, /javascript:/i, /on\w+\s*=/i, /eval\s*\(/i, /\x00/];
    for (const pattern of suspicious) {
        if (pattern.test(cookie)) return { valid: false, error: 'Invalid cookie format' };
    }
    return { valid: true };
}

/**
 * Sanitizes a cookie string by removing dangerous characters
 * @param cookie - Cookie string to sanitize
 * @returns Sanitized cookie string
 */
export function securitySanitizeCookie(cookie: string): string {
    if (!cookie) return '';
    return cookie.replace(/[\r\n\x00]/g, '').trim();
}

// --- Encryption ---

/**
 * Encrypts text using AES-256-GCM with random salt and IV
 * Uses cached key derivation to avoid repeated expensive scrypt operations
 * @param text - Plain text to encrypt
 * @returns Encrypted string in format: salt:iv:authTag:encrypted
 */
export function securityEncrypt(text: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(16);
    const key = getDerivedKey(salt);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypts text encrypted with securityEncrypt
 * Uses cached key derivation to avoid repeated expensive scrypt operations
 * @param encryptedText - Encrypted string to decrypt
 * @returns Decrypted plain text, or empty string on failure
 */
export function securityDecrypt(encryptedText: string): string {
    try {
        const parts = encryptedText.split(':');
        if (parts.length === 3) {
            // Legacy format without salt (uses fixed 'salt' string)
            const [ivHex, authTagHex, encrypted] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const legacySalt = Buffer.from('salt');
            const key = getDerivedKey(legacySalt);
            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        const [saltHex, ivHex, authTagHex, encrypted] = parts;
        const salt = Buffer.from(saltHex, 'hex');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const key = getDerivedKey(salt);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return '';
    }
}

// --- API Key Hashing ---

/**
 * Hashes an API key using SHA-256
 * @param key - API key to hash
 * @returns Hexadecimal hash string
 */
export function securityHashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generates a cryptographically secure random token
 * @param length - Number of random bytes (default: 32)
 * @returns Hexadecimal token string
 */
export function securityGenerateToken(length = 32): string {
    return crypto.randomBytes(length).toString('hex');
}

// --- Log Masking ---

/**
 * Masks sensitive data for logging, showing only first/last characters
 * @param data - Sensitive string to mask
 * @param visibleChars - Number of characters to show at start/end (default: 4)
 * @returns Masked string
 */
export function securityMaskData(data: string, visibleChars = 4): string {
    if (!data || data.length <= visibleChars * 2) return '***';
    return data.slice(0, visibleChars) + '***' + data.slice(-visibleChars);
}

/**
 * Masks a cookie string for logging
 * @param cookie - Cookie string to mask
 * @returns Masked cookie showing length
 */
export function securityMaskCookie(cookie: string): string {
    if (!cookie) return '';
    if (cookie.length <= 20) return '***';
    return cookie.slice(0, 10) + '...[' + cookie.length + ' chars]';
}

// --- Request Validation ---

/**
 * Validates request body size
 * @param body - Request body to validate
 * @param maxSize - Maximum allowed size in characters (default: 10000)
 * @returns Validation result
 */
export function securityValidateRequestBody(body: unknown, maxSize = 10000): ValidationResult {
    if (!body) return { valid: true };
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    if (str.length > maxSize) return { valid: false, error: 'Request body too large' };
    return { valid: true };
}

/**
 * Detects common attack patterns in input (SQL injection, XSS, template injection)
 * @param input - Input string to check
 * @returns True if attack pattern detected
 */
export function securityDetectAttack(input: string): boolean {
    const patterns = [
        /union\s+select/i, /;\s*drop\s+table/i, /--\s*$/,
        /<script[\s>]/i, /javascript:/i, /on(error|load|click)\s*=/i,
        /\$\{.*\}/, /\{\{.*\}\}/,
    ];
    return patterns.some(p => p.test(input));
}

// --- Client IP Extraction ---

/**
 * Extracts client IP address from request headers
 * @param request - Request object
 * @returns Client IP address or 'unknown'
 */
export function securityGetClientIP(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIP = request.headers.get('x-real-ip');
    if (realIP) return realIP;
    return 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════════
// URL & MEDIA UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

// --- Constants ---

const TRUSTED_CDNS: Record<string, string[]> = {
    tiktok: ['tiktok.com', 'webapp-prime', 'bytedance', 'musical.ly', 'tiktokcdn'],
};

const DECODE_MAP: [RegExp, string][] = [
    [/\\\\\//g, '/'],
    [/\\u0025/g, '%'], [/\\u0026/g, '&'], [/\\u003C/g, '<'], [/\\u003E/g, '>'],
    [/\\u002F/g, '/'], [/\\\//g, '/'], [/\\"/g, '"'], [/&amp;/g, '&'],
    [/&lt;/g, '<'], [/&gt;/g, '>'], [/&#x3D;/g, '='], [/&quot;/g, '"'],
    [/&#x27;/g, "'"], [/&#39;/g, "'"],
    [/\\+$/g, ''],
];

const SMALL_IMG_PATTERNS = [
    /\/[ps]\d+x\d+\//, /s(16|24|32|40|48|60|75|100)x\1/,
    /emoji|static|sticker|rsrc\.php|\/cp0\/|\/c\d+\.\d+\.\d+\.\d+\//i,
];

// --- URL Validation ---

/**
 * Validates a media URL by checking trusted CDNs or making a HEAD request
 * @param url - Media URL to validate
 * @param platform - Platform identifier
 * @param timeout - Request timeout in ms (default: 3000)
 * @returns True if URL is valid and accessible
 */
export async function utilValidateMediaUrl(url: string, platform: PlatformId, timeout = 3000): Promise<boolean> {
    if (TRUSTED_CDNS[platform]?.some(d => url.includes(d))) return true;
    try {
        const { httpHead } = await import('@/lib/http/client');
        const res = await httpHead(url, { platform, timeout });
        return res.status >= 200 && res.status < 400;
    } catch { return false; }
}

/**
 * Filters an array of URLs, keeping only valid ones
 * @param urls - Array of URLs to filter
 * @param platform - Platform identifier
 * @returns Array of valid URLs
 */
export async function utilFilterValidUrls(urls: string[], platform: PlatformId): Promise<string[]> {
    const results = await Promise.all(urls.map(async url => {
        const ok = await utilValidateMediaUrl(url, platform);
        return ok ? url : null;
    }));
    return results.filter((u): u is string => !!u);
}

// --- Decode Utilities ---

/**
 * Decodes escaped URL characters and HTML entities
 * @param s - String to decode
 * @returns Decoded string
 */
export const utilDecodeUrl = (s: string) => DECODE_MAP.reduce((r, [p, v]) => r.replace(p, v), s);

/**
 * Decodes HTML entities including numeric character references
 * @param s - String to decode
 * @returns Decoded string
 */
export const utilDecodeHtml = (s: string) => {
    let result = utilDecodeUrl(s);
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
    result = result.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
    return result;
};

// --- URL Helpers ---

/**
 * Checks if a URL is a valid media URL
 * @param url - URL to check
 * @param domains - Optional array of allowed domains
 * @returns True if URL appears valid
 */
export const utilIsValidMediaUrl = (url: string, domains?: string[]) =>
    url?.length > 20 && !/<|>/.test(url) && (!domains || domains.some(d => url.includes(d)));

/**
 * Checks if a URL points to a small/icon image
 * @param url - URL to check
 * @returns True if URL matches small image patterns
 */
export const utilIsSmallImage = (url: string) => SMALL_IMG_PATTERNS.some(p => p.test(url));

/**
 * Normalizes a URL for a specific platform
 * @param url - URL to normalize
 * @param platform - Platform identifier
 * @returns Normalized URL with proper protocol
 */
export function utilNormalizeUrl(url: string, platform: PlatformId): string {
    let u = url;
    if (platform === 'facebook') u = u.replace(/m\.|mbasic\.|web\./g, 'www.');
    return u.startsWith('http') ? u : 'https://' + u;
}

/**
 * Removes tracking parameters from a URL
 * @param url - URL to clean
 * @returns URL without tracking parameters
 */
export const utilCleanTrackingParams = (url: string) => url
    .replace(/[&?](wtsid|_rdr|rdid|share_url|app|__cft__\[[^\]]*\]|__tn__)=[^&]*/g, '')
    .replace(/&&+/g, '&').replace(/\?&/g, '?').replace(/[&?]$/g, '');

// --- Response Helpers ---

/**
 * Creates a success response for media download
 * @param platform - Platform identifier
 * @param data - Media data to return
 * @returns NextResponse with success payload
 */
export const utilSuccessResponse = (platform: PlatformId, data: MediaData) =>
    NextResponse.json<DownloadResponse>({ success: true, platform, data });

/**
 * Creates an error response
 * @param platform - Platform identifier
 * @param error - Error message
 * @param status - HTTP status code (default: 400)
 * @returns NextResponse with error payload
 */
export const utilErrorResponse = (platform: PlatformId, error: string, status = 400) =>
    NextResponse.json<DownloadResponse>({ success: false, platform, error }, { status });

/**
 * Creates a "URL is required" error response
 * @param p - Platform identifier
 * @returns NextResponse with missing URL error
 */
export const utilMissingUrlResponse = (p: PlatformId) => utilErrorResponse(p, 'URL is required', 400);

/**
 * Creates an "Invalid URL" error response
 * @param p - Platform identifier
 * @returns NextResponse with invalid URL error
 */
export const utilInvalidUrlResponse = (p: PlatformId) => utilErrorResponse(p, `Invalid ${platformGetDomainConfig(p)?.name || p} URL`, 400);

// --- Format Helpers ---

/**
 * Removes duplicate formats by URL
 * @param f - Array of media formats
 * @returns Deduplicated array
 */
export const utilDedupeFormats = (f: MediaFormat[]) => f.filter((x, i, a) => i === a.findIndex(y => y.url === x.url));

/**
 * Removes duplicate formats by quality, type, and itemId
 * @param f - Array of media formats
 * @returns Deduplicated array
 */
export const utilDedupeByQuality = (f: MediaFormat[]) => f.filter((x, i, a) =>
    i === a.findIndex(y => y.quality === x.quality && y.type === x.type && y.itemId === x.itemId));

/**
 * Gets a human-readable quality label from height
 * @param h - Video height in pixels
 * @returns Quality label (e.g., "HD 720p")
 */
export const utilGetQualityLabel = (h: number) => h >= 1080 ? 'FHD 1080p' : h >= 720 ? 'HD 720p' : h >= 480 ? 'SD 480p' : h >= 360 ? 'SD 360p' : `${h}p`;

/**
 * Gets quality label from bitrate
 * @param b - Bitrate in bits per second
 * @returns Quality label
 */
export const utilGetQualityFromBitrate = (b: number) => b >= 5e6 ? 'FULLHD (1080p)' : b >= 2e6 ? 'HD (720p)' : b >= 8e5 ? 'SD (480p)' : b > 0 ? 'Low (360p)' : 'Video';

// --- Extraction Helpers ---

/**
 * Extracts URLs from HTML using regex patterns
 * @param html - HTML content to search
 * @param patterns - Array of regex patterns with capture groups
 * @param decode - Whether to decode URLs (default: true)
 * @returns Array of unique extracted URLs
 */
export function utilExtractByPatterns(html: string, patterns: RegExp[], decode = true): string[] {
    const results = new Set<string>();
    for (const p of patterns) {
        let m;
        while ((m = p.exec(html)) !== null) {
            const url = decode ? utilDecodeUrl(m[1] || m[0]) : (m[1] || m[0]);
            if (url?.length > 20) results.add(url);
        }
    }
    return [...results];
}

/**
 * Extracts video URLs with quality labels from HTML
 * @param html - HTML content to search
 * @param patterns - Array of pattern/quality pairs
 * @returns Map of URL to quality label
 */
export function utilExtractVideos(html: string, patterns: { pattern: RegExp; quality: string }[]): Map<string, string> {
    const urls = new Map<string, string>();
    const found = new Set<string>();
    for (const { pattern, quality } of patterns) {
        let m;
        while ((m = pattern.exec(html)) !== null) {
            const url = utilDecodeUrl(m[1]);
            if (url?.length > 50 && !found.has(quality)) {
                urls.set(url, quality);
                found.add(quality);
            }
        }
    }
    return urls;
}

/**
 * Extracts metadata from HTML using Open Graph tags
 * @param html - HTML content to search
 * @param $ - Optional Cheerio instance for parsing
 * @returns Object with title, thumbnail, and description
 */
export function utilExtractMeta(html: string, $?: ReturnType<typeof import('cheerio').load>): { title: string; thumbnail: string; description: string } {
    const get = (prop: string) => {
        if ($) return $(`meta[property="${prop}"]`).attr('content') || '';
        const m = html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]+)"`, 'i'));
        return m ? utilDecodeUrl(m[1]) : '';
    };
    return {
        title: get('og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(/ \| .+$/, '').trim() || '',
        thumbnail: get('og:image'),
        description: get('og:description').substring(0, 500),
    };
}

// --- Smart Scraper Helpers ---

/**
 * Creates a media format object
 * @param quality - Quality label
 * @param type - Media type (video, image, audio)
 * @param url - Media URL
 * @param opts - Optional properties (itemId, thumbnail, filename, filesize)
 * @returns MediaFormat object
 */
export function utilCreateFormat(
    quality: string, type: 'video' | 'image' | 'audio', url: string,
    opts?: { itemId?: string; thumbnail?: string; filename?: string; filesize?: number }
): MediaFormat {
    return {
        quality, type, url,
        format: type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : url.includes('.png') ? 'png' : 'jpg',
        ...opts,
    };
}

/**
 * Adds a format to an array if URL is unique
 * @param formats - Array to add to
 * @param quality - Quality label
 * @param type - Media type
 * @param url - Media URL
 * @param opts - Optional properties (itemId, thumbnail, filename, filesize)
 */
export function utilAddFormat(
    formats: MediaFormat[], quality: string, type: 'video' | 'image' | 'audio', url: string,
    opts?: { itemId?: string; thumbnail?: string; filename?: string; filesize?: number }
) {
    if (url && !formats.find(f => f.url === url)) {
        formats.push(utilCreateFormat(quality, type, url, opts));
    }
}

/**
 * Fetch file size for a media URL via HEAD request
 * @param url - Media URL
 * @param platform - Platform identifier for proper headers
 * @param timeout - Request timeout in ms (default: 5000)
 * @returns File size in bytes, or undefined if unavailable
 */
export async function utilFetchFilesize(url: string, platform: PlatformId, timeout = 5000): Promise<number | undefined> {
    try {
        const { httpHead } = await import('@/lib/http/client');
        const res = await httpHead(url, { platform, timeout });

        if (res.status < 200 || res.status >= 400) return undefined;

        const contentLength = res.headers['content-length'];
        if (contentLength) {
            const size = parseInt(contentLength, 10);
            return size > 0 ? size : undefined;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

/**
 * Batch fetch file sizes for multiple formats
 * @param formats - Array of media formats
 * @param platform - Platform identifier
 * @param durationSec - Optional duration for bitrate estimation
 * @returns Formats array with filesize populated where available
 */
export async function utilFetchFilesizes(
    formats: MediaFormat[],
    platform: PlatformId,
    durationSec?: number
): Promise<MediaFormat[]> {
    // Fetch sizes in parallel with concurrency limit
    const BATCH_SIZE = 5;
    const results = [...formats];

    for (let i = 0; i < results.length; i += BATCH_SIZE) {
        const batch = results.slice(i, i + BATCH_SIZE);
        const sizes = await Promise.all(
            batch.map(f => utilFetchFilesize(f.url, platform, 2000))
        );

        sizes.forEach((size, idx) => {
            if (size) {
                results[i + idx] = { ...results[i + idx], filesize: size };
            }
        });
    }

    return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats bytes into human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Formats speed in bytes per second to MB/s and Mbit/s
 * @param bytesPerSec - Speed in bytes per second
 * @returns Object with mb and mbit formatted strings
 */
export function formatSpeed(bytesPerSec: number): { mb: string; mbit: string } {
    const mbps = bytesPerSec / (1024 * 1024);
    const mbitps = (bytesPerSec * 8) / (1024 * 1024);
    return {
        mb: mbps.toFixed(2) + ' MB/s',
        mbit: mbitps.toFixed(1) + ' Mbit/s'
    };
}

/**
 * Parses a file size string to bytes
 * @param sizeStr - Size string (e.g., "1.5 MB")
 * @returns Number of bytes or undefined if invalid
 */
export function formatParseFileSize(sizeStr: string): number | undefined {
    const match = sizeStr.match(/([\d.]+)\s*(KB|MB|GB)/i);
    if (!match) return undefined;

    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
        case 'GB': return num * 1024 * 1024 * 1024;
        case 'MB': return num * 1024 * 1024;
        case 'KB': return num * 1024;
        default: return undefined;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETRY UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates delay based on backoff strategy
 */
function calculateDelay(
    attempt: number,
    baseDelay: number,
    backoff: 'linear' | 'exponential' | 'none'
): number {
    switch (backoff) {
        case 'exponential': return baseDelay * Math.pow(2, attempt);
        case 'linear': return baseDelay * (attempt + 1);
        case 'none':
        default: return baseDelay;
    }
}

/**
 * Wraps a scraper function with retry logic and optional cookie fallback
 * @param fn - Async function to retry, receives useCookie flag
 * @param options - Retry configuration options
 * @returns Result from successful attempt or last failed attempt
 */
export async function retryWithStrategy<T extends ScraperResult>(
    fn: (useCookie?: boolean) => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = sysConfigScraperMaxRetries(),
        baseDelay = sysConfigScraperRetryDelay(),
        backoff = 'exponential',
        retryWithCookie = true,
        cookie,
        onRetry,
    } = options;

    let lastResult: T | null = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            const useCookie = attempt > 0 && retryWithCookie && !!cookie;
            const result = await fn(useCookie);

            if (result.success) return result;

            lastResult = result;
            const errorCode = result.errorCode || ScraperErrorCode.UNKNOWN;

            const canRetry = isRetryable(errorCode);
            const needsCookieRetry = errorShouldRetryWithCookie(errorCode) && retryWithCookie && !!cookie;

            if (!canRetry && !needsCookieRetry) return result;

            if (attempt < maxRetries) {
                onRetry?.(attempt + 1, errorCode);
                const delay = calculateDelay(attempt, baseDelay, backoff);
                await httpRandomSleep(delay, delay + 500);
                attempt++;
            } else {
                return result;
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: errorMsg,
                errorCode: ScraperErrorCode.UNKNOWN,
            } as T;
        }
    }

    return lastResult || {
        success: false,
        error: 'Max retries exceeded',
        errorCode: ScraperErrorCode.UNKNOWN,
    } as T;
}

/**
 * Simple async retry with fixed delay
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param delay - Delay between retries in ms (default: 1000)
 * @returns Result from successful attempt
 * @throws Last error if all retries fail
 */
export async function retryAsync<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
                await httpRandomSleep(delay, delay + 500);
            }
        }
    }

    throw lastError || new Error('Max retries exceeded');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR DISPLAY UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const ERROR_DISPLAYS: Record<ScraperErrorCode, Omit<ErrorDisplay, 'message'>> = {
    [ScraperErrorCode.INVALID_URL]: {
        icon: 'Link2Off', color: 'text-orange-500', bgColor: 'bg-orange-500/10',
        title: 'Invalid URL', retryable: false,
    },
    [ScraperErrorCode.UNSUPPORTED_PLATFORM]: {
        icon: 'Globe', color: 'text-gray-500', bgColor: 'bg-gray-500/10',
        title: 'Not Supported', retryable: false,
    },
    [ScraperErrorCode.UNSUPPORTED_CONTENT]: {
        icon: 'VideoOff', color: 'text-gray-500', bgColor: 'bg-gray-500/10',
        title: 'Unsupported Content', retryable: false,
    },
    [ScraperErrorCode.COOKIE_REQUIRED]: {
        icon: 'Cookie', color: 'text-amber-500', bgColor: 'bg-amber-500/10',
        title: 'Login Required', action: 'Add Cookie', actionType: 'cookie', retryable: true,
    },
    [ScraperErrorCode.COOKIE_EXPIRED]: {
        icon: 'Clock', color: 'text-amber-500', bgColor: 'bg-amber-500/10',
        title: 'Cookie Expired', action: 'Update Cookie', actionType: 'cookie', retryable: true,
    },
    [ScraperErrorCode.COOKIE_INVALID]: {
        icon: 'Cookie', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Invalid Cookie', action: 'Check Cookie', actionType: 'cookie', retryable: false,
    },
    [ScraperErrorCode.COOKIE_BANNED]: {
        icon: 'Ban', color: 'text-red-600', bgColor: 'bg-red-500/10',
        title: 'Account Banned', retryable: false,
    },
    [ScraperErrorCode.NOT_FOUND]: {
        icon: 'FileQuestion', color: 'text-gray-500', bgColor: 'bg-gray-500/10',
        title: 'Not Found', retryable: false,
    },
    [ScraperErrorCode.PRIVATE_CONTENT]: {
        icon: 'Lock', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10',
        title: 'Private Content', action: 'Add Cookie', actionType: 'cookie', retryable: true,
    },
    [ScraperErrorCode.AGE_RESTRICTED]: {
        icon: 'AlertTriangle', color: 'text-orange-500', bgColor: 'bg-orange-500/10',
        title: 'Age Restricted', action: 'Add Cookie', actionType: 'cookie', retryable: true,
    },
    [ScraperErrorCode.NO_MEDIA]: {
        icon: 'ImageOff', color: 'text-gray-500', bgColor: 'bg-gray-500/10',
        title: 'No Media', retryable: false,
    },
    [ScraperErrorCode.DELETED]: {
        icon: 'Trash2', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Deleted', retryable: false,
    },
    [ScraperErrorCode.CONTENT_REMOVED]: {
        icon: 'XCircle', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Content Removed', retryable: false,
    },
    [ScraperErrorCode.GEO_BLOCKED]: {
        icon: 'MapPinOff', color: 'text-blue-500', bgColor: 'bg-blue-500/10',
        title: 'Region Blocked', retryable: false,
    },
    [ScraperErrorCode.TIMEOUT]: {
        icon: 'Timer', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10',
        title: 'Timeout', action: 'Retry', actionType: 'retry', retryable: true,
    },
    [ScraperErrorCode.RATE_LIMITED]: {
        icon: 'Gauge', color: 'text-orange-500', bgColor: 'bg-orange-500/10',
        title: 'Rate Limited', action: 'Wait & Retry', actionType: 'retry', retryable: true,
    },
    [ScraperErrorCode.BLOCKED]: {
        icon: 'ShieldX', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Blocked', retryable: false,
    },
    [ScraperErrorCode.NETWORK_ERROR]: {
        icon: 'Wifi', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'Network Error', action: 'Retry', actionType: 'retry', retryable: true,
    },
    [ScraperErrorCode.API_ERROR]: {
        icon: 'Server', color: 'text-red-500', bgColor: 'bg-red-500/10',
        title: 'API Error', action: 'Retry', actionType: 'retry', retryable: true,
    },
    [ScraperErrorCode.PARSE_ERROR]: {
        icon: 'FileWarning', color: 'text-orange-500', bgColor: 'bg-orange-500/10',
        title: 'Parse Error', retryable: false,
    },
    [ScraperErrorCode.CHECKPOINT_REQUIRED]: {
        icon: 'ShieldAlert', color: 'text-amber-600', bgColor: 'bg-amber-500/10',
        title: 'Verification Required', retryable: false,
    },
    [ScraperErrorCode.UNKNOWN]: {
        icon: 'CircleAlert', color: 'text-gray-500', bgColor: 'bg-gray-500/10',
        title: 'Error', action: 'Retry', actionType: 'retry', retryable: true,
    },
};

/**
 * Gets error display configuration for a scraper error code
 * @param code - Scraper error code
 * @param customMessage - Optional custom message to override default
 * @returns ErrorDisplay configuration for UI
 */
export function errorGetDisplay(code: ScraperErrorCode, customMessage?: string): ErrorDisplay {
    const base = ERROR_DISPLAYS[code] || ERROR_DISPLAYS[ScraperErrorCode.UNKNOWN];
    return {
        ...base,
        message: customMessage || ERROR_MESSAGES[code] || ERROR_MESSAGES[ScraperErrorCode.UNKNOWN],
    };
}

/**
 * Gets error display from string error code
 * @param codeStr - Error code as string
 * @param customMessage - Optional custom message
 * @returns ErrorDisplay configuration for UI
 */
export function errorGetDisplayFromString(codeStr: string, customMessage?: string): ErrorDisplay {
    const code = Object.values(ScraperErrorCode).includes(codeStr as ScraperErrorCode)
        ? codeStr as ScraperErrorCode
        : ScraperErrorCode.UNKNOWN;
    return errorGetDisplay(code, customMessage);
}

/**
 * Checks if an error code requires a cookie to resolve
 * @param code - Scraper error code
 * @returns True if cookie is needed
 */
export function errorNeedsCookie(code: ScraperErrorCode): boolean {
    return [
        ScraperErrorCode.COOKIE_REQUIRED,
        ScraperErrorCode.COOKIE_EXPIRED,
        ScraperErrorCode.AGE_RESTRICTED,
        ScraperErrorCode.PRIVATE_CONTENT,
    ].includes(code);
}

/**
 * Checks if an error should trigger a retry with cookie
 * @param code - Scraper error code
 * @returns True if retry with cookie is recommended
 */
export function errorShouldRetryWithCookie(code: ScraperErrorCode): boolean {
    return [
        ScraperErrorCode.COOKIE_REQUIRED,
        ScraperErrorCode.AGE_RESTRICTED,
        ScraperErrorCode.PRIVATE_CONTENT,
    ].includes(code);
}



// ═══════════════════════════════════════════════════════════════════════════════
// DATA TRANSFORMATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert snake_case string to camelCase
 * @param str - snake_case string
 * @returns camelCase string
 */
export function transformSnakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase string to snake_case
 * @param str - camelCase string
 * @returns snake_case string
 */
export function transformCamelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Transform object keys from snake_case to camelCase
 * @param obj - Object with snake_case keys
 * @returns Object with camelCase keys
 */
export function transformObjectToCamel<T = Record<string, unknown>>(obj: Record<string, unknown>): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = transformSnakeToCamel(key);
        result[camelKey] = value;
    }
    return result as T;
}

/**
 * Transform array of objects from snake_case to camelCase
 * @param arr - Array of objects with snake_case keys
 * @returns Array of objects with camelCase keys
 */
export function transformArrayToCamel<T = Record<string, unknown>>(arr: Record<string, unknown>[]): T[] {
    return arr.map(obj => transformObjectToCamel<T>(obj));
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER TRANSFORMATION (for Admin API)
// ═══════════════════════════════════════════════════════════════════════════════

/** User type for frontend (camelCase) */
export interface UserFrontend {
    id: string;
    email: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    role: 'user' | 'admin';
    status: 'active' | 'frozen' | 'banned';
    referralCode: string;
    referredBy: string | null;
    totalReferrals: number;
    lastSeen: string | null;
    firstJoined: string;
    updatedAt: string;
}

/** User type from database (snake_case) */
export interface UserDatabase {
    id: string;
    email: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    role: 'user' | 'admin';
    status: 'active' | 'frozen' | 'banned';
    referral_code: string;
    referred_by: string | null;
    total_referrals: number;
    last_seen: string | null;
    first_joined: string;
    updated_at: string;
}

/**
 * Transform user from database format to frontend format
 * @param dbUser - User from database (snake_case)
 * @returns User for frontend (camelCase)
 */
export function transformUser(dbUser: UserDatabase): UserFrontend {
    return {
        id: dbUser.id,
        email: dbUser.email,
        username: dbUser.username,
        displayName: dbUser.display_name,
        avatarUrl: dbUser.avatar_url,
        role: dbUser.role,
        status: dbUser.status,
        referralCode: dbUser.referral_code,
        referredBy: dbUser.referred_by,
        totalReferrals: dbUser.total_referrals,
        lastSeen: dbUser.last_seen,
        firstJoined: dbUser.first_joined,
        updatedAt: dbUser.updated_at,
    };
}

/**
 * Transform array of users from database format to frontend format
 * @param dbUsers - Array of users from database
 * @returns Array of users for frontend
 */
export function transformUsers(dbUsers: UserDatabase[]): UserFrontend[] {
    return dbUsers.map(transformUser);
}
