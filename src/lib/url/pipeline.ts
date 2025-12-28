/**
 * Central URL Pipeline
 */

import { createHash } from 'crypto';
import { logger } from '@/lib/services/shared/logger';
import { type PlatformId, platformDetect } from '@/core/config';
import { httpResolveUrl, ResolveResult } from '@/lib/http';

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM DETECTION CACHE (Memoization)
// ═══════════════════════════════════════════════════════════════════════════════

const PLATFORM_CACHE_MAX_SIZE = 1000;
const platformCache = new Map<string, PlatformId | null>();

/**
 * Memoized platform detection with LRU-style eviction
 */
function detectPlatformCached(url: string): PlatformId | null {
  const cached = platformCache.get(url);
  if (cached !== undefined) {
    return cached;
  }

  const result = platformDetect(url);

  // Evict oldest entries if cache is full
  if (platformCache.size >= PLATFORM_CACHE_MAX_SIZE) {
    const firstKey = platformCache.keys().next().value;
    if (firstKey) platformCache.delete(firstKey);
  }

  platformCache.set(url, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// URL SANITIZATION (Security layer)
// ═══════════════════════════════════════════════════════════════════════════════

/** Security: Patterns that indicate malicious/internal URLs */
const BLOCKED_PATTERNS = [
  /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.)/,  // Private IPs
  /^localhost/i, /^0\.0\.0\.0/, /\.local$/i,                     // Localhost
  /^file:/i, /^ftp:/i, /^javascript:/i, /^data:/i,               // Dangerous protocols
  /^169\.254\./,                                                  // Link-local
];

/**
 * Extract URL from garbage text
 * ✅ "sampah https://fb.watch/abc" → "https://fb.watch/abc"
 * ❌ "garbage.https://link.com" → null (must have space before http)
 */
export function urlExtract(input: string): string | null {
  if (!input) return null;

  const cleaned = input.replace(/[\r\n]+/g, ' ').trim();

  // Check if input starts with http (clean URL)
  if (/^https?:\/\//i.test(cleaned)) {
    const match = cleaned.match(/^(https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+)/i);
    return match ? match[1].replace(/[,，。！!?？、；;：:]+$/, '').replace(/\/+$/, '') : null;
  }

  // Must have space before http (security: prevent garbage.https://evil.com)
  const withSpace = cleaned.match(/(?:^|\s)(https?:\/\/[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+)/i);
  if (withSpace) {
    return withSpace[1].replace(/[,，。！!?？、；;：:]+$/, '').replace(/\/+$/, '');
  }

  return null;
}

/**
 * Validate URL for security (SSRF prevention)
 */
export function urlValidate(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Protocol check
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: `Blocked protocol: ${parsed.protocol}` };
    }

    // Check against blocked patterns
    const hostname = parsed.hostname.toLowerCase();
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(hostname) || pattern.test(url)) {
        return { valid: false, error: 'Blocked: internal/malicious URL' };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Combined: Extract + Validate + Clean
 * Main entry point for URL sanitization
 */
export function urlSanitize(input: string): {
  url: string | null;
  error?: string;
  isValid: boolean;
} {
  // Step 1: Extract URL
  const extracted = urlExtract(input);
  if (!extracted) {
    return { url: null, error: 'No valid URL found', isValid: false };
  }

  // Step 2: Validate
  const validation = urlValidate(extracted);
  if (!validation.valid) {
    return { url: null, error: validation.error, isValid: false };
  }

  // Step 3: Clean tracking params
  const cleaned = cleanTrackingParams(extracted);

  return { url: cleaned, isValid: true };
}

export type ContentType = 'video' | 'reel' | 'story' | 'post' | 'image' | 'unknown';


export interface UrlAssessment {
  isValid: boolean;
  mayRequireCookie: boolean;
  errorCode?: 'INVALID_URL' | 'UNSUPPORTED_PLATFORM' | 'RESOLVE_FAILED' | 'MISSING_CONTENT_ID';
  errorMessage?: string;
}

export interface UrlPipelineResult {
  inputUrl: string;
  normalizedUrl: string;
  resolvedUrl: string;
  platform: PlatformId | null;
  contentType: ContentType;
  contentId: string | null;
  wasResolved: boolean;
  redirectChain: string[];
  assessment: UrlAssessment;
  cacheKey: string | null;
}

export interface UrlPipelineOptions {
  skipResolve?: boolean;
  timeout?: number;
  forceResolve?: boolean;
  cookie?: string;
}

const SHORT_URL_PATTERNS: Readonly<Record<string, RegExp>> = Object.freeze({
  facebook: /fb\.watch|fb\.me|l\.facebook\.com|\/share\//i,
  instagram: /instagr\.am|ig\.me/i,
  twitter: /t\.co\//i,
  tiktok: /vm\.tiktok\.com|vt\.tiktok\.com/i,
  weibo: /t\.cn\//i,
});

const CONTENT_ID_EXTRACTORS: Record<PlatformId, (url: string) => string | null> = {
  twitter: (url) => url.match(/status(?:es)?\/(\d+)/)?.[1] || null,
  instagram: (url) => {
    const shortcode = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    if (shortcode) return shortcode[1];
    const storyId = url.match(/\/stories\/[^/]+\/(\d+)/i);
    if (storyId) return `story:${storyId[1]}`;
    return null;
  },
  facebook: (url) => {
    const videoId = url.match(/\/(?:videos?|watch|reel)\/(\d+)/i);
    if (videoId) return videoId[1];
    const watchParam = url.match(/[?&]v=(\d+)/i);
    if (watchParam) return watchParam[1];
    const groupPermalink = url.match(/\/groups\/\d+\/permalink\/(\d+)/i);
    if (groupPermalink) return groupPermalink[1];
    const storyFbid = url.match(/story_fbid=(\d+)/i);
    if (storyFbid) return storyFbid[1];
    const pfbid = url.match(/pfbid([A-Za-z0-9]+)/i);
    if (pfbid) return `pfbid${pfbid[1]}`;
    const shareId = url.match(/\/share\/[prvs]\/([A-Za-z0-9]+)/i);
    if (shareId) return `share:${shareId[1]}`;
    const postId = url.match(/\/posts\/(\d+)/i);
    if (postId) return postId[1];
    const storyId = url.match(/\/stories\/[^/]+\/(\d+)/i);
    if (storyId) return `story:${storyId[1]}`;
    const photoId = url.match(/\/photos?\/[^/]+\/(\d+)/i);
    if (photoId) return `photo:${photoId[1]}`;
    return null;
  },
  tiktok: (url) => {
    const videoId = url.match(/\/video\/(\d+)/i);
    if (videoId) return videoId[1];
    const fullUrl = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/i);
    if (fullUrl) return fullUrl[1];
    return null;
  },
  weibo: (url) => {
    const longId = url.match(/\/(\d{16,})/);
    if (longId) return longId[1];
    const userPost = url.match(/weibo\.(?:com|cn)\/(\d+)\/([A-Za-z0-9]+)/);
    if (userPost) return `${userPost[1]}:${userPost[2]}`;
    const detail = url.match(/\/(?:detail|status)\/(\d+)/i);
    if (detail) return detail[1];
    return null;
  },
  youtube: (url) => {
    const watchId = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchId) return watchId[1];
    const shortId = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortId) return shortId[1];
    const embedId = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedId) return embedId[1];
    const shortsId = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsId) return shortsId[1];
    return null;
  },
};

