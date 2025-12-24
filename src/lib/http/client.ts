/**
 * HTTP Client Module
 * 
 * Contains HTTP client functions: httpGet, httpPost, httpHead, httpResolveUrl.
 * All exports use the `http` prefix for consistency.
 * 
 * @module http/client
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { logger } from '@/core';
import type { PlatformId } from '@/lib/types';
import {
  httpGetUserAgentAsync,
  getReferer,
  getOrigin,
  BROWSER_HEADERS,
  API_HEADERS,
} from './headers';

// Re-export PlatformId for backward compatibility
export type { PlatformId } from '@/lib/types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface HttpOptions extends Omit<AxiosRequestConfig, 'url' | 'method'> {
  platform?: PlatformId;
  cookie?: string;
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
// AXIOS CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

const client: AxiosInstance = axios.create({
  timeout: 15000,
  maxRedirects: 10,
  validateStatus: (status) => status < 500,
  headers: BROWSER_HEADERS,
});

client.interceptors.response.use(
  (response) => {
    const finalUrl = response.request?.res?.responseUrl || response.config.url;
    if (finalUrl && finalUrl !== response.config.url) {
      logger.debug('http', `Redirect: ${response.config.url} → ${finalUrl}`);
    }
    return response;
  },
  (error: AxiosError) => {
    if (error.code === 'ECONNABORTED') {
      logger.warn('http', `Timeout: ${error.config?.url}`);
    }
    return Promise.reject(error);
  }
);

export { client as axiosClient };


// ═══════════════════════════════════════════════════════════════════════════════
// HTTP METHODS
// ═══════════════════════════════════════════════════════════════════════════════

/** Perform an HTTP GET request */
export async function httpGet(url: string, options?: HttpOptions): Promise<HttpResponse> {
  const { platform, cookie, headers: extraHeaders, ...rest } = options || {};
  const userAgent = await httpGetUserAgentAsync(platform);

  const headers: Record<string, string> = {
    ...BROWSER_HEADERS,
    'User-Agent': userAgent,
  };

  if (platform) {
    headers['Referer'] = getReferer(platform);
    headers['Origin'] = getOrigin(platform);
  }
  if (cookie) headers['Cookie'] = cookie;
  if (extraHeaders) Object.assign(headers, extraHeaders);

  const response = await client.get(url, { headers, ...rest });
  const finalUrl = response.request?.res?.responseUrl || url;

  return {
    data: response.data,
    status: response.status,
    headers: response.headers as Record<string, string>,
    finalUrl,
    redirected: finalUrl !== url,
  };
}

/** Perform an HTTP POST request */
export async function httpPost<T = unknown>(
  url: string,
  body?: unknown,
  options?: HttpOptions
): Promise<HttpResponse<T>> {
  const { platform, cookie, headers: extraHeaders, ...rest } = options || {};
  const userAgent = await httpGetUserAgentAsync(platform);

  const headers: Record<string, string> = {
    ...API_HEADERS,
    'User-Agent': userAgent,
    'Content-Type': 'application/json',
  };

  if (platform) {
    headers['Referer'] = getReferer(platform);
    headers['Origin'] = getOrigin(platform);
  }
  if (cookie) headers['Cookie'] = cookie;
  if (extraHeaders) Object.assign(headers, extraHeaders);

  const response = await client.post(url, body, { headers, ...rest });
  const finalUrl = response.request?.res?.responseUrl || url;

  return {
    data: response.data as T,
    status: response.status,
    headers: response.headers as Record<string, string>,
    finalUrl,
    redirected: finalUrl !== url,
  };
}

/** Perform an HTTP HEAD request */
export async function httpHead(url: string, options?: HttpOptions): Promise<HttpResponse<null>> {
  const { platform, cookie, headers: extraHeaders, ...rest } = options || {};
  const userAgent = await httpGetUserAgentAsync(platform);

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept': '*/*',
  };

  if (cookie) headers['Cookie'] = cookie;
  if (extraHeaders) Object.assign(headers, extraHeaders);

  const response = await client.head(url, { headers, ...rest });
  const finalUrl = response.request?.res?.responseUrl || url;

  return {
    data: null,
    status: response.status,
    headers: response.headers as Record<string, string>,
    finalUrl,
    redirected: finalUrl !== url,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// URL RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Resolve a short URL to its final destination */
export async function httpResolveUrl(
  shortUrl: string,
  options?: { timeout?: number; maxRedirects?: number; cookie?: string }
): Promise<ResolveResult> {
  const { timeout = 5000, maxRedirects = 10, cookie } = options || {};

  const doResolve = async (useCookie: boolean): Promise<ResolveResult> => {
    const resolveChain: string[] = [shortUrl];
    try {
      const headers: Record<string, string> = { ...BROWSER_HEADERS };
      if (useCookie && cookie) {
        headers['Cookie'] = cookie;
      }

      const response = await axios.get(shortUrl, {
        timeout,
        maxRedirects,
        headers,
        validateStatus: () => true,
        beforeRedirect: (config) => {
          if (config.href) resolveChain.push(config.href);
        },
      });

      const finalUrl = response.request?.res?.responseUrl || shortUrl;
      if (finalUrl !== shortUrl && !resolveChain.includes(finalUrl)) {
        resolveChain.push(finalUrl);
      }

      return {
        original: shortUrl,
        resolved: finalUrl,
        redirectChain: resolveChain,
        changed: finalUrl !== shortUrl,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        original: shortUrl,
        resolved: shortUrl,
        redirectChain: resolveChain,
        changed: false,
        error: message,
      };
    }
  };

  // First try: without cookie (guest mode - save cookies)
  const firstResult = await doResolve(false);
  
  // Check if resolved to login page - retry with cookie
  if (cookie && firstResult.resolved.includes('/login')) {
    console.log(`[httpResolveUrl] Detected login redirect, retrying with cookie...`);
    const retryResult = await doResolve(true);
    console.log(`[httpResolveUrl] Retry result: ${retryResult.resolved}`);
    return retryResult;
  }

  return firstResult;
}
