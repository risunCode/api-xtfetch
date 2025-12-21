/**
 * HTTP Module - Centralized HTTP utilities
 */

export {
  httpGet, httpPost, httpHead,
  resolveUrl,
  axiosClient,
  USER_AGENT, DESKTOP_USER_AGENT, MOBILE_USER_AGENT,
  getUserAgent, getUserAgentAsync,
  BROWSER_HEADERS, API_HEADERS, DESKTOP_HEADERS,
  FACEBOOK_HEADERS, INSTAGRAM_HEADERS, TIKTOK_HEADERS,
  getApiHeaders, getApiHeadersAsync,
  getBrowserHeaders, getBrowserHeadersAsync,
  getSecureHeaders, getSecureHeadersAsync,
  type HttpOptions, type HttpResponse, type ResolveResult,
} from './client';

export {
  getRotatingHeaders, getRandomDelay, randomSleep,
  shouldThrottle, trackRequest, markRateLimited,
  getRandomProfile, FALLBACK_PROFILES,
  type BrowserProfile,
} from './anti-ban';

export { needsResolve, normalizeUrl as normalizeUrlPipeline } from '@/lib/url';

export {
  successResponse, errorResponse, missingUrlResponse, invalidUrlResponse,
  validateMediaUrl, filterValidUrls, decodeUrl, decodeHtml,
  isValidMediaUrl, isSmallImage, normalizeUrl, cleanTrackingParams,
  dedupeFormats, dedupeByQuality, getQualityLabel, getQualityFromBitrate, addFormat,
  extractByPatterns, extractVideos, extractMeta,
} from '@/lib/utils/http';

export type { ScraperResult, ScraperOptions, ScraperData, ScraperFn } from '@/core/scrapers/types';
export type { UnifiedEngagement as EngagementStats } from '@/lib/types';