const CONTENT_TYPE_DETECTORS: Record<PlatformId, (url: string) => ContentType> = {
  twitter: () => 'post',
  instagram: (url) => /\/stories\//.test(url) ? 'story' : /\/reel/.test(url) ? 'reel' : /\/tv\//.test(url) ? 'video' : 'post',
  facebook: (url) => /\/stories\//.test(url) ? 'story' : /\/reel/.test(url) ? 'reel' : /\/videos\/|\/watch\//.test(url) ? 'video' : /\/photos\//.test(url) ? 'image' : 'post',
  tiktok: () => 'video',
  weibo: () => 'post',
  youtube: (url) => /\/shorts\//.test(url) ? 'reel' : 'video',
};

const COOKIE_REQUIRED_PATTERNS: Record<PlatformId, RegExp | null> = {
  twitter: null,
  instagram: /\/stories\//i,
  facebook: /\/stories\/|\/groups\//i,
  tiktok: null,
  weibo: /./,
  youtube: null,
};

export function needsResolve(url: string, platform?: PlatformId): boolean {
  if (platform && SHORT_URL_PATTERNS[platform]) return SHORT_URL_PATTERNS[platform].test(url);
  return Object.values(SHORT_URL_PATTERNS).some(re => re.test(url));
}

export function normalizeUrl(url: string): string {
  let n = url.trim();
  if (!/^https?:\/\//i.test(n)) n = 'https://' + n;

  // NO subdomain conversion here!
  // Server handles redirect based on User-Agent from BrowserProfiles (UNIFIED)
  // m.facebook.com → request with desktop UA → Facebook redirects to web.facebook.com

  return cleanTrackingParams(n);
}

export function cleanTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    ['fbclid', 'igshid', 'igsh', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 's', 't', 'ref', 'ref_src', 'ref_url', '__cft__', '__tn__', 'wtsid', '_rdr', 'rdid', 'share_url', 'app', 'mibextid', 'paipv', 'eav', 'sfnsn', 'extid', 'img_index'].forEach(p => u.searchParams.delete(p));
    [...u.searchParams.keys()].filter(k => k.startsWith('__cft__')).forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch { return url.replace(/[&?](fbclid|igshid|igsh|utm_\w+|__cft__\[[^\]]*\]|__tn__|wtsid|_rdr|rdid|share_url|app|mibextid|paipv|eav|sfnsn|extid|img_index)=[^&]*/gi, '').replace(/&&+/g, '&').replace(/\?&/g, '?').replace(/[&?]$/g, ''); }
}

