# Facebook Scraper Improvement Proposal

> **Status:** Draft v3 - Ready for Review  
> **Date:** December 2024  
> **Project:** DownAria (api-xtfetch)

## Executive Summary

Analisis perbandingan antara DownAria Facebook scraper dengan yt-dlp extractor. Proposal ini fokus pada improvement yang **praktis dan high-impact**, disesuaikan dengan arsitektur project kita.

---

## Current Project State

### Existing Infrastructure ✅
```
src/lib/
├── http/
│   ├── client.ts      # httpGet, httpPost, httpHead, httpResolveUrl ✅
│   ├── headers.ts     # User agents, rotating headers ✅
│   └── index.ts       # Barrel exports
├── services/
│   ├── facebook/
│   │   ├── scraper.ts    # Main scraper (uses mbasic fallback)
│   │   └── extractor.ts  # Regex patterns, fbTryMbasic
│   └── instagram/
│       └── scraper.ts    # Uses GraphQL API ✅ (reference implementation)
└── cookies/
    └── pool.ts        # Cookie rotation ✅
```

### Instagram GraphQL Reference
Instagram scraper sudah pakai GraphQL dengan pattern yang bisa di-adopt:
```typescript
// Instagram: GraphQL query dengan doc_id
const GRAPHQL_DOC_ID = '8845758582119845';
const url = `https://www.instagram.com/graphql/query/?doc_id=${GRAPHQL_DOC_ID}&variables=${variables}`;
const res = await httpGet(url, { headers: INSTAGRAM_HEADERS });
```

### Current Facebook Flow
```
1. mbasic fallback (public videos, no cookie) ← DEPRECATED, tidak reliable
2. Full web scrape dengan regex patterns
3. Cookie retry jika gagal
```

---

## Recommended Changes

### 🔴 Task 1: Remove mbasic Fallback

**Status:** Code exists, needs removal

**Current Code Location:**
- `src/lib/services/facebook/extractor.ts` line 429: `fbTryMbasic()`
- `src/lib/services/facebook/scraper.ts` line 75: Strategy 1 mbasic

**Problem:**
- mbasic.facebook.com sudah tidak reliable
- Sering return konten tidak relevan atau kosong
- Rate limiting ketat, banyak redirect ke login
- Menambah ~500ms latency tanpa benefit

**Action:**
```typescript
// extractor.ts - REMOVE entire function (lines 415-470)
// export async function fbTryMbasic(url: string): Promise<string | null> { ... }

// scraper.ts - REMOVE Strategy 1 block (lines 71-88)
// if ((contentType === 'video' || contentType === 'reel') && !parsedCookie) {
//     const mbasicUrl = await fbTryMbasic(inputUrl);
//     ...
// }
```

**Effort:** 30 minutes  
**Impact:** Cleaner code, faster execution

---

### 🔴 Task 2: Add Tahoe API Fallback

**Problem:** Ketika HTML scraping gagal, tidak ada fallback API.

**Solution:** Facebook Tahoe API (`/video/tahoe/async/`) return video data dalam JSON yang lebih stabil.

**Implementation di `extractor.ts`:**
```typescript
// ═══════════════════════════════════════════════════════════════════════════════
// TAHOE API FALLBACK
// ═══════════════════════════════════════════════════════════════════════════════

const FB_TAHOE_URL = 'https://www.facebook.com/video/tahoe/async/';

/**
 * Try to extract video via Facebook Tahoe API
 * More reliable than HTML scraping for video-only content
 * 
 * @param videoId - Facebook video ID (numeric)
 * @param cookie - Optional cookie for authenticated requests
 * @returns Video URLs or null if failed
 */
