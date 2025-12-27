/**
 * HTTP Headers & Browser Profiles Module
 * 
 * Contains user agents, default headers, browser profiles, and anti-ban system.
 * All exports use the `http` prefix for consistency.
 * 
 * @module http/headers
 */

import type { PlatformId } from '@/lib/types';

// Re-export PlatformId for backward compatibility
export type { PlatformId } from '@/lib/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM URL MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════════

const PLATFORM_REFERERS: Record<PlatformId, string> = {
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  twitter: 'https://twitter.com/',
  tiktok: 'https://www.tiktok.com/',
  weibo: 'https://weibo.com/',
  youtube: 'https://www.youtube.com/',
};

const PLATFORM_ORIGINS: Record<PlatformId, string> = {
  facebook: 'https://www.facebook.com',
  instagram: 'https://www.instagram.com',
  twitter: 'https://twitter.com',
  tiktok: 'https://www.tiktok.com',
  weibo: 'https://weibo.com',
  youtube: 'https://www.youtube.com',
};

export function getReferer(platform: PlatformId): string {
  return PLATFORM_REFERERS[platform] || '';
}

export function getOrigin(platform: PlatformId): string {
  return PLATFORM_ORIGINS[platform] || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER AGENTS
// ═══════════════════════════════════════════════════════════════════════════════

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
export const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
export const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

let uaPoolCache: { data: Array<{ platform: string; user_agent: string; device_type: string; enabled: boolean; last_used_at: string | null }>; loadedAt: number } | null = null;
const DEFAULT_UA_CACHE_TTL = 5 * 60 * 1000;

async function getUaCacheTTL(): Promise<number> {
  try {
    const { sysConfigCacheTtlUseragents } = await import('@/lib/config');
    return sysConfigCacheTtlUseragents();
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

/** Get user agent string asynchronously with database pool rotation */
export async function httpGetUserAgentAsync(platform?: PlatformId, deviceType?: 'desktop' | 'mobile'): Promise<string> {
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
  return httpGetUserAgent(platform);
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER AGENT CACHING (Sync)
// ═══════════════════════════════════════════════════════════════════════════════

const userAgentCache = new Map<string, { ua: string; expires: number }>();
const UA_SYNC_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Get user agent string synchronously with caching (uses fallback values) */
export function httpGetUserAgent(platform?: PlatformId): string {
  const key = platform || 'default';
  const cached = userAgentCache.get(key);
  
  if (cached && cached.expires > Date.now()) {
    return cached.ua;
  }
  
  // Generate user agent based on platform
  let ua: string;
  switch (platform) {
    case 'weibo': ua = DESKTOP_USER_AGENT; break;
    case 'tiktok': ua = MOBILE_USER_AGENT; break;
    default: ua = USER_AGENT;
  }
  
  userAgentCache.set(key, { ua, expires: Date.now() + UA_SYNC_CACHE_TTL });
  return ua;
}

/** Clear the user agent cache */
export function httpClearUserAgentCache(): void {
  userAgentCache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT HEADERS
// ═══════════════════════════════════════════════════════════════════════════════

export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'max-age=0',
  'DNT': '1',
  'Sec-Ch-Ua': '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
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
  'Referer': 'https://web.facebook.com/',
  'Origin': 'https://web.facebook.com',
  'Sec-Ch-Ua': '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
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


// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER PROFILES (Anti-Ban System)
// ═══════════════════════════════════════════════════════════════════════════════

export interface BrowserProfile {
  id: string;
  platform: string;
  label: string;
  user_agent: string;
  sec_ch_ua: string | null;
  sec_ch_ua_platform: string | null;
  sec_ch_ua_mobile: string;
  accept_language: string;
  browser: string;
  device_type: string;
  os: string | null;
  is_chromium: boolean;
  priority: number;
}

export const FALLBACK_PROFILES: BrowserProfile[] = [
  {
    id: 'fallback-chrome-win',
    platform: 'all',
    label: 'Chrome 143 Windows',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    sec_ch_ua: '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
    sec_ch_ua_platform: '"Windows"',
    sec_ch_ua_mobile: '?0',
    accept_language: 'en-US,en;q=0.9',
    browser: 'chrome',
    device_type: 'desktop',
    os: 'windows',
    is_chromium: true,
    priority: 10,
  },
  {
    id: 'fallback-chrome-mac',
    platform: 'all',
    label: 'Chrome 143 macOS',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    sec_ch_ua: '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
    sec_ch_ua_platform: '"macOS"',
    sec_ch_ua_mobile: '?0',
    accept_language: 'en-US,en;q=0.9',
    browser: 'chrome',
    device_type: 'desktop',
    os: 'macos',
    is_chromium: true,
    priority: 10,
  },
];

let profilesCache: { data: BrowserProfile[]; loadedAt: number } | null = null;
const PROFILE_CACHE_TTL = 5 * 60 * 1000;
let lastProfileId: string | null = null;

async function loadProfilesFromDB(): Promise<BrowserProfile[]> {
  try {
    const { supabase } = await import('@/core/database');
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('browser_profiles')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false })
      .order('last_used_at', { ascending: true, nullsFirst: true });

    if (error || !data) return [];
    return data as BrowserProfile[];
  } catch {
    return [];
  }
}

async function getProfiles(): Promise<BrowserProfile[]> {
  if (profilesCache && Date.now() - profilesCache.loadedAt < PROFILE_CACHE_TTL) {
    return profilesCache.data;
  }
  const dbProfiles = await loadProfilesFromDB();
  if (dbProfiles.length > 0) {
    profilesCache = { data: dbProfiles, loadedAt: Date.now() };
    return dbProfiles;
  }
  return FALLBACK_PROFILES;
}

function filterByPlatform(profiles: BrowserProfile[], platform?: PlatformId, chromiumOnly?: boolean): BrowserProfile[] {
  let filtered = profiles;
  if (platform) {
    const specific = profiles.filter(p => p.platform === platform);
    filtered = specific.length > 0 ? specific : profiles.filter(p => p.platform === 'all');
  } else {
    filtered = profiles.filter(p => p.platform === 'all');
  }
  if (chromiumOnly) {
    const chromium = filtered.filter(p => p.is_chromium);
    if (chromium.length > 0) filtered = chromium;
  }
  return filtered;
}

function selectWeightedRandom(profiles: BrowserProfile[]): BrowserProfile {
  // profiles will never be empty - getProfiles() guarantees FALLBACK_PROFILES as minimum
  if (profiles.length === 1) return profiles[0];

  const available = profiles.filter(p => p.id !== lastProfileId);
  const pool = available.length > 0 ? available : profiles;

  const totalWeight = pool.reduce((sum, p) => sum + (p.priority || 1), 0);
  let random = Math.random() * totalWeight;

  for (const profile of pool) {
    random -= (profile.priority || 1);
    if (random <= 0) {
      lastProfileId = profile.id;
      return profile;
    }
  }

  lastProfileId = pool[0].id;
  return pool[0];
}


// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE MANAGEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a random browser profile asynchronously with database rotation */
export async function httpGetRandomProfileAsync(options?: {
  platform?: PlatformId;
  chromiumOnly?: boolean;
}): Promise<BrowserProfile> {
  const profiles = await getProfiles();
  const filtered = filterByPlatform(profiles, options?.platform, options?.chromiumOnly);
  return selectWeightedRandom(filtered);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER PROFILE CACHING (Sync)
// ═══════════════════════════════════════════════════════════════════════════════

const syncProfileCache = new Map<string, { profile: BrowserProfile; expires: number }>();
const SYNC_PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Get a random browser profile synchronously with caching (uses cached/fallback values) */
export function httpGetRandomProfile(chromiumOnly = false): BrowserProfile {
  const cacheKey = chromiumOnly ? 'chromium' : 'all';
  const cached = syncProfileCache.get(cacheKey);
  
  if (cached && cached.expires > Date.now()) {
    return cached.profile;
  }
  
  // Use DB cache if available, otherwise fallback
  const profiles = profilesCache?.data || FALLBACK_PROFILES;
  const filtered = chromiumOnly ? profiles.filter(p => p.is_chromium) : profiles;
  // filtered will have at least FALLBACK_PROFILES which has chromium profiles
  const profile = selectWeightedRandom(filtered);
  
  syncProfileCache.set(cacheKey, { profile, expires: Date.now() + SYNC_PROFILE_CACHE_TTL });
  return profile;
}

/** Clear the synchronous profile cache */
export function httpClearSyncProfileCache(): void {
  syncProfileCache.clear();
}

/** Mark a browser profile as used (updates last_used_at in database) */
export async function httpMarkProfileUsed(profileId: string): Promise<void> {
  try {
    const { supabase } = await import('@/core/database');
    if (!supabase) return;
    await supabase.rpc('increment_profile_use', { profile_id: profileId });
  } catch { /* ignore */ }
}

/** Mark a browser profile as successful */
export async function httpMarkProfileSuccess(profileId: string): Promise<void> {
  try {
    const { supabase } = await import('@/core/database');
    if (!supabase) return;
    await supabase.rpc('mark_profile_success', { profile_id: profileId });
  } catch { /* ignore */ }
}

/** Mark a browser profile as having an error */
export async function httpMarkProfileError(profileId: string, error: string): Promise<void> {
  try {
    const { supabase } = await import('@/core/database');
    if (!supabase) return;
    await supabase.rpc('mark_profile_error', { profile_id: profileId, error_msg: error });
  } catch { /* ignore */ }
}

/** Clear the browser profiles cache (both async and sync) */
export function httpClearProfileCache(): void {
  profilesCache = null;
  syncProfileCache.clear();
}

/** Preload browser profiles into cache */
export async function httpPreloadProfiles(): Promise<void> {
  await getProfiles();
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING & THROTTLING
// ═══════════════════════════════════════════════════════════════════════════════

interface RateLimitState {
  lastRequest: number;
  requestCount: number;
  cooldownUntil: number;
}

const rateLimitStates = new Map<string, RateLimitState>();

/** Check if requests to a platform should be throttled */
export function httpShouldThrottle(platform: string): boolean {
  const state = rateLimitStates.get(platform);
  if (!state) return false;
  if (Date.now() < state.cooldownUntil) return true;
  if (state.cooldownUntil > 0 && Date.now() >= state.cooldownUntil) {
    state.cooldownUntil = 0;
    state.requestCount = 0;
  }
  return false;
}

/** Track a request to a platform for rate limiting */
export function httpTrackRequest(platform: string): void {
  let state = rateLimitStates.get(platform);
  if (!state) {
    state = { lastRequest: 0, requestCount: 0, cooldownUntil: 0 };
    rateLimitStates.set(platform, state);
  }
  const now = Date.now();
  if (now - state.lastRequest > 60000) state.requestCount = 0;
  state.lastRequest = now;
  state.requestCount++;
  if (state.requestCount > 30) {
    state.cooldownUntil = now + 30000;
    state.requestCount = 0;
  }
}

/** Mark a platform as rate limited (triggers exponential backoff) */
export function httpMarkRateLimited(platform: string): void {
  let state = rateLimitStates.get(platform);
  if (!state) {
    state = { lastRequest: Date.now(), requestCount: 0, cooldownUntil: 0 };
    rateLimitStates.set(platform, state);
  }
  const backoff = Math.min(120000, 30000 * Math.pow(2, Math.floor(state.requestCount / 10)));
  state.cooldownUntil = Date.now() + backoff;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELAY UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a random delay value in milliseconds */
export function httpGetRandomDelay(min = 500, max = 2000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Sleep for a random duration */
export async function httpRandomSleep(min = 500, max = 2000): Promise<void> {
  const delay = httpGetRandomDelay(min, max);
  await new Promise(resolve => setTimeout(resolve, delay));
}


// ═══════════════════════════════════════════════════════════════════════════════
// ROTATING HEADERS (Anti-Ban)
// ═══════════════════════════════════════════════════════════════════════════════

interface RotatingHeadersOptions {
  platform?: PlatformId;
  cookie?: string;
  includeReferer?: boolean;
  chromiumOnly?: boolean;
}

/** Get rotating headers asynchronously with database profile rotation */
export async function httpGetRotatingHeadersAsync(options: RotatingHeadersOptions = {}): Promise<Record<string, string>> {
  const { platform, cookie, includeReferer = true, chromiumOnly = false } = options;
  const useChromium = chromiumOnly || platform === 'facebook' || platform === 'instagram';
  const profile = await httpGetRandomProfileAsync({ platform, chromiumOnly: useChromium });

  const headers: Record<string, string> = {
    'User-Agent': profile.user_agent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': profile.accept_language,
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'DNT': '1',
    'Upgrade-Insecure-Requests': '1',
  };

  if (profile.sec_ch_ua) {
    headers['Sec-Ch-Ua'] = profile.sec_ch_ua;
    headers['Sec-Ch-Ua-Mobile'] = profile.sec_ch_ua_mobile || '?0';
    headers['Sec-Ch-Ua-Platform'] = profile.sec_ch_ua_platform || '';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-User'] = '?1';
  }

  if (platform === 'facebook' && includeReferer) {
    headers['Referer'] = 'https://www.facebook.com/';
    headers['Origin'] = 'https://www.facebook.com';
    headers['Sec-Fetch-Site'] = 'same-origin';
  } else if (platform === 'instagram' && includeReferer) {
    headers['Referer'] = 'https://www.instagram.com/';
    headers['Origin'] = 'https://www.instagram.com';
    headers['Sec-Fetch-Site'] = 'same-origin';
  } else if (profile.sec_ch_ua) {
    headers['Sec-Fetch-Site'] = 'none';
  }

  if (cookie) headers['Cookie'] = cookie;

  if (!profile.id.startsWith('fallback-')) {
    httpMarkProfileUsed(profile.id).catch(() => {});
  }

  return headers;
}

/** Get rotating headers synchronously (uses cached/fallback profiles) */
export function httpGetRotatingHeaders(options: RotatingHeadersOptions = {}): Record<string, string> {
  const { platform, cookie, includeReferer = true, chromiumOnly = false } = options;
  const useChromium = chromiumOnly || platform === 'facebook' || platform === 'instagram';
  const profile = httpGetRandomProfile(useChromium);

  const headers: Record<string, string> = {
    'User-Agent': profile.user_agent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': profile.accept_language,
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'DNT': '1',
    'Upgrade-Insecure-Requests': '1',
  };

  if (profile.sec_ch_ua) {
    headers['Sec-Ch-Ua'] = profile.sec_ch_ua;
    headers['Sec-Ch-Ua-Mobile'] = profile.sec_ch_ua_mobile || '?0';
    headers['Sec-Ch-Ua-Platform'] = profile.sec_ch_ua_platform || '';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-User'] = '?1';
  }

  if (platform === 'facebook' && includeReferer) {
    headers['Referer'] = 'https://www.facebook.com/';
    headers['Origin'] = 'https://www.facebook.com';
    headers['Sec-Fetch-Site'] = 'same-origin';
  } else if (platform === 'instagram' && includeReferer) {
    headers['Referer'] = 'https://www.instagram.com/';
    headers['Origin'] = 'https://www.instagram.com';
    headers['Sec-Fetch-Site'] = 'same-origin';
  } else if (profile.sec_ch_ua) {
    headers['Sec-Fetch-Site'] = 'none';
  }

  if (cookie) headers['Cookie'] = cookie;
  return headers;
}


// ═══════════════════════════════════════════════════════════════════════════════
// HEADER BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get API headers synchronously */
export function httpGetApiHeaders(platform?: PlatformId, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...API_HEADERS, 'User-Agent': httpGetUserAgent(platform) };
  if (platform) { h['Referer'] = getReferer(platform); h['Origin'] = getOrigin(platform); }
  return extra ? { ...h, ...extra } : h;
}

/** Get API headers asynchronously with database user agent rotation */
export async function httpGetApiHeadersAsync(platform?: PlatformId, extra?: Record<string, string>): Promise<Record<string, string>> {
  const ua = await httpGetUserAgentAsync(platform);
  const h: Record<string, string> = { ...API_HEADERS, 'User-Agent': ua };
  if (platform) { h['Referer'] = getReferer(platform); h['Origin'] = getOrigin(platform); }
  return extra ? { ...h, ...extra } : h;
}

/** Get browser headers synchronously */
export function httpGetBrowserHeaders(platform?: PlatformId, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...BROWSER_HEADERS, 'User-Agent': httpGetUserAgent(platform) };
  if (platform) h['Referer'] = getReferer(platform);
  return extra ? { ...h, ...extra } : h;
}

/** Get browser headers asynchronously with database user agent rotation */
export async function httpGetBrowserHeadersAsync(platform?: PlatformId, extra?: Record<string, string>): Promise<Record<string, string>> {
  const ua = await httpGetUserAgentAsync(platform);
  const h: Record<string, string> = { ...BROWSER_HEADERS, 'User-Agent': ua };
  if (platform) h['Referer'] = getReferer(platform);
  return extra ? { ...h, ...extra } : h;
}

/** Get secure headers with optional cookie synchronously */
export function httpGetSecureHeaders(platform?: PlatformId, cookie?: string): Record<string, string> {
  const h = httpGetBrowserHeaders(platform);
  if (cookie) h['Cookie'] = cookie;
  return h;
}

/** Get secure headers with optional cookie asynchronously */
export async function httpGetSecureHeadersAsync(platform?: PlatformId, cookie?: string): Promise<Record<string, string>> {
  const h = await httpGetBrowserHeadersAsync(platform);
  if (cookie) h['Cookie'] = cookie;
  return h;
}
