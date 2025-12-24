# Services Folder Reorganization Proposal

**Date**: December 2025  
**Status**: PROPOSAL  

---

## Current Structure (Messy)

```
src/lib/services/
├── facebook.ts           # 280 lines
├── instagram.ts          # 200 lines
├── tiktok.ts             # 100 lines
├── twitter.ts            # ??? lines
├── weibo.ts              # ??? lines
├── youtube.ts            # 350 lines
├── index.ts              # barrel export
└── helper/
    ├── content-validator.ts   # UNIFIED - carousel detection
    ├── engagement-parser.ts   # UNIFIED - engagement parsing
    ├── error-detector.ts      # UNIFIED - error patterns
    ├── format-builder.ts      # UNIFIED - format building
    ├── fb-extractor.ts        # PLATFORM-SPECIFIC (Facebook)
    ├── logger.ts              # UNIFIED - logging
    └── index.ts
```

**Problems:**
1. Platform scrapers mixed with unified helpers
2. `fb-extractor.ts` is platform-specific but in `helper/` folder
3. No clear separation between UNIFIED vs PLATFORM-SPECIFIC code
4. Hard to find platform-specific helpers

---

## Proposed Structure (Clean)

```
src/lib/services/
├── index.ts                    # Main barrel export
│
├── shared/                     # UNIFIED HELPERS (cross-platform)
│   ├── index.ts
│   ├── logger.ts               # Logging utilities
│   ├── content-validator.ts    # Carousel detection, validation
│   ├── engagement-parser.ts    # Platform engagement parsing
│   ├── error-detector.ts       # Error pattern detection
│   └── format-builder.ts       # Format building utilities
│
├── facebook/                   # FACEBOOK
│   ├── index.ts                # export { scrapeFacebook }
│   ├── scraper.ts              # Main scraper logic
│   └── extractor.ts            # FB-specific extraction (from fb-extractor.ts)
│
├── instagram/                  # INSTAGRAM
│   ├── index.ts                # export { scrapeInstagram }
│   ├── scraper.ts              # Main scraper logic
│   └── extractor.ts            # IG-specific extraction (GraphQL, stories)
│
├── tiktok/                     # TIKTOK
│   ├── index.ts                # export { scrapeTikTok }
│   └── scraper.ts              # Main scraper (simple, uses TikWM API)
│
├── twitter/                    # TWITTER/X
│   ├── index.ts                # export { scrapeTwitter }
│   ├── scraper.ts              # Main scraper logic
│   └── extractor.ts            # Twitter-specific extraction
│
├── weibo/                      # WEIBO
│   ├── index.ts                # export { scrapeWeibo }
│   └── scraper.ts              # Main scraper logic
│
└── youtube/                    # YOUTUBE
    ├── index.ts                # export { scrapeYouTube }
    ├── scraper.ts              # Main scraper (yt-dlp wrapper)
    └── merger.ts               # Video+audio merge logic (if needed)
```

---

## File Mapping

| Current | New Location |
|---------|--------------|
| `facebook.ts` | `facebook/scraper.ts` |
| `helper/fb-extractor.ts` | `facebook/extractor.ts` |
| `instagram.ts` | `instagram/scraper.ts` |
| `tiktok.ts` | `tiktok/scraper.ts` |
| `twitter.ts` | `twitter/scraper.ts` |
| `weibo.ts` | `weibo/scraper.ts` |
| `youtube.ts` | `youtube/scraper.ts` |
| `helper/logger.ts` | `shared/logger.ts` |
| `helper/content-validator.ts` | `shared/content-validator.ts` |
| `helper/engagement-parser.ts` | `shared/engagement-parser.ts` |
| `helper/error-detector.ts` | `shared/error-detector.ts` |
| `helper/format-builder.ts` | `shared/format-builder.ts` |

---

## Import Changes

### Before
```typescript
// Messy imports
import { scrapeFacebook } from '@/lib/services/facebook';
import { fbExtractVideos } from '@/lib/services/helper/fb-extractor';
import { logger } from '@/lib/services/helper/logger';
```