export async function fbTryTahoe(
    videoId: string, 
    cookie?: string
): Promise<FbVideoResult | null> {
    if (!videoId || !/^\d+$/.test(videoId)) return null;
    
    const url = `${FB_TAHOE_URL}${videoId}/?chain=true&isvideo=true&payloadtype=primary`;
    
    try {
        const res = await httpPost(url, {
            body: new URLSearchParams({ '__a': '1' }).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': DESKTOP_USER_AGENT,
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                ...(cookie ? { 'Cookie': cookie } : {}),
            },
            timeout: 10000,
        });
        
        if (!res.data) return null;
        
        // Response format: "for (;;);" + JSON
        const jsonStr = res.data.replace(/^for\s*\(\s*;\s*;\s*\)\s*;/, '');
        const data = JSON.parse(jsonStr);
        
        // Extract from jsmods.instances
        const instances = data?.jsmods?.instances || [];
        for (const instance of instances) {
            const [, config, params] = instance;
            if (config?.[0] === 'VideoConfig' && params?.[0]?.videoData) {
                const vd = params[0].videoData;
                return {
                    hd: vd.hd_src || vd.hd_src_no_ratelimit || vd.playable_url_quality_hd,
                    sd: vd.sd_src || vd.sd_src_no_ratelimit || vd.playable_url,
                    thumbnail: vd.thumbnail_src || vd.poster,
                };
            }
        }
        
        // Alternative: check payload directly
        const payload = data?.payload;
        if (payload?.video) {
            return {
                hd: payload.video.hd_src || payload.video.browser_native_hd_url,
                sd: payload.video.sd_src || payload.video.browser_native_sd_url,
                thumbnail: payload.video.thumbnail_src,
            };
        }
        
        return null;
    } catch (e) {
        logger.debug('facebook', `Tahoe API failed: ${e instanceof Error ? e.message : 'unknown'}`);
        return null;
    }
}
```

**Integration di `scraper.ts`:**
```typescript
// Replace mbasic strategy with Tahoe
// After HTML scraping returns no video formats:

if (formats.length === 0 && actualType === 'video') {
    const videoId = fbExtractVideoId(finalUrl);
    if (videoId) {
        logger.debug('facebook', 'Trying Tahoe API fallback...');
        const tahoeResult = await fbTryTahoe(videoId, useCookie ? parsedCookie : undefined);
        if (tahoeResult) {
            if (tahoeResult.hd) {
                formats.push({ 
                    quality: 'HD', 
                    type: 'video', 
                    url: tahoeResult.hd, 
                    format: 'mp4', 
                    itemId: 'video-main',
                    thumbnail: tahoeResult.thumbnail 
                });
            }
            if (tahoeResult.sd && tahoeResult.sd !== tahoeResult.hd) {
                formats.push({ 
                    quality: 'SD', 
                    type: 'video', 
                    url: tahoeResult.sd, 
                    format: 'mp4', 
                    itemId: 'video-main',
                    thumbnail: tahoeResult.thumbnail 
                });
            }
        }
    }
}
```

**Effort:** 2-3 hours  
**Impact:** High - recover ~20-30% failed video extractions

---

### 🟡 Task 3: Detect Live Video

**Problem:** Live videos tidak bisa di-download tapi kita tidak kasih error yang jelas.

**Implementation di `extractor.ts`:**
```typescript
/**
 * Check if content is a live broadcast
 */
export function fbIsLiveVideo(html: string): boolean {
    return html.includes('"is_live_streaming":true') || 
           html.includes('"broadcast_status":"LIVE"') ||
           html.includes('"is_live":true') ||
           html.includes('LiveVideoStatus');
}
```

**Di `scraper.ts`:**
```typescript
// Early check after fetching HTML
if (fbIsLiveVideo(html)) {
    return createError(ScraperErrorCode.UNSUPPORTED_CONTENT, 'Live video tidak dapat didownload');
}
```

**Effort:** 30 minutes  
**Impact:** Better UX - clear error message

---

### 🟢 Task 4: utilTraverseObj Utility (Optional)

**Problem:** Nested JSON navigation dengan regex bisa fragile.

**Solution:** Utility function untuk traverse nested objects (seperti yt-dlp).

```typescript
// src/lib/utils.ts

type PathSegment = string | number | ((key: string, val: unknown) => boolean);

/**
 * Traverse nested object with path segments
 * @example utilTraverseObj(data, 'video', 'formats', 0, 'url')
 * @example utilTraverseObj(data, (k, v) => k === 'media' && v.type === 'video')
 */
