/**
 * HTTP Module
 * 
 * @module http
 */

// Headers
export {
  UA_DESKTOP,
  UA_MOBILE,
  UA_APPS,
  UA_IPAD,
  UA_DESKTOP_POOL,
  getNextIpadUA,
  getNextDesktopUA,
  getPrimaryUA,
  PLATFORM_CONFIG,
  type PlatformHttpConfig,
  httpGetHeaders,
  httpGetApiHeaders,
  httpGetUserAgent,
  httpGetRandomDelay,
  httpRandomSleep,
  getReferer,
  getOrigin,
} from './headers';

// Client
export {
  type HttpGetOptions,
  type HttpPostOptions,
  type HttpHeadOptions,
  type HttpResponse,
  type ResolveResult,
  PLATFORM_TIMEOUTS,
  axiosClient,
  httpGet,
  httpPost,
  httpHead,
  httpResolveUrl,
  httpResolveWithFallback,
  getPoolStats,
} from './client';

// Types
export type { PlatformId } from '@/lib/types';
