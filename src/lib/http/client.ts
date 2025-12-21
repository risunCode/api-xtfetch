/**
 * Unified HTTP Client (Axios-based)
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { type PlatformId, getReferer, getOrigin } from '@/core/config';
import { logger } from '@/core';

// ═══════════════════════════════════════════════════════════════
// USER AGENTS
// ═══════════════════════════════════════════════════════════════

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
export const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let uaPoolCache: { data: Array<{ platform: string; user_agent: string; device_type: string; enabled: boolean; last_used_at: string | null }>; loadedAt: number } | null = null;
const DEFAULT_UA_CACHE_TTL = 5 * 60 * 1000;

async function getUaCacheTTL(): Promise<number> {
  try {
    const { getCacheTtlUseragents } = await import('@/lib/services/helper/system-config');
    return getCacheTtlUseragents();
  } catch {
    return DEFAULT_UA_CACHE_TTL;
  }
}

async function loadUserAgentPool(): Promise<typeof uaPoolCache> {
  const cacheTTL = await getUaCacheTTL();
  if (uaPoolCache && Date.now() - uaPoolCache.loadedAt < cacheTTL) {
    return uaPoolCache;
  }

  try {
    const { supabase } = await import('@/core/database');
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('useragent_pool')
      .select('platform, user_agent, device_type, enabled, last_used_at')
      .eq('enabled', true)
      .order('last_used_at', { ascending: true, nullsFirst: true });

    if (error || !data) return null;
    uaPoolCache = { data, loadedAt: Date.now() };
    return uaPoolCache;
  } catch {
    return null;
  }
}

async function markUserAgentUsed(userAgent: string): Promise<void> {
  try {
    const { supabase } = await import('@/core/database');
    if (!supabase) return;
    await supabase.rpc('increment_ua_use_count', { ua_string: userAgent });
  } catch { /* ignore */ }
}

export async function getUserAgentAsync(platform?: PlatformId, deviceType?: 'desktop' | 'mobile'): Promise<string> {
  const pool = await loadUserAgentPool();
  
  if (pool?.data && pool.data.length > 0) {
    let candidates = pool.data.filter(ua => ua.platform === platform || ua.platform === 'all');
    if (deviceType) {
      const filtered = candidates.filter(ua => ua.device_type === deviceType);
      if (filtered.length > 0) candidates = filtered;
    }
    if (!deviceType && platform) {
      if (platform === 'tiktok') {
        const mobile = candidates.filter(ua => ua.device_type === 'mobile');
        if (mobile.length > 0) candidates = mobile;
      } else if (platform === 'weibo') {
        const desktop = candidates.filter(ua => ua.device_type === 'desktop');
        if (desktop.length > 0) candidates = desktop;
      }
    }
    if (candidates.length > 0) {
      const selected = candidates[0];
      markUserAgentUsed(selected.user_agent).catch(() => {});
      return selected.user_agent;
    }
  }
  return getUserAgent(platform);
}

export function getUserAgent(platform?: PlatformId): string {
  switch (platform) {
    case 'weibo': return DESKTOP_USER_AGENT;
    case 'tiktok': return MOBILE_USER_AGENT;
    default: return USER_AGENT;
  }
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT HEADERS
// ═══════════════════════════════════════════════════════════════

export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'max-age=0',
  'DNT': '1',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

export const API_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  'Accept': 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const DESKTOP_HEADERS: Record<string, string> = {
  'User-Agent': DESKTOP_USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'max-age=0',
};

export const FACEBOOK_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'max-age=0',
  'DNT': '1',
  'Referer': 'https://www.facebook.com/',
  'Origin': 'https://www.facebook.com',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

export const INSTAGRAM_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-IG-App-ID': '936619743392459',
  'X-Requested-With': 'XMLHttpRequest',
};

export const TIKTOK_HEADERS: Record<string, string> = {
  'User-Agent': MOBILE_USER_AGENT,
  'Accept': 'application/json',
  'Referer': 'https://tikwm.com/',
};