/**
 * Generate SHA-256 hash of URL (truncated to 16 chars)
 */
export function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/**
 * @deprecated Use hashUrl() instead. Kept for backward compatibility.
 */
export function hashString(str: string): string {
  return hashUrl(str);
}

export function generateCacheKeyFromUrl(platform: PlatformId, url: string): string {
  const cleanUrl = cleanTrackingParams(url);
  const hash = hashUrl(cleanUrl);
  return `${platform}:${hash}`;
}

export function extractContentId(platform: PlatformId, url: string): string | null {
  return CONTENT_ID_EXTRACTORS[platform]?.(url) || null;
}

export function detectContentType(platform: PlatformId, url: string): ContentType {
  return CONTENT_TYPE_DETECTORS[platform]?.(url) || 'unknown';
}

export function mayRequireCookie(platform: PlatformId, url: string): boolean {
  const p = COOKIE_REQUIRED_PATTERNS[platform];
  return p ? p.test(url) : false;
}

export function generateCacheKey(platform: PlatformId, contentId: string): string {
  return `${platform}:${contentId}`;
}

export function isValidUrl(url: string): boolean {
  try { new URL(url.startsWith('http') ? url : 'https://' + url); return true; } catch { return false; }
}

export async function prepareUrl(rawUrl: string, options?: UrlPipelineOptions): Promise<UrlPipelineResult> {
  const { skipResolve = false, timeout = 5000, forceResolve = false, cookie } = options || {};
  const inputUrl = rawUrl.trim();
  if (!inputUrl || !isValidUrl(inputUrl)) return createErrorResult(inputUrl, 'INVALID_URL', 'Invalid URL format');

  const normalizedUrl = normalizeUrl(inputUrl);
  let platform = detectPlatformCached(normalizedUrl);
  let resolvedUrl = normalizedUrl;
  let wasResolved = false;
  let redirectChain: string[] = [normalizedUrl];

  if (!skipResolve && (forceResolve || needsResolve(normalizedUrl, platform || undefined))) {
    logger.debug('url-pipeline', `Resolving: ${normalizedUrl}`);
    const r: ResolveResult = await httpResolveUrl(normalizedUrl, { timeout, cookie });
    if (!r.error) { resolvedUrl = r.resolved; wasResolved = r.changed; redirectChain = r.redirectChain; }
  }

  if (wasResolved) { const np = detectPlatformCached(resolvedUrl); if (np) platform = np; }
  if (!platform) return createErrorResult(inputUrl, 'UNSUPPORTED_PLATFORM', 'Platform not supported', { normalizedUrl, resolvedUrl, wasResolved, redirectChain });

  const contentId = extractContentId(platform, resolvedUrl);
  const contentType = detectContentType(platform, resolvedUrl);
  const cacheKey = generateCacheKeyFromUrl(platform, resolvedUrl);

  return { inputUrl, normalizedUrl, resolvedUrl, platform, contentType, contentId, wasResolved, redirectChain, assessment: { isValid: true, mayRequireCookie: mayRequireCookie(platform, resolvedUrl) }, cacheKey };
}

export function prepareUrlSync(rawUrl: string): UrlPipelineResult {
  const inputUrl = rawUrl.trim();
  if (!inputUrl || !isValidUrl(inputUrl)) return { ...createErrorResult(inputUrl, 'INVALID_URL', 'Invalid URL format'), wasResolved: false, redirectChain: [] };
  const normalizedUrl = normalizeUrl(inputUrl);
  const platform = detectPlatformCached(normalizedUrl);
  if (!platform) return { ...createErrorResult(inputUrl, 'UNSUPPORTED_PLATFORM', 'Platform not supported', { normalizedUrl }), wasResolved: false, redirectChain: [normalizedUrl] };
  const contentId = extractContentId(platform, normalizedUrl);
  const cacheKey = generateCacheKeyFromUrl(platform, normalizedUrl);
  return { inputUrl, normalizedUrl, resolvedUrl: normalizedUrl, platform, contentType: detectContentType(platform, normalizedUrl), contentId, wasResolved: false, redirectChain: [normalizedUrl], assessment: { isValid: true, mayRequireCookie: mayRequireCookie(platform, normalizedUrl) }, cacheKey };
}

function createErrorResult(inputUrl: string, errorCode: UrlAssessment['errorCode'], errorMessage: string, partial?: Partial<UrlPipelineResult>): UrlPipelineResult {
  return { inputUrl, normalizedUrl: partial?.normalizedUrl || inputUrl, resolvedUrl: partial?.resolvedUrl || inputUrl, platform: null, contentType: 'unknown', contentId: null, wasResolved: partial?.wasResolved || false, redirectChain: partial?.redirectChain || [], assessment: { isValid: false, mayRequireCookie: false, errorCode, errorMessage }, cacheKey: null };
}
