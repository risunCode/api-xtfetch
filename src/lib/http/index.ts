/**
 * HTTP Module - Barrel Export
 * 
 * Re-exports all HTTP functionality from submodules.
 * 
 * @module http
 */

// ═══════════════════════════════════════════════════════════════════════════════
// HEADERS MODULE
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Types
  type BrowserProfile,
  
  // User Agents
  USER_AGENT,
  DESKTOP_USER_AGENT,
  MOBILE_USER_AGENT,
  httpGetUserAgent,
  httpGetUserAgentAsync,
  
  // Default Headers
  BROWSER_HEADERS,
  API_HEADERS,
  DESKTOP_HEADERS,
  FACEBOOK_HEADERS,
  INSTAGRAM_HEADERS,
  TIKTOK_HEADERS,
  
  // Browser Profiles
  FALLBACK_PROFILES,
  httpGetRandomProfile,
  httpGetRandomProfileAsync,
  httpMarkProfileUsed,
  httpMarkProfileSuccess,
  httpMarkProfileError,
  httpClearProfileCache,
  httpPreloadProfiles,
  
  // Rate Limiting
  httpShouldThrottle,
  httpTrackRequest,
  httpMarkRateLimited,
  
  // Delay Utilities
  httpGetRandomDelay,
  httpRandomSleep,
  
  // Rotating Headers
  httpGetRotatingHeaders,
  httpGetRotatingHeadersAsync,
  
  // Header Builders
  httpGetApiHeaders,
  httpGetApiHeadersAsync,
  httpGetBrowserHeaders,
  httpGetBrowserHeadersAsync,
  httpGetSecureHeaders,
  httpGetSecureHeadersAsync,
  
  // Internal helpers (exported for client.ts)
  getReferer,
  getOrigin,
} from './headers';

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT MODULE
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Types
  type HttpOptions,
  type HttpResponse,
  type ResolveResult,
  
  // Axios Client
  axiosClient,
  
  // HTTP Methods
  httpGet,
  httpPost,
  httpHead,
  
  // URL Resolution
  httpResolveUrl,
} from './client';

// ═══════════════════════════════════════════════════════════════════════════════
// BACKWARD COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export PlatformId for backward compatibility
export type { PlatformId } from '@/lib/types';