// ═══════════════════════════════════════════════════════════════
// AXIOS CLIENT
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// HTTP METHODS
// ═══════════════════════════════════════════════════════════════

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

export async function httpGet(url: string, options?: HttpOptions): Promise<HttpResponse> {
  const { platform, cookie, headers: extraHeaders, ...rest } = options || {};
  const userAgent = await getUserAgentAsync(platform);

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

export async function httpPost<T = unknown>(
  url: string,
  body?: unknown,
  options?: HttpOptions
): Promise<HttpResponse<T>> {
  const { platform, cookie, headers: extraHeaders, ...rest } = options || {};
  const userAgent = await getUserAgentAsync(platform);

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

export async function httpHead(url: string, options?: HttpOptions): Promise<HttpResponse<null>> {
  const { platform, cookie, headers: extraHeaders, ...rest } = options || {};
  const userAgent = await getUserAgentAsync(platform);

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

// ═══════════════════════════════════════════════════════════════
// URL RESOLUTION
// ═══════════════════════════════════════════════════════════════

export interface ResolveResult {
  original: string;
  resolved: string;
  redirectChain: string[];
  changed: boolean;
  error?: string;
}

export async function resolveUrl(
  shortUrl: string,
  options?: { timeout?: number; maxRedirects?: number }
): Promise<ResolveResult> {
  const { timeout = 5000, maxRedirects = 10 } = options || {};
  const chain: string[] = [shortUrl];

  try {
    const response = await axios.get(shortUrl, {
      timeout,
      maxRedirects,
      headers: BROWSER_HEADERS,
      validateStatus: () => true,
      beforeRedirect: (config) => {
        if (config.href) chain.push(config.href);
      },
    });

    const finalUrl = response.request?.res?.responseUrl || shortUrl;
    if (finalUrl !== shortUrl && !chain.includes(finalUrl)) {
      chain.push(finalUrl);
    }

    return {
      original: shortUrl,
      resolved: finalUrl,
      redirectChain: chain,
      changed: finalUrl !== shortUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      original: shortUrl,
      resolved: shortUrl,
      redirectChain: chain,
      changed: false,
      error: message,
    };
  }
}

export { client as axiosClient };

// ═══════════════════════════════════════════════════════════════
// HEADER BUILDERS
// ═══════════════════════════════════════════════════════════════

export function getApiHeaders(platform?: PlatformId, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...API_HEADERS, 'User-Agent': getUserAgent(platform) };
  if (platform) { h['Referer'] = getReferer(platform); h['Origin'] = getOrigin(platform); }
  return extra ? { ...h, ...extra } : h;
}

export async function getApiHeadersAsync(platform?: PlatformId, extra?: Record<string, string>): Promise<Record<string, string>> {
  const ua = await getUserAgentAsync(platform);
  const h: Record<string, string> = { ...API_HEADERS, 'User-Agent': ua };
  if (platform) { h['Referer'] = getReferer(platform); h['Origin'] = getOrigin(platform); }
  return extra ? { ...h, ...extra } : h;
}

export function getBrowserHeaders(platform?: PlatformId, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...BROWSER_HEADERS, 'User-Agent': getUserAgent(platform) };
  if (platform) h['Referer'] = getReferer(platform);
  return extra ? { ...h, ...extra } : h;
}

export async function getBrowserHeadersAsync(platform?: PlatformId, extra?: Record<string, string>): Promise<Record<string, string>> {
  const ua = await getUserAgentAsync(platform);
  const h: Record<string, string> = { ...BROWSER_HEADERS, 'User-Agent': ua };
  if (platform) h['Referer'] = getReferer(platform);
  return extra ? { ...h, ...extra } : h;
}

export function getSecureHeaders(platform?: PlatformId, cookie?: string): Record<string, string> {
  const h = getBrowserHeaders(platform);
  if (cookie) h['Cookie'] = cookie;
  return h;
}

export async function getSecureHeadersAsync(platform?: PlatformId, cookie?: string): Promise<Record<string, string>> {
  const h = await getBrowserHeadersAsync(platform);
  if (cookie) h['Cookie'] = cookie;
  return h;
}