### After
```typescript
// Clean imports
import { scrapeFacebook } from '@/lib/services/facebook';
import { logger } from '@/lib/services/shared';

// Or from main barrel
import { scrapeFacebook, scrapeInstagram } from '@/lib/services';
```

---

## Barrel Exports

### `services/index.ts`
```typescript
// Platform scrapers
export { scrapeFacebook } from './facebook';
export { scrapeInstagram } from './instagram';
export { scrapeTikTok } from './tiktok';
export { scrapeTwitter } from './twitter';
export { scrapeWeibo } from './weibo';
export { scrapeYouTube } from './youtube';

// Shared utilities (for internal use)
export * from './shared';
```

### `services/facebook/index.ts`
```typescript
export { scrapeFacebook } from './scraper';
// Internal exports (not re-exported from main)
export * from './extractor';
```

### `services/shared/index.ts`
```typescript
export * from './logger';
export * from './content-validator';
export * from './engagement-parser';
export * from './error-detector';
export * from './format-builder';
```

---

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Find platform code | Search all files | Go to `platform/` folder |
| Platform helpers | Mixed in `helper/` | Inside platform folder |
| Shared utilities | Mixed with platform | Clear `shared/` folder |
| Add new platform | Create file + helper | Create folder with structure |
| Code ownership | Unclear | Each platform is isolated |

---

## Migration Steps

### Phase 1: Create Structure
```bash
# Create folders
mkdir -p src/lib/services/{shared,facebook,instagram,tiktok,twitter,weibo,youtube}
```

### Phase 2: Move Shared Helpers
```bash
# Move unified helpers to shared/
mv helper/logger.ts shared/
mv helper/content-validator.ts shared/
mv helper/engagement-parser.ts shared/
mv helper/error-detector.ts shared/
mv helper/format-builder.ts shared/
```

### Phase 3: Move Platform Files
```bash
# Facebook
mv facebook.ts facebook/scraper.ts
mv helper/fb-extractor.ts facebook/extractor.ts

# Others
mv instagram.ts instagram/scraper.ts
mv tiktok.ts tiktok/scraper.ts
mv twitter.ts twitter/scraper.ts
mv weibo.ts weibo/scraper.ts
mv youtube.ts youtube/scraper.ts
```

### Phase 4: Update Imports
- Update all `@/lib/services/helper/*` → `@/lib/services/shared/*`
- Update all `@/lib/services/facebook` → `@/lib/services/facebook`
- Create barrel exports

### Phase 5: Cleanup
```bash
# Remove old helper folder
rm -rf helper/
```

---

## Platform-Specific Helpers (Future)

Each platform can have its own `extractor.ts` for platform-specific logic:

| Platform | Extractor Needed? | Reason |
|----------|-------------------|--------|
| Facebook | ✅ YES | Complex patterns, mbasic fallback |
| Instagram | ✅ YES | GraphQL, stories, carousel |
| TikTok | ❌ NO | Simple API (TikWM) |
| Twitter | ⚠️ MAYBE | If patterns get complex |
| Weibo | ⚠️ MAYBE | Chinese patterns |
| YouTube | ❌ NO | Uses yt-dlp (external) |

---

## Example: Facebook Folder

```
facebook/
├── index.ts          # 5 lines - just exports
├── scraper.ts        # ~280 lines - main logic
└── extractor.ts      # ~930 lines - FB patterns & extraction
```

### `facebook/index.ts`
```typescript
export { scrapeFacebook } from './scraper';
```

### `facebook/scraper.ts`
```typescript
import { ... } from '../shared';
import { fbExtractVideos, fbExtractStories, ... } from './extractor';

export async function scrapeFacebook(url: string, options?: ScraperOptions): Promise<ScraperResult> {
    // Main scraping logic
}
```

---

## Estimated Effort

| Task | Time |
|------|------|
| Create folder structure | 5 min |
| Move files | 10 min |
| Update imports | 30 min |
| Create barrel exports | 15 min |
| Test build | 10 min |
| **Total** | **~1 hour** |

---

**Prepared by**: Kiro AI Assistant  
**Review Status**: Pending User Approval
