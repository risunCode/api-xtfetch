# Facebook Scraper Optimization Proposal

**Date**: December 2025  
**Status**: PROPOSAL  

---

## Problems

| Issue | Impact |
|-------|--------|
| 602 lines dalam 1 file | Hard to maintain |
| 10-15 regex passes per video | Slow |
| Parse seluruh HTML (500KB+) | Wasteful |
| No mbasic fallback | Missing fast path |
| Dead code (`getQuality`) | Bloat |

---

## Solution: 2 Files Only

```
src/lib/services/
├── facebook.ts           # Main scraper (refactored, ~350 lines)
└── helper/
    └── fb-extractor.ts   # Extraction helpers (NEW, ~250 lines)
```

---

## fb-extractor.ts

```typescript
// ============================================
// 1. COMPILED PATTERNS (pre-compiled = faster)
// ============================================

export const FB_VIDEO_PATTERN = /"(?:browser_native_(?:hd|sd)_url|playable_url(?:_quality_hd)?|(?:hd|sd)_src(?:_no_ratelimit)?)":"(https:[^"]+)"/g;

export const FB_PATTERNS = {
    thumbnail: /"(?:previewImage|thumbnailImage|poster_image)"[^}]*?"uri":"(https:[^"]+)"/,
    author: /"(?:owning_profile|owner)"[^}]*?"name":"([^"]+)"/,
    likes: /"reaction_count":\{"count":(\d+)/,
    comments: /"comment_count":\{"total_count":(\d+)/,
    shares: /"share_count":\{"count":(\d+)/,
    views: /"video_view_count":(\d+)/,
};

// ============================================
// 2. SINGLE-PASS VIDEO EXTRACTION
// ============================================

export function fbExtractVideos(html: string): { hd?: string; sd?: string } {
    const result: { hd?: string; sd?: string } = {};
    let match;
    
    FB_VIDEO_PATTERN.lastIndex = 0;
    while ((match = FB_VIDEO_PATTERN.exec(html)) !== null) {
        const url = utilDecodeUrl(match[1]);
        const key = match[0];
        
        if (!result.hd && (key.includes('hd') || key.includes('quality_hd'))) {
            result.hd = url;
        } else if (!result.sd && !result.hd) {
            result.sd = url;
        }
        
        if (result.hd && result.sd) break;
    }
    
    return result;
}

// ============================================
// 3. TARGETED BLOCK FINDER
// ============================================

export function fbFindVideoBlock(html: string, videoId?: string): string {
    const keys = ['"browser_native_hd_url":', '"playable_url":', '"videoPlayerOriginData"'];
    
    for (const key of keys) {
        const pos = html.indexOf(key);
        if (pos > -1) {
            return html.substring(Math.max(0, pos - 2000), Math.min(html.length, pos + 20000));
        }
    }
    
    return html.substring(0, 100000);
}

// ============================================
// 4. MBASIC FALLBACK (faster for public videos)
// ============================================

export async function fbTryMbasic(url: string): Promise<string | null> {
    const mbasicUrl = url.replace(/(?:www|web|m)\.facebook\.com/, 'mbasic.facebook.com');
    
    try {
        const res = await httpGet(mbasicUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 4.4.2)' },
            timeout: 8000,
        });
        
        // mbasic has direct video URLs
        const match = res.data.match(/href="(https:\/\/video[^"]+\.mp4[^"]*)"/);
        return match ? utilDecodeUrl(match[1]) : null;
    } catch {
        return null;
    }
}

// ============================================
// 5. METADATA EXTRACTION
// ============================================

export function fbExtractMetadata(html: string) {
    return {
        thumbnail: html.match(FB_PATTERNS.thumbnail)?.[1],
        author: html.match(FB_PATTERNS.author)?.[1],
        likes: parseInt(html.match(FB_PATTERNS.likes)?.[1] || '0'),
        comments: parseInt(html.match(FB_PATTERNS.comments)?.[1] || '0'),
        shares: parseInt(html.match(FB_PATTERNS.shares)?.[1] || '0'),
        views: parseInt(html.match(FB_PATTERNS.views)?.[1] || '0'),
    };
}
```

---

## facebook.ts Changes

```typescript
// BEFORE: 10+ sequential regex calls
const hdNative = area.match(/"browser_native_hd_url":"([^"]+)"/);
const sdNative = area.match(/"browser_native_sd_url":"([^"]+)"/);
const hdPlay = area.match(/"playable_url_quality_hd":"([^"]+)"/);
// ... 7 more

// AFTER: Single import, single call
import { fbExtractVideos, fbFindVideoBlock, fbTryMbasic } from './helper/fb-extractor';

const block = fbFindVideoBlock(html, videoId);
const { hd, sd } = fbExtractVideos(block);
```

---

## Strategy Flow (Simplified)

```
VIDEO/REEL:
  1. Try mbasic (no cookie, fast) → success? return
  2. Try web (no cookie) → success? return  
  3. Try web (with cookie) → return

STORY:
  1. Require cookie → Try web → return

POST/GROUP:
  1. Try web (no cookie) → success? return
  2. Try web (with cookie) → return
```

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Regex passes | 10-15 | 1-2 |
| HTML parsed | 500KB | 20KB |
| Response time | 2-4s | 0.8-1.5s |
| Lines of code | 602 | ~600 (split) |

---

## Implementation

1. Create `helper/fb-extractor.ts` dengan functions di atas
2. Refactor `facebook.ts` untuk import dan gunakan helpers
3. Add mbasic fallback untuk video/post
4. Remove dead code (`getQuality`, unused patterns)
5. Test semua content types

---

**References:**
- [kevinzg/facebook-scraper](https://github.com/kevinzg/facebook-scraper)
- [18520339/facebook-data-extraction](https://github.com/18520339/facebook-data-extraction)
- mbasic.facebook.com (Facebook SSR)
