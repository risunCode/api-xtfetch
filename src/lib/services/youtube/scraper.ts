/**
 * YouTube Scraper using yt-dlp
 * 
 * Executes yt-dlp Python script and delegates parsing to extractor.
 * Handles cookie management, URL validation, and error handling.
 * 
 * NOTE: Cache is handled at the route level (lib/cache.ts), not in scrapers.
 * 
 * @module youtube/scraper
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createError, ScraperErrorCode, type ScraperResult, type ScraperOptions } from '@/core/scrapers/types';
import { cookiePoolGetRotating, cookiePoolMarkSuccess, cookiePoolMarkError, cookiePoolMarkExpired } from '@/lib/cookies';
import { logger } from '../shared/logger';
import { extractFormats, extractMetadata, type YtDlpOutput } from './extractor';

const execFileAsync = promisify(execFile);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface YtDlpResult {
    success: boolean;
    error?: string;
    data?: YtDlpOutput;
}

// ═══════════════════════════════════════════════════════════════════════════════
// URL VALIDATION & SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Allowed YouTube hostnames */
const ALLOWED_YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'];

/** Allowed YouTube path patterns */
const ALLOWED_PATH_PATTERN = /^\/(watch|shorts|embed|v|live|playlist|@[\w-]+|channel|c|user|feed|results|hashtag)?/;

/** Shell metacharacters that could enable command injection */
const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>]/g;

/**
 * Sanitize and validate YouTube URL to prevent command injection (RCE)
 * 
 * @param url - The URL to sanitize
 * @returns Sanitized URL string
 * @throws Error if URL is invalid or potentially malicious
 */
function sanitizeYouTubeUrl(url: string): string {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid URL format');
    }

    // Validate protocol - only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid URL protocol - only HTTP/HTTPS allowed');
    }

    // Validate hostname against allowlist
    if (!ALLOWED_YOUTUBE_HOSTS.includes(parsed.hostname)) {
        throw new Error(`Invalid YouTube hostname: ${parsed.hostname}`);
    }

    // Validate path matches allowed patterns
    if (!ALLOWED_PATH_PATTERN.test(parsed.pathname)) {
        throw new Error(`Invalid YouTube path: ${parsed.pathname}`);
    }

    // Build sanitized URL and remove any shell metacharacters
    const sanitizedUrl = parsed.toString().replace(SHELL_METACHARACTERS, '');
    
    return sanitizedUrl;
}

/**
 * Strict YouTube URL validation to prevent command injection
 */
