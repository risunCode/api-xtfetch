/**
 * HTTP Client Module
 * 
 * Smart connection pooling with per-platform timeouts.
 * HTTP methods: httpGet, httpPost, httpHead, httpResolveUrl
 * 
 * @module http/client
 */

import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import { logger } from '@/core';
import type { PlatformId } from '@/lib/types';
import { httpGetHeaders, httpGetApiHeaders, httpGetUserAgent, UA_APPS } from './headers';

export type { PlatformId } from '@/lib/types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface HttpGetOptions {
  cookie?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface HttpPostOptions {
  platform?: PlatformId;
  cookie?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface HttpHeadOptions {
  platform?: PlatformId;
  cookie?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface HttpResponse<T = string> {
  data: T;
  status: number;
  headers: Record<string, string>;
  finalUrl: string;
  redirected: boolean;
}

export interface ResolveResult {
  original: string;
  resolved: string;
  redirectChain: string[];
  changed: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM TIMEOUTS (exported for other modules)
// ═══════════════════════════════════════════════════════════════════════════════

export const PLATFORM_TIMEOUTS: Record<PlatformId, number> = {
  facebook: 15000,   // 15s - optimized (was 30s)
  instagram: 20000,  // 20s - media heavy
  twitter: 15000,    // 15s - fast API
  tiktok: 10000,     // 10s - optimized CDN
  weibo: 20000,      // 20s - China latency
  youtube: 25000,    // 25s - large payloads
  // New platforms (yt-dlp/gallery-dl based)
  bilibili: 30000,   // 30s - China latency
  reddit: 20000,     // 20s
  soundcloud: 20000, // 20s
  eporner: 25000,    // 25s
  pornhub: 25000,    // 25s
  rule34video: 25000, // 25s
  erome: 25000,      // 25s
  pixiv: 30000,      // 30s - may need auth
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTION POOL CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const POOL_CONFIG = {
  keepAlive: true,
  keepAliveMsecs: 30 * 60 * 1000, // 30 minutes idle timeout
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  scheduling: 'fifo' as const,
};

// Create pooled agents
const httpAgent = new http.Agent(POOL_CONFIG);
const httpsAgent = new https.Agent(POOL_CONFIG);

// Log pool initialization
logger.debug('http', `Connection pool initialized: keepAlive=${POOL_CONFIG.keepAlive}, maxSockets=${POOL_CONFIG.maxSockets}, idleTimeout=${POOL_CONFIG.keepAliveMsecs / 1000 / 60}min`);

// ═══════════════════════════════════════════════════════════════════════════════
// AXIOS CLIENT - with Smart Connection Pooling
// ═══════════════════════════════════════════════════════════════════════════════

const client: AxiosInstance = axios.create({
  timeout: 30000, // Default timeout, overridden per-request
  maxRedirects: 10,
  validateStatus: (s) => s < 500,
  responseType: 'text',
  decompress: true,
  // Force Node.js http adapter (bypass Next.js fetch)
  adapter: 'http',
  httpAgent,
  httpsAgent,
});

client.interceptors.response.use(
  (res) => {
    const finalUrl = res.request?.res?.responseUrl || res.config.url;
    if (finalUrl && finalUrl !== res.config.url) {
      logger.debug('http', `Redirect: ${res.config.url} → ${finalUrl}`);
    }
    return res;
  },
  (err) => {
    if (err.code === 'ECONNABORTED') {
      logger.warn('http', `Timeout: ${err.config?.url}`);
    }
    return Promise.reject(err);
  }
);

export { client as axiosClient };

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Get timeout for platform
// ═══════════════════════════════════════════════════════════════════════════════

function getTimeout(platform: PlatformId, customTimeout?: number): number {
  return customTimeout ?? PLATFORM_TIMEOUTS[platform];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP METHODS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * HTTP GET - Platform parameter is REQUIRED
 * Uses per-platform timeout defaults
 */
export async function httpGet(
  url: string,
  platform: PlatformId,
  options?: HttpGetOptions
): Promise<HttpResponse> {
  const { cookie, timeout, headers: extra } = options || {};
  const effectiveTimeout = getTimeout(platform, timeout);
  
  const headers = httpGetHeaders(platform, { cookie, extra });

  try {
    const res = await client.get(url, { 
      headers, 
      timeout: effectiveTimeout 
    });
    
    const finalUrl = res.request?.res?.responseUrl || url;

    return {
      data: res.data,
      status: res.status,
      headers: res.headers as Record<string, string>,
      finalUrl,
      redirected: finalUrl !== url,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error';
    
    // Handle non-http protocol redirects (fb:, intent:, etc)
    // Axios throws when it can't follow these redirects
    if (errMsg.includes('Unsupported protocol')) {
      logger.debug('http', `Non-http redirect detected, retrying without redirects...`);
      
      // Retry with maxRedirects: 0 and manually handle
      const res = await client.get(url, { 
        headers, 
        timeout: effectiveTimeout,
        maxRedirects: 0,
        validateStatus: () => true, // Accept all status codes
      });
      
      // If we get a redirect status, try to extract Location header
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers['location'];
        if (location && (location.startsWith('http://') || location.startsWith('https://'))) {
          // Follow the http redirect manually
          return httpGet(location, platform, options);
        }
      }
      
      return {
        data: res.data,
        status: res.status,
        headers: res.headers as Record<string, string>,
        finalUrl: url,
        redirected: false,
      };
    }
    
    throw e;
  }
}

/**
 * HTTP POST
 * Uses platform timeout if provided, otherwise default
 */
export async function httpPost<T = unknown>(
  url: string,
  body?: unknown,
  options?: HttpPostOptions
): Promise<HttpResponse<T>> {
  const { platform, cookie, timeout, headers: extra } = options || {};
  const effectiveTimeout = platform ? getTimeout(platform, timeout) : (timeout ?? 30000);
  
  const headers = httpGetApiHeaders(platform, cookie);
  headers['Content-Type'] = 'application/json';
  if (extra) Object.assign(headers, extra);

  const res = await client.post(url, body, { 
    headers, 
    timeout: effectiveTimeout 
  });
  
  const finalUrl = res.request?.res?.responseUrl || url;

  return {
    data: res.data as T,
    status: res.status,
    headers: res.headers as Record<string, string>,
    finalUrl,
    redirected: finalUrl !== url,
  };
}

/**
 * HTTP HEAD
 * Uses platform timeout if provided, otherwise default
 */
export async function httpHead(
  url: string,
  options?: HttpHeadOptions
): Promise<HttpResponse<null>> {
  const { platform, cookie, timeout, headers: extra } = options || {};
  const effectiveTimeout = platform ? getTimeout(platform, timeout) : (timeout ?? 30000);
  
  const headers: Record<string, string> = { 
    'User-Agent': httpGetUserAgent(platform), 
    'Accept': '*/*' 
  };
  if (cookie) headers['Cookie'] = cookie;
  if (extra) Object.assign(headers, extra);

  const res = await client.head(url, { 
    headers, 
    timeout: effectiveTimeout 
  });
  
  const finalUrl = res.request?.res?.responseUrl || url;

  return {
    data: null,
    status: res.status,
    headers: res.headers as Record<string, string>,
    finalUrl,
    redirected: finalUrl !== url,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// URL RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

interface ResolveOptions {
  platform?: PlatformId;
  timeout?: number;
  maxRedirects?: number;
  cookie?: string;
}

/**
 * Resolve short URL to final destination
 * Uses platform timeout if provided
 */
export async function httpResolveUrl(
  shortUrl: string,
  options?: ResolveOptions
): Promise<ResolveResult> {
  const { platform, timeout, maxRedirects = 10, cookie } = options || {};
  const effectiveTimeout = platform ? getTimeout(platform, timeout) : (timeout ?? 5000);
  const resolveChain: string[] = [shortUrl];
  let lastValidUrl = shortUrl;

  const tryResolve = async (useFallback: boolean): Promise<ResolveResult> => {
    try {
      const headers = platform
        ? httpGetHeaders(platform, { cookie, useFallback })
        : { 'User-Agent': httpGetUserAgent(), ...(cookie && { Cookie: cookie }) };

      const res = await client.get(shortUrl, {
        timeout: effectiveTimeout,
        maxRedirects,
        headers,
        validateStatus: () => true,
        beforeRedirect: (c) => { 
          // Skip non-http(s) protocols (fb:, intent:, etc)
          if (c.href && (c.href.startsWith('http://') || c.href.startsWith('https://'))) {
            if (!resolveChain.includes(c.href)) resolveChain.push(c.href);
            lastValidUrl = c.href;
          } else if (c.href) {
            // Non-http redirect detected, abort by throwing
            logger.debug('http', `Skipping non-http redirect: ${c.href}`);
            throw new Error(`NON_HTTP_REDIRECT:${lastValidUrl}`);
          }
        },
      });

      const finalUrl = res.request?.res?.responseUrl || shortUrl;
      if (finalUrl !== shortUrl && !resolveChain.includes(finalUrl)) resolveChain.push(finalUrl);

      // Check if blocked
      const isBlocked = res.status === 403 || res.status === 429 ||
        finalUrl.includes('/login') || finalUrl.includes('login.php') ||
        (res.status >= 400 && res.status < 500);

      return {
        original: shortUrl,
        resolved: finalUrl,
        redirectChain: resolveChain,
        changed: finalUrl !== shortUrl,
        error: isBlocked && !useFallback ? 'blocked' : undefined,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      
      // Handle non-http redirect - return last valid URL
      if (errMsg.startsWith('NON_HTTP_REDIRECT:')) {
        const validUrl = errMsg.replace('NON_HTTP_REDIRECT:', '');
        return {
          original: shortUrl,
          resolved: validUrl,
          redirectChain: resolveChain,
          changed: validUrl !== shortUrl,
        };
      }
      
      // Handle "Unsupported protocol" error - return last valid URL from chain
      if (errMsg.includes('Unsupported protocol')) {
        const validUrl = resolveChain.filter(u => u.startsWith('http')).pop() || shortUrl;
        logger.debug('http', `Non-http protocol redirect, using last valid: ${validUrl}`);
        return {
          original: shortUrl,
          resolved: validUrl,
          redirectChain: resolveChain,
          changed: validUrl !== shortUrl,
        };
      }
      
      return {
        original: shortUrl,
        resolved: shortUrl,
        redirectChain: resolveChain,
        changed: false,
        error: errMsg,
      };
    }
  };

  // Try Desktop UA first
  const result = await tryResolve(false);

  // If blocked and platform has App UA, retry
  if (result.error === 'blocked' && platform && UA_APPS[platform]) {
    logger.debug('http', `Retrying with ${platform} app UA...`);
    return await tryResolve(true);
  }

  // If login redirect, log warning
  if (result.resolved.includes('/login') || result.resolved.includes('login.php')) {
    logger.debug('http', 'Login redirect detected');
  }

  return result;
}

// Alias for backward compatibility
export const httpResolveWithFallback = httpResolveUrl;

// ═══════════════════════════════════════════════════════════════════════════════
// POOL STATS (for monitoring/debugging)
// ═══════════════════════════════════════════════════════════════════════════════

export function getPoolStats() {
  return {
    http: {
      sockets: Object.keys(httpAgent.sockets).length,
      freeSockets: Object.keys(httpAgent.freeSockets).length,
      requests: Object.keys(httpAgent.requests).length,
    },
    https: {
      sockets: Object.keys(httpsAgent.sockets).length,
      freeSockets: Object.keys(httpsAgent.freeSockets).length,
      requests: Object.keys(httpsAgent.requests).length,
    },
    config: POOL_CONFIG,
  };
}