export function utilTraverseObj<T>(
    obj: unknown,
    ...path: PathSegment[]
): T | undefined {
    let current: unknown = obj;
    
    for (const segment of path) {
        if (current == null) return undefined;
        
        if (typeof segment === 'function') {
            if (Array.isArray(current)) {
                current = current.find((v, i) => segment(String(i), v));
            } else if (typeof current === 'object') {
                const entry = Object.entries(current).find(([k, v]) => segment(k, v));
                current = entry?.[1];
            } else {
                return undefined;
            }
        } else if (typeof segment === 'number') {
            current = Array.isArray(current) ? current[segment] : undefined;
        } else {
            current = (current as Record<string, unknown>)?.[segment];
        }
    }
    
    return current as T;
}
```

**Effort:** 1 hour  
**Impact:** Low-Medium - cleaner code for future improvements

---

## Implementation Checklist

### Sprint 1: Quick Wins (1 day)
- [ ] Remove `fbTryMbasic()` from extractor.ts
- [ ] Remove mbasic strategy from scraper.ts
- [ ] Add `fbIsLiveVideo()` detection
- [ ] Test existing functionality still works

### Sprint 2: Tahoe API (1 day)
- [ ] Implement `fbTryTahoe()` in extractor.ts
- [ ] Integrate as fallback in scraper.ts
- [ ] Test with various video URLs
- [ ] Test with/without cookie

### Backlog (Optional)
- [ ] Add `utilTraverseObj` utility for cleaner JSON navigation

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/services/facebook/extractor.ts` | Remove fbTryMbasic, add fbTryTahoe, add fbIsLiveVideo |
| `src/lib/services/facebook/scraper.ts` | Remove mbasic strategy, add Tahoe fallback, add live detection |
| `src/lib/utils.ts` | Add utilTraverseObj (optional) |

---

## Testing Checklist

### Video URLs to Test
```
# Public video
https://www.facebook.com/watch?v=123456789

# Reel
https://www.facebook.com/reel/123456789

# Video in post
https://www.facebook.com/username/videos/123456789

# Share link
https://www.facebook.com/share/v/ABC123/

# Group video
https://www.facebook.com/groups/123/posts/456/
```

### Expected Results
| Scenario | Before | After |
|----------|--------|-------|
| Public video (no cookie) | mbasic attempt → HTML scrape | Tahoe → HTML scrape |
| Video extraction fail | Return error | Tahoe fallback → better recovery |
| Live video | Generic error | Clear "Live tidak didukung" message |
| Latency | +500ms (mbasic) | -500ms (no mbasic) |

---

## Risk Assessment

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Tahoe API berubah | Medium | Keep HTML scraping as primary, Tahoe as fallback |
| Breaking existing functionality | Low | Comprehensive testing before deploy |

---

## Notes

### Rate Limiting - Not a Concern ✅
Kita sudah punya:
- Cookie pool rotation (`cookiePoolGetRotating`)
- Browser profiles (`httpGetRandomProfile`)
- Rotating headers (`httpGetRotatingHeaders`)

Jadi tidak perlu special download headers seperti yt-dlp.

### HLS/Live Video - Out of Scope ❌
Live video bukan use case DownAria. Cukup detect dan return error message yang jelas.

---

## Questions

1. ✅ `httpPost` sudah ada di `src/lib/http/client.ts`
2. ✅ Rate limiting handled by cookie rotation + browser profiles
3. ❓ Mau implement sekarang atau review dulu?

---

## Appendix: Removed Code Reference

### fbTryMbasic (TO BE REMOVED)
```typescript
// Location: src/lib/services/facebook/extractor.ts lines 415-470
export async function fbTryMbasic(url: string): Promise<string | null> {
    const mbasicUrl = url.replace(/(?:www|web|m)\.facebook\.com/, 'mbasic.facebook.com');
    // ... rest of function
}
```

### mbasic Strategy (TO BE REMOVED)
```typescript
// Location: src/lib/services/facebook/scraper.ts lines 71-88
if ((contentType === 'video' || contentType === 'reel') && !parsedCookie) {
    const mbasicUrl = await fbTryMbasic(inputUrl);
    if (mbasicUrl) {
        // ...
    }
}
```
