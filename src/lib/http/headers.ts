/**
 * HTTP Headers Module
 * 
 * UA Strategy (Beta - December 2025):
 * - PRIMARY: iPad Chrome (tablet UA - gets desktop page with HD, slightly faster)
 * - FALLBACK: Desktop Chrome
 * 
 * iPad UA benefits:
 * - No mobile redirect (stays on web.facebook.com)
 * - Gets full desktop page with HD video URLs
 * - ~43ms faster than desktop UA on average
 * - Smaller response size
 * 
 * @module http/headers
 */

import type { PlatformId } from '@/lib/types';
export type { PlatformId } from '@/lib/types';

// ═══════════════════════════════════════════════════════════════════════════════
// USER AGENTS - iPad Chrome Primary, Desktop Chrome Fallback
// ═══════════════════════════════════════════════════════════════════════════════

// iPad Chrome - PRIMARY (3 models for rotation: 2020-2025)
export const UA_IPAD = [
  // iPad Pro 12.9" (2024) - M4 chip
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  // iPad Air (2022) - M1 chip  
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  // iPad Pro 11" (2020) - A12Z
  'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
];

// Desktop Chrome - FALLBACK (2 versions)
export const UA_DESKTOP_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

// Legacy exports for backward compatibility
export const UA_DESKTOP = UA_DESKTOP_POOL[0];
export const UA_MOBILE = UA_IPAD[0]; // Deprecated - use UA_IPAD
export const UA_APPS: Partial<Record<PlatformId, string>> = {}; // Deprecated - dropped

// ═══════════════════════════════════════════════════════════════════════════════
// UA ROTATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

let ipadIndex = 0;
let desktopIndex = 0;

/** Get next iPad UA (round-robin rotation) */
export function getNextIpadUA(): string {
  const ua = UA_IPAD[ipadIndex];
  ipadIndex = (ipadIndex + 1) % UA_IPAD.length;
  return ua;
}

/** Get next Desktop UA (round-robin rotation) */
export function getNextDesktopUA(): string {
  const ua = UA_DESKTOP_POOL[desktopIndex];
  desktopIndex = (desktopIndex + 1) % UA_DESKTOP_POOL.length;
  return ua;
}

/** Get primary UA (iPad) with desktop fallback option */
export function getPrimaryUA(useFallback = false): string {
  return useFallback ? getNextDesktopUA() : getNextIpadUA();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED PLATFORM CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Platform HTTP configuration interface
 */
export interface PlatformHttpConfig {
  referer: string;
  origin: string;
  ua: {
    desktop: string;
    mobile: string;
  };
  extraHeaders?: Record<string, string>;
}

/**
 * Consolidated platform configuration
 * ALL platforms use iPad Chrome as primary UA
 */
export const PLATFORM_CONFIG: Record<PlatformId, PlatformHttpConfig> = {
  facebook: {
    referer: 'https://web.facebook.com/',
    origin: 'https://web.facebook.com',
    ua: { desktop: UA_IPAD[0], mobile: UA_IPAD[0] },
  },
  instagram: {
    referer: 'https://www.instagram.com/',
    origin: 'https://www.instagram.com',
    ua: { desktop: UA_IPAD[0], mobile: UA_IPAD[0] },
    extraHeaders: {
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest',
    },
  },
  twitter: {
    referer: 'https://twitter.com/',
    origin: 'https://twitter.com',
    ua: { desktop: UA_IPAD[0], mobile: UA_IPAD[0] },
  },
  tiktok: {
    referer: 'https://www.tiktok.com/',
    origin: 'https://www.tiktok.com',
    ua: { desktop: UA_IPAD[0], mobile: UA_IPAD[0] },
  },
  weibo: {
    referer: 'https://weibo.com/',
    origin: 'https://weibo.com',
    ua: { desktop: UA_IPAD[0], mobile: UA_IPAD[0] },
  },
  youtube: {
    referer: 'https://www.youtube.com/',
    origin: 'https://www.youtube.com',
    ua: { desktop: UA_IPAD[0], mobile: UA_IPAD[0] },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// BACKWARD COMPATIBLE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export const getReferer = (p: PlatformId): string => PLATFORM_CONFIG[p]?.referer || '';
export const getOrigin = (p: PlatformId): string => PLATFORM_CONFIG[p]?.origin || '';

/** 
 * Get User-Agent for platform
 * All platforms use iPad Chrome (rotated)
 */
export const httpGetUserAgent = (_p?: PlatformId): string => getNextIpadUA();

// ═══════════════════════════════════════════════════════════════════════════════
// HEADERS
// ═══════════════════════════════════════════════════════════════════════════════

interface HeaderOptions {
  cookie?: string;
  referer?: string;
  useFallback?: boolean; // Use Desktop Chrome instead of iPad
  extra?: Record<string, string>;
}

/**
 * Get headers for platform request
 * PRIMARY: iPad Chrome (rotated)
 * FALLBACK: Desktop Chrome (when useFallback=true)
 */
export function httpGetHeaders(platform: PlatformId, options?: HeaderOptions): Record<string, string> {
  const { cookie, referer, useFallback = false, extra } = options || {};
  const config = PLATFORM_CONFIG[platform];

  // iPad Chrome primary, Desktop Chrome fallback
  const ua = useFallback ? getNextDesktopUA() : getNextIpadUA();
  const isDesktop = useFallback;

  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'DNT': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };

  // Desktop Chrome sends Sec-Ch-Ua headers, iPad doesn't
  if (isDesktop) {
    headers['Sec-Ch-Ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
    headers['Sec-Ch-Ua-Mobile'] = '?0';
    headers['Sec-Ch-Ua-Platform'] = '"Windows"';
  }

  // Referer/Origin from config
  const r = referer || config.referer;
  if (r) {
    headers['Referer'] = r;
    headers['Origin'] = config.origin || new URL(r).origin;
    headers['Sec-Fetch-Site'] = 'same-origin';
  }

  // Cookie
  if (cookie) headers['Cookie'] = cookie;

  // Platform-specific extra headers from config
  if (config.extraHeaders) {
    Object.assign(headers, config.extraHeaders);
  }

  // Additional extra headers from options
  if (extra) Object.assign(headers, extra);

  return headers;
}

/**
 * Get API headers (for JSON endpoints)
 */
export function httpGetApiHeaders(platform?: PlatformId, cookie?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': httpGetUserAgent(platform),
    'Accept': 'application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (platform) {
    const config = PLATFORM_CONFIG[platform];
    headers['Referer'] = config.referer;
    headers['Origin'] = config.origin;
  }
  if (cookie) headers['Cookie'] = cookie;
  return headers;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export const httpGetRandomDelay = (min = 500, max = 2000): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const httpRandomSleep = (min = 500, max = 2000): Promise<void> =>
  new Promise<void>(r => setTimeout(r, httpGetRandomDelay(min, max)));
