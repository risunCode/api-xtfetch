# XTFetch Caching Optimization Proposal

**Date:** December 23, 2024  
**Author:** Kiro  
**Status:** Draft  

---

## Executive Summary

Current caching implementation has several issues causing frequent cache misses and slow response times. This proposal outlines a comprehensive optimization strategy to improve hit rate from ~30% to 80%+ and reduce average response time by 60%.

---

## Current State Analysis

### Architecture
```
Request → prepareUrl() → runScraper() → getCache() → [miss] → scrape → setCache()
                              ↓
                         [hit] → return cached
```

### Problems Identified

| Issue | Impact | Severity |
|-------|--------|----------|
| **Cache key mismatch** | Same content, different URLs = cache miss | 🔴 High |
| **No pre-scrape cache check** | Cache checked inside scraper, after URL prep | 🔴 High |
| **Short URL not normalized before cache** | `fb.watch/xxx` vs resolved URL = miss | 🔴 High |
| **Duplicate content ID extraction** | Logic duplicated in `redis.ts` and `pipeline.ts` | 🟡 Medium |
| **No cache warming** | Popular content always cold | 🟡 Medium |
| **No hit/miss tracking** | Can't measure effectiveness | 🟡 Medium |
| **Fixed TTL per platform** | No content-type awareness | 🟢 Low |

### Current Flow Issues

```typescript
// PROBLEM 1: Cache key generated from raw URL, not content ID
// User A: https://twitter.com/user/status/123456
// User B: https://x.com/user/status/123456
// Same tweet, different cache keys = MISS!

// PROBLEM 2: Short URLs bypass cache
// fb.watch/abc → resolves to facebook.com/video/123
// Cache key uses resolved URL, but next request with fb.watch/abc
// generates different key before resolution = MISS!

// PROBLEM 3: Cache checked too late
// prepareUrl() runs (slow HTTP resolve) → then cache check
// Should check cache BEFORE expensive URL resolution
```

---

## Proposed Solution

### New Architecture

```
Request
    ↓
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: Quick Cache (Content ID based)                │
│  - Extract content ID from raw URL (no HTTP)            │
│  - Check cache by content ID                            │
│  - HIT? Return immediately                              │
└─────────────────────────────────────────────────────────┘
    ↓ MISS
┌─────────────────────────────────────────────────────────┐
│  LAYER 2: URL Resolution + Normalized Cache             │
│  - Resolve short URLs                                   │
│  - Check cache by normalized URL                        │
│  - HIT? Return + backfill Layer 1                       │
└─────────────────────────────────────────────────────────┘
    ↓ MISS
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Scraper Execution                             │
│  - Run platform scraper                                 │
│  - Store in both Layer 1 & 2                            │
└─────────────────────────────────────────────────────────┘
```

### Key Changes

#### 1. Unified Cache Key Strategy

```typescript
// NEW: Content-ID based cache key (primary)
// Same content ID = same cache, regardless of URL format

interface CacheKeyStrategy {
  // Primary: Content ID (fastest, most reliable)
  primary: `result:${platform}:${contentId}`;
  
  // Secondary: Normalized URL hash (fallback)
  secondary: `result:${platform}:url:${urlHash}`;
  
  // Alias: Short URL → Content ID mapping
  alias: `alias:${shortUrlHash}` → contentId;
}

// Example:
// twitter.com/user/status/123 → result:twitter:123
// x.com/user/status/123       → result:twitter:123 (SAME!)
// t.co/abc                    → alias:t.co/abc → 123 → result:twitter:123
```

#### 2. Pre-Resolution Cache Check

```typescript
// NEW: Check cache BEFORE expensive URL resolution
async function smartCache(rawUrl: string): Promise<CacheResult> {
  // Step 1: Try to extract content ID without HTTP
  const quickParse = parseUrlQuick(rawUrl);
  if (quickParse.contentId) {
    const cached = await redis.get(`result:${quickParse.platform}:${quickParse.contentId}`);
    if (cached) return { hit: true, data: cached, source: 'content-id' };
  }
  
  // Step 2: Check alias cache for short URLs
  if (isShortUrl(rawUrl)) {
    const aliasKey = `alias:${hashUrl(rawUrl)}`;
    const contentId = await redis.get(aliasKey);
    if (contentId) {
      const cached = await redis.get(`result:${quickParse.platform}:${contentId}`);
      if (cached) return { hit: true, data: cached, source: 'alias' };
    }
  }
  
  return { hit: false };
}
```