export function isValidYouTubeUrl(url: string): boolean {
    try {
        sanitizeYouTubeUrl(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if URL is YouTube
 */
export function isYouTubeUrl(url: string): boolean {
    return /(?:youtube\.com|youtu\.be|music\.youtube\.com)/i.test(url);
}

/**
 * Extract video ID from YouTube URL
 */
export function extractYouTubeId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/|youtube\.com\/e\/)([a-zA-Z0-9_-]{11})/,
        /(?:music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}

/**
 * Clean YouTube URL - remove playlist and other slow parameters
 */
function cleanYouTubeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        
        if (urlObj.hostname === 'youtu.be') {
            const videoId = urlObj.pathname.slice(1).split('/')[0];
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        
        const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (shortsMatch) {
            return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
        }
        
        return url;
    } catch {
        return url;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COOKIE HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert cookie string to Netscape format for yt-dlp
 */
function convertToNetscapeFormat(cookieData: string): string {
    const trimmed = cookieData.trim();
    
    // Already Netscape format
    if (trimmed.startsWith('# Netscape') || trimmed.startsWith('# HTTP Cookie File')) {
        return trimmed;
    }
    
    // Check if it looks like Netscape format (tab-separated with 7 fields)
    const firstLine = trimmed.split('\n')[0];
    if (firstLine.includes('\t') && firstLine.split('\t').length >= 7) {
        return `# Netscape HTTP Cookie File\n# https://curl.se/docs/http-cookies.html\n\n${trimmed}`;
    }
    
    const lines: string[] = [
        '# Netscape HTTP Cookie File',
        '# https://curl.se/docs/http-cookies.html',
        '',
    ];
    
    const domain = '.youtube.com';
    const expiry = Math.floor(Date.now() / 1000) + 86400 * 365;
    
    // Try JSON format first
    if (trimmed.startsWith('[')) {
        try {
            const cookies = JSON.parse(trimmed) as Array<{
                name: string;
                value: string;
                domain?: string;
                path?: string;
                secure?: boolean;
                expirationDate?: number;
            }>;
            
            for (const c of cookies) {
                if (!c.name || !c.value) continue;
                
                const cookieDomain = c.domain || domain;
                const cookiePath = c.path || '/';
                const secure = c.secure !== false ? 'TRUE' : 'FALSE';
                const exp = c.expirationDate ? Math.floor(c.expirationDate) : expiry;
                const flag = cookieDomain.startsWith('.') ? 'TRUE' : 'FALSE';
                lines.push(`${cookieDomain}\t${flag}\t${cookiePath}\t${secure}\t${exp}\t${c.name}\t${c.value}`);
            }
            
            logger.debug('youtube', `Converted ${cookies.length} JSON cookies to Netscape format`);
            return lines.join('\n');
        } catch (e) {
            logger.warn('youtube', `Failed to parse JSON cookies: ${e}`);
        }
    }
    
    // Raw cookie string format: "name1=value1; name2=value2"
    const cookiePairs = trimmed.split(/;\s*/);
    let convertedCount = 0;
    
    for (const pair of cookiePairs) {
        if (!pair.trim()) continue;
        
        const eqIndex = pair.indexOf('=');
        if (eqIndex === -1) continue;
        
        const name = pair.substring(0, eqIndex).trim();
        const value = pair.substring(eqIndex + 1).trim();
        
        if (!name) continue;
        
        const isSecure = name.startsWith('__Secure-') || name.startsWith('__Host-') || 
                         ['SID', 'SSID', 'HSID', 'SAPISID', 'APISID', 'LOGIN_INFO'].includes(name);
        const secure = isSecure ? 'TRUE' : 'FALSE';
        
        lines.push(`${domain}\tTRUE\t/\t${secure}\t${expiry}\t${name}\t${value}`);
        convertedCount++;
    }
    
    logger.debug('youtube', `Converted ${convertedCount} raw cookies to Netscape format`);
    return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCRAPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scrape YouTube video using yt-dlp
 */
export async function scrapeYouTube(url: string, options?: ScraperOptions): Promise<ScraperResult> {
    if (!isYouTubeUrl(url)) {
        return createError(ScraperErrorCode.INVALID_URL, 'Invalid YouTube URL');
    }

    let cookieFilePath: string | null = null;
    let usedCookie = false;

    try {
        const cleanUrl = cleanYouTubeUrl(url);
        
        // Sanitize URL to prevent command injection before passing to execFile
        let sanitizedUrl: string;
        try {
            sanitizedUrl = sanitizeYouTubeUrl(cleanUrl);
        } catch (sanitizeError) {
            const errorMsg = sanitizeError instanceof Error ? sanitizeError.message : 'URL sanitization failed';
            logger.warn('youtube', `URL sanitization failed: ${errorMsg}`);
            return createError(ScraperErrorCode.INVALID_URL, `Invalid YouTube URL: ${errorMsg}`);
        }
        
        const scriptPath = path.join(process.cwd(), 'scripts', 'ytdlp-extract.py');
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        
        // First attempt: WITHOUT cookie to get all formats
        logger.debug('youtube', `Extracting with yt-dlp (no cookie): ${sanitizedUrl}`);
        const startTime = Date.now();

        let args = [scriptPath, sanitizedUrl];
        let execResult = await execFileAsync(pythonCmd, args, {
            timeout: 90000,
            maxBuffer: 10 * 1024 * 1024,
        }).catch(e => ({ stdout: '', stderr: e.message || String(e) }));
        
        let { stdout, stderr } = execResult;
        
        // Check if we need to retry with cookie
        const needsCookie = !stdout || 
            stderr?.includes('Sign in') || 
            stderr?.includes('age') || 
            stderr?.includes('private') ||
            stderr?.includes('confirm your age');
        
        if (needsCookie) {
            const poolCookie = await cookiePoolGetRotating('youtube');
            if (poolCookie) {
                logger.debug('youtube', `Retrying with cookie for: ${sanitizedUrl}`);
                
                const tempDir = os.tmpdir();
                cookieFilePath = path.join(tempDir, `yt-cookie-${Date.now()}.txt`);
                const netscapeCookie = convertToNetscapeFormat(poolCookie);
                await fs.writeFile(cookieFilePath, netscapeCookie, 'utf-8');
                usedCookie = true;
                
                args = [scriptPath, sanitizedUrl, cookieFilePath];
                const retryResult = await execFileAsync(pythonCmd, args, {
                    timeout: 90000,
                    maxBuffer: 10 * 1024 * 1024,
                }).catch(e => ({ stdout: '', stderr: e.message || String(e) }));
                
                stdout = retryResult.stdout;
                stderr = retryResult.stderr;
            }
        }
        
        const extractTime = Date.now() - startTime;
        logger.debug('youtube', `yt-dlp extraction took ${extractTime}ms${usedCookie ? ' (with cookie)' : ''}`);

        if (stderr) {
            logger.warn('youtube', `yt-dlp stderr: ${stderr}`);
        }

        // Parse result
        const ytdlpResult: YtDlpResult = JSON.parse(stdout);

        if (!ytdlpResult.success || !ytdlpResult.data) {
            const errorMsg = ytdlpResult.error?.toLowerCase() || '';
            if (usedCookie && (errorMsg.includes('sign in') || errorMsg.includes('login') || errorMsg.includes('cookie'))) {
                cookiePoolMarkExpired('YouTube cookie expired or invalid').catch(() => {});
            } else if (usedCookie) {
                cookiePoolMarkError(ytdlpResult.error).catch(() => {});
            }
            return createError(ScraperErrorCode.PARSE_ERROR, ytdlpResult.error || 'Failed to extract video');
        }

        if (usedCookie) {
            cookiePoolMarkSuccess().catch(() => {});
        }

        // Use extractor to parse formats and metadata
        const formats = extractFormats(ytdlpResult.data);
        const metadata = extractMetadata(ytdlpResult.data);

        const result: ScraperResult = {
            success: true,
            data: {
                title: metadata.title,
                description: metadata.description,
                author: metadata.author,
                thumbnail: metadata.thumbnail,
                url,
                formats,
                engagement: metadata.engagement,
                usedCookie,
            },
        };

        logger.complete('youtube', Date.now());
        
        return result;

    } catch (error: unknown) {
        const err = error as { code?: string; killed?: boolean; message?: string };
        
        if (usedCookie) {
            const msg = err.message?.toLowerCase() || '';
            if (msg.includes('sign in') || msg.includes('login') || msg.includes('cookie')) {
                cookiePoolMarkExpired('YouTube cookie expired').catch(() => {});
            } else {
                cookiePoolMarkError(err.message).catch(() => {});
            }
        }
        
        if (err.code === 'ETIMEDOUT' || err.killed) {
            return createError(ScraperErrorCode.TIMEOUT, 'YouTube extraction timed out');
        }
        
        if (err.message?.includes('not found') || err.code === 'ENOENT') {
            return createError(ScraperErrorCode.API_ERROR, 'yt-dlp not installed on server');
        }

        const msg = err.message?.toLowerCase() || '';
        if (msg.includes('private') || msg.includes('sign in')) {
            return createError(ScraperErrorCode.PRIVATE_CONTENT, 'This video is private or requires login');
        }
        if (msg.includes('unavailable') || msg.includes('removed')) {
            return createError(ScraperErrorCode.NOT_FOUND, 'Video unavailable or removed');
        }
        if (msg.includes('age') || msg.includes('confirm your age')) {
            return createError(ScraperErrorCode.AGE_RESTRICTED, 'This video is age-restricted');
        }

        return createError(ScraperErrorCode.UNKNOWN, (err.message || 'Unknown error').substring(0, 200));
    } finally {
        if (cookieFilePath) {
            fs.unlink(cookieFilePath).catch(() => {});
        }
    }
}