#### 3. Cache Statistics & Monitoring

```typescript
// NEW: Track hit/miss for optimization insights
interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  avgLatency: { hit: number; miss: number };
  byPlatform: Record<PlatformId, { hits: number; misses: number }>;
  bySource: { contentId: number; alias: number; urlHash: number };
}

// Stored in Redis
// stats:cache:hits → INCR on hit
// stats:cache:misses → INCR on miss
// stats:cache:platform:{platform}:hits → INCR
```

#### 4. Smart TTL by Content Type

```typescript
// NEW: Different TTL based on content volatility
const SMART_TTL: Record<PlatformId, Record<ContentType, number>> = {
  twitter: {
    post: 7 * 24 * 3600,      // 7 days (tweets rarely change)
    video: 7 * 24 * 3600,
  },
  instagram: {
    post: 3 * 24 * 3600,      // 3 days
    reel: 3 * 24 * 3600,
    story: 1 * 3600,          // 1 hour (stories expire in 24h)
  },
  tiktok: {
    video: 7 * 24 * 3600,     // 7 days
  },
  youtube: {
    video: 24 * 3600,         // 1 day (can be taken down)
    shorts: 24 * 3600,
  },
  facebook: {
    video: 3 * 24 * 3600,
    reel: 3 * 24 * 3600,
    story: 1 * 3600,          // 1 hour
    post: 3 * 24 * 3600,
  },
  weibo: {
    post: 3 * 24 * 3600,
  },
};
```

---

## Implementation Plan

### Phase 1: Foundation (Day 1-2)

**File: `api-xtfetch/src/lib/cache.ts`** (NEW - consolidated cache module)

```typescript
/**
 * Unified Cache Module
 * Replaces: lib/services/helper/cache.ts + redis.ts cache functions
 */

import { Redis } from '@upstash/redis';
import { PlatformId } from '@/lib/config';

// ============ TYPES ============
interface CacheConfig {
  ttl: Record<PlatformId, Record<string, number>>;
  statsEnabled: boolean;
  aliasEnabled: boolean;
}

interface CacheResult<T> {
  hit: boolean;
  data?: T;
  source?: 'content-id' | 'alias' | 'url-hash';
  latency?: number;
}

// ============ CONTENT ID EXTRACTORS ============
const CONTENT_ID_REGEX: Record<PlatformId, RegExp[]> = {
  twitter: [/status(?:es)?\/(\d+)/i],
  instagram: [/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i, /\/stories\/[^/]+\/(\d+)/i],
  facebook: [/\/(?:videos?|watch|reel)\/(\d+)/i, /[?&]v=(\d+)/i, /pfbid([A-Za-z0-9]+)/i],
  tiktok: [/\/video\/(\d+)/i],
  youtube: [/[?&]v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /\/shorts\/([a-zA-Z0-9_-]{11})/],
  weibo: [/\/(\d{16,})/, /\/(?:detail|status)\/(\d+)/i],
};

// ============ CORE FUNCTIONS ============
export function cacheExtractContentId(platform: PlatformId, url: string): string | null;
export function cacheGenerateKey(platform: PlatformId, contentId: string): string;
export function cacheGenerateAliasKey(url: string): string;

export async function cacheGet<T>(platform: PlatformId, url: string): Promise<CacheResult<T>>;
export async function cacheSet<T>(platform: PlatformId, url: string, contentId: string, data: T): Promise<void>;
export async function cacheGetStats(): Promise<CacheStats>;
export async function cacheClear(platform?: PlatformId): Promise<number>;
```

### Phase 2: Integration (Day 3-4)

**Update: `api-xtfetch/src/app/api/v1/publicservices/route.ts`**

```typescript
// BEFORE
const urlResult = await prepareUrl(url);
const result = await runScraper(urlResult.platform, urlResult.resolvedUrl, { cookie });

// AFTER
// Step 1: Quick cache check (no HTTP)
const quickCache = await cacheGetQuick(url);
if (quickCache.hit) {
  return NextResponse.json({ success: true, data: quickCache.data, cached: true });
}

// Step 2: URL resolution (only if cache miss)
const urlResult = await prepareUrl(url);

// Step 3: Check cache with resolved URL
const resolvedCache = await cacheGet(urlResult.platform, urlResult.resolvedUrl);
if (resolvedCache.hit) {
  // Backfill alias for short URL
  if (urlResult.wasResolved) {
    await cacheSetAlias(url, urlResult.platform, urlResult.contentId);
  }
  return NextResponse.json({ success: true, data: resolvedCache.data, cached: true });
}

// Step 4: Scrape (cache miss)
const result = await runScraper(urlResult.platform, urlResult.resolvedUrl, { cookie });
if (result.success) {
  await cacheSet(urlResult.platform, urlResult.resolvedUrl, urlResult.contentId, result);
}
```

### Phase 3: Scraper Updates (Day 5)

**Remove cache logic from individual scrapers:**

```typescript
// BEFORE (in each scraper)
export async function scrapeTwitter(url: string, options?: ScraperOptions): Promise<ScraperResult> {
  if (!skipCache) {
    const cached = await getCache<ScraperResult>('twitter', url);
    if (cached?.success) return { ...cached, cached: true };
  }
  // ... scrape logic ...
  setCache('twitter', url, result);
  return result;
}

// AFTER (cache handled at route level)
export async function scrapeTwitter(url: string, options?: ScraperOptions): Promise<ScraperResult> {
  // Pure scraping logic only - no cache handling
  // ... scrape logic ...
  return result;
}
```

### Phase 4: Monitoring Dashboard (Day 6-7)

**New Admin Endpoint: `GET /api/admin/cache/stats`**

```typescript
// Response
{
  "totalKeys": 1523,
  "hitRate": "78.5%",
  "avgLatency": { "hit": 12, "miss": 2340 },
  "byPlatform": {
    "twitter": { "keys": 450, "hits": 380, "misses": 70 },
    "instagram": { "keys": 320, "hits": 250, "misses": 70 },
    // ...
  },
  "topMissedUrls": [
    { "url": "fb.watch/xxx", "count": 15, "reason": "short-url-no-alias" },
    // ...
  ]
}
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/cache.ts` | CREATE | New unified cache module |
| `src/lib/redis.ts` | MODIFY | Remove cache functions (move to cache.ts) |
| `src/lib/services/helper/cache.ts` | DELETE | Replaced by lib/cache.ts |
| `src/app/api/v1/publicservices/route.ts` | MODIFY | Add pre-scrape cache check |
| `src/app/api/v1/route.ts` | MODIFY | Add pre-scrape cache check |
| `src/lib/services/twitter.ts` | MODIFY | Remove internal cache logic |
| `src/lib/services/instagram.ts` | MODIFY | Remove internal cache logic |
| `src/lib/services/facebook.ts` | MODIFY | Remove internal cache logic |
| `src/lib/services/tiktok.ts` | MODIFY | Remove internal cache logic |
| `src/lib/services/youtube.ts` | MODIFY | Remove internal cache logic |
| `src/lib/services/weibo.ts` | MODIFY | Remove internal cache logic |
| `src/app/api/admin/cache/route.ts` | CREATE | Cache stats endpoint |

---

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Cache Hit Rate | ~30% | 80%+ | +166% |
| Avg Response (cached) | N/A | 15ms | - |
| Avg Response (miss) | 2500ms | 2500ms | - |
| Avg Response (overall) | 2000ms | 500ms | -75% |
| Short URL Cache Hits | 0% | 90%+ | ∞ |
| Redis Operations/req | 2-3 | 1-2 | -50% |

---

## Rollback Plan

If issues arise:
1. Feature flag: `CACHE_V2_ENABLED=false` reverts to old behavior
2. Old cache keys remain valid (backward compatible)
3. Scrapers still work without cache (graceful degradation)

---

## Questions for Review

1. **TTL Values**: Are the proposed TTLs appropriate? Should we make them configurable via admin panel?
2. **Stats Retention**: How long should we keep hit/miss stats? (Proposed: 7 days rolling)
3. **Alias Expiry**: Should short URL aliases expire? (Proposed: 30 days)
4. **Cache Warming**: Should we implement proactive cache warming for popular content?

---

## Approval

- [ ] Technical Review
- [ ] Performance Testing
- [ ] Production Deployment

---

*End of Proposal*
