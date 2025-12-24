# 🔗 XTFetch Unified URL Resolver System

## Overview

Sistem resolver kita adalah **unified pipeline** yang handle semua platform (Facebook, Instagram, YouTube, TikTok, Weibo) dengan satu flow yang konsisten. 

### 🎯 UNIFIED = GLOBAL (No Per-Scraper Logic!)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  UNIFIED SYSTEMS (Global - Shared by ALL scrapers)                           │
│  ─────────────────────────────────────────────────                           │
│                                                                              │
│  1. BrowserProfiles    → Rotating User-Agent, Sec-Ch-Ua headers              │
│  2. Cookie Pool        → Rotating cookies per platform                       │
│  3. URL Pipeline       → Normalize, resolve, extract content ID              │
│  4. Rate Limiting      → Per-platform throttling                             │
│  5. Cache System       → Redis + Supabase hybrid cache                       │
│                                                                              │
│  ❌ NO hardcoded logic per scraper!                                          │
│  ❌ NO subdomain conversion in code!                                         │
│  ❌ NO platform-specific User-Agent strings!                                 │
│                                                                              │
│  ✅ Server redirects based on our User-Agent (from BrowserProfiles)          │
│  ✅ All scrapers call same unified functions                                 │
│  ✅ Anti-ban logic is centralized in lib/http.ts                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Ini memungkinkan:

1. **Normalisasi URL** - Bersihkan tracking params, normalize subdomain
2. **Platform Detection** - Auto-detect platform dari URL
3. **Short URL Resolution** - Resolve fb.watch, t.co, vm.tiktok, dll
4. **Content ID Extraction** - Extract video/post ID untuk caching
5. **Content Type Detection** - Detect story/reel/video/post
6. **Cookie Retry Logic** - Guest-first, retry with cookie jika redirect ke login

---

## 📁 File Structure

```
api-xtfetch/src/lib/
├── url/
│   └── pipeline.ts          # Main URL pipeline (prepareUrl, prepareUrlSync)
├── http.ts                  # HTTP client + httpResolveUrl
└── cookies.ts               # Cookie pool management
```

---

## 🔄 Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INPUT URL                                     │
│  https://fb.watch/abc123 atau https://www.facebook.com/stories/123/456      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 1: NORMALIZE URL (Local - No HTTP)                                     │
│  ───────────────────────────────────────                                     │
│  • Add https:// if missing                                                   │
│  • Remove tracking params (fbclid, igshid, utm_*, __cft__, dll)              │
│                                                                              │
│  NOTE: Subdomain conversion (m.facebook.com → web.facebook.com) happens      │
│  during URL RESOLUTION, NOT here! Facebook server redirects based on our     │
│  User-Agent (desktop browser profile from BrowserProfiles table).            │
│                                                                              │
│  Example flow:                                                               │
│  1. Input: m.facebook.com/stories/123                                        │
│  2. We send request with Desktop User-Agent (Chrome 143)                     │
│  3. Facebook server sees desktop UA → redirects to web.facebook.com          │
│  4. Resolved: web.facebook.com/stories/123                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 2: PLATFORM DETECTION                                                  │
│  ─────────────────────────                                                   │
│  platformDetect(url) → PlatformId | null                                     │
│                                                                              │
│  Supported: facebook | instagram | twitter | tiktok | weibo | youtube        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 3: CHECK IF NEEDS RESOLVE                                              │
│  ─────────────────────────────────                                           │
│  needsResolve(url, platform) → boolean                                       │
│                                                                              │
│  SHORT_URL_PATTERNS:                                                         │
│  ├── facebook: fb.watch | fb.me | l.facebook.com | /share/                   │
│  ├── instagram: instagr.am | ig.me                                           │
│  ├── twitter: t.co/                                                          │
│  ├── tiktok: vm.tiktok.com | vt.tiktok.com                                   │
│  └── weibo: t.cn/                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                    [Needs Resolve]     [No Resolve Needed]
                          │                   │
                          ▼                   │
┌─────────────────────────────────────────┐   │
│  STEP 4: URL RESOLUTION                 │   │
│  ──────────────────────                 │   │
│  httpResolveUrl(url, { cookie })        │   │
│                                         │   │
│  GUEST-FIRST STRATEGY:                  │   │
│  ┌─────────────────────────────────┐    │   │
│  │ 1. Try resolve WITHOUT cookie   │    │   │
│  │    (save cookies for later)     │    │   │
│  └─────────────────────────────────┘    │   │
│              │                          │   │
│              ▼                          │   │
│  ┌─────────────────────────────────┐    │   │
│  │ 2. Check if redirected to       │    │   │
│  │    /login.php or /login         │    │   │
│  └─────────────────────────────────┘    │   │
│              │                          │   │
│       ┌──────┴──────┐                   │   │
│       │             │                   │   │
│   [Login Page]  [Success]               │   │
│       │             │                   │   │
│       ▼             │                   │   │
│  ┌────────────┐     │                   │   │
│  │ 3. RETRY   │     │                   │   │
│  │ WITH COOKIE│     │                   │   │
│  └────────────┘     │                   │   │
│       │             │                   │   │
│       └──────┬──────┘                   │   │
│              │                          │   │
│              ▼                          │   │
│  Return ResolveResult:                  │   │
│  {                                      │   │
│    original: "fb.watch/abc",            │   │
│    resolved: "facebook.com/video/123",  │   │
│    redirectChain: [...],                │   │
│    changed: true                        │   │
│  }                                      │   │
└─────────────────────────────────────────┘   │
                          │                   │
                          └─────────┬─────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 5: EXTRACT CONTENT ID                                                  │
│  ──────────────────────────                                                  │
│  extractContentId(platform, resolvedUrl) → string | null                     │
│                                                                              │
│  CONTENT_ID_EXTRACTORS per platform:                                         │
│                                                                              │
│  FACEBOOK:                                                                   │
│  ├── /videos/(\d+)           → "123456789"                                   │
│  ├── /watch/?v=(\d+)         → "123456789"                                   │
│  ├── /reel/(\d+)             → "123456789"                                   │
│  ├── /stories/user/(\d+)     → "story:123456789"                             │
│  ├── /groups/\d+/permalink/(\d+) → "123456789"                               │
│  ├── story_fbid=(\d+)        → "123456789"                                   │
│  ├── pfbid([A-Za-z0-9]+)     → "pfbid2abc..."                                │
│  ├── /share/[prvs]/([A-Za-z0-9]+) → "share:abc123"                           │
│  ├── /posts/(\d+)            → "123456789"                                   │
│  └── /photos/user/(\d+)      → "photo:123456789"                             │
│                                                                              │
│  INSTAGRAM:                                                                  │
│  ├── /p/([A-Za-z0-9_-]+)     → "CxYz123"                                     │
│  ├── /reel/([A-Za-z0-9_-]+)  → "CxYz123"                                     │
│  ├── /reels/([A-Za-z0-9_-]+) → "CxYz123"                                     │
│  ├── /tv/([A-Za-z0-9_-]+)    → "CxYz123"                                     │
│  └── /stories/user/(\d+)     → "story:123456789"                             │
│                                                                              │
│  TWITTER:                                                                    │
│  └── /status(es)?/(\d+)      → "1234567890123456789"                         │
│                                                                              │
│  TIKTOK:                                                                     │
│  └── /video/(\d+)            → "7123456789012345678"                         │
│                                                                              │
│  YOUTUBE:                                                                    │
│  ├── ?v=([a-zA-Z0-9_-]{11})  → "dQw4w9WgXcQ"                                 │
│  ├── youtu.be/([a-zA-Z0-9_-]{11}) → "dQw4w9WgXcQ"                            │
│  ├── /embed/([a-zA-Z0-9_-]{11}) → "dQw4w9WgXcQ"                              │
│  └── /shorts/([a-zA-Z0-9_-]{11}) → "dQw4w9WgXcQ"                             │
│                                                                              │
│  WEIBO:                                                                      │
│  ├── /(\d{16,})              → "5012345678901234"                            │
│  ├── /(\d+)/([A-Za-z0-9]+)   → "1234567890:AbCdEf"                           │
│  └── /detail|status/(\d+)    → "5012345678901234"                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 6: DETECT CONTENT TYPE                                                 │
│  ───────────────────────────                                                 │
│  detectContentType(platform, url) → ContentType                              │
│                                                                              │
│  ContentType = 'video' | 'reel' | 'story' | 'post' | 'image' | 'unknown'     │
│                                                                              │
│  CONTENT_TYPE_DETECTORS:                                                     │
│  ├── twitter   → always 'post'                                               │
│  ├── instagram → /stories/ = 'story', /reel/ = 'reel', /tv/ = 'video', else 'post'│
│  ├── facebook  → /stories/ = 'story', /reel/ = 'reel', /videos|watch/ = 'video',  │
│  │               /photos/ = 'image', else 'post'                             │
│  ├── tiktok    → always 'video'                                              │
│  ├── weibo     → always 'post'                                               │
│  └── youtube   → /shorts/ = 'reel', else 'video'                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 7: CHECK COOKIE REQUIREMENT                                            │
│  ────────────────────────────────                                            │
│  mayRequireCookie(platform, url) → boolean                                   │
│                                                                              │
│  COOKIE_REQUIRED_PATTERNS:                                                   │
│  ├── twitter   → null (never needs cookie)                                   │
│  ├── instagram → /stories/ (stories need cookie)                             │
│  ├── facebook  → /stories/ | /groups/ (stories & groups need cookie)         │
│  ├── tiktok    → null (never needs cookie)                                   │
│  ├── weibo     → /./ (ALWAYS needs cookie)                                   │
│  └── youtube   → null (never needs cookie)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 8: GENERATE CACHE KEY                                                  │
│  ──────────────────────────                                                  │
│  generateCacheKeyFromUrl(platform, url) → string                             │
│                                                                              │
│  Format: "{platform}:{hash}"                                                 │
│  Example: "facebook:a1b2c3d4"                                                │
│                                                                              │
│  Hash = DJB2 hash of cleaned URL (tracking params removed)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FINAL OUTPUT: UrlPipelineResult                                             │
│  ───────────────────────────────                                             │
│  {                                                                           │
│    inputUrl: "https://fb.watch/abc123",                                      │
│    normalizedUrl: "https://fb.watch/abc123",                                 │
│    resolvedUrl: "https://www.facebook.com/reel/123456789",                   │
│    platform: "facebook",                                                     │
│    contentType: "reel",                                                      │
│    contentId: "123456789",                                                   │
│    wasResolved: true,                                                        │
│    redirectChain: ["fb.watch/abc", "facebook.com/reel/123"],                 │
│    assessment: {                                                             │
│      isValid: true,                                                          │
│      mayRequireCookie: false                                                 │
│    },                                                                        │
│    cacheKey: "facebook:x7y8z9"                                               │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ Anti-Ban System (UNIFIED - GLOBAL)

### BrowserProfiles Table
Semua request HTTP pakai rotating browser profiles dari database:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  browser_profiles table (Supabase)                                           │
│  ─────────────────────────────────                                           │
│  • user_agent: "Mozilla/5.0 (Windows NT 10.0...) Chrome/143.0.0.0..."        │
│  • sec_ch_ua: '"Google Chrome";v="143", "Chromium";v="143"...'               │
│  • sec_ch_ua_platform: '"Windows"' | '"macOS"'                               │
│  • sec_ch_ua_mobile: '?0' (desktop) | '?1' (mobile)                          │
│  • accept_language: 'en-US,en;q=0.9'                                         │
│  • browser: 'chrome' | 'firefox' | 'safari'                                  │
│  • device_type: 'desktop' | 'mobile'                                         │
│  • platform: 'all' | 'facebook' | 'instagram' | etc                          │
│  • priority: weighted random selection                                       │
│  • enabled: true/false                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How It Works (GLOBAL - No Per-Scraper Logic!)
```typescript
// httpGetRotatingHeadersAsync() - UNIFIED for ALL platforms
const headers = await httpGetRotatingHeadersAsync({ platform: 'facebook' });
// Returns headers with rotated User-Agent, Sec-Ch-Ua, etc from DB

// httpResolveUrl() uses these headers automatically
// Server sees desktop Chrome UA → redirects m.facebook.com to web.facebook.com
```

### Why This Matters
1. **m.facebook.com/stories/123** → Request with Desktop UA
2. **Facebook server** sees Chrome 143 Windows → Redirects to **web.facebook.com**
3. **No hardcoded subdomain conversion** in our code!
4. Server decides based on User-Agent = More natural, less detectable

---

## 🍪 Cookie Pool System (UNIFIED - GLOBAL)

### Cookie Rotation (Guest-First Strategy)

### Why Guest-First?

Cookie adalah resource yang terbatas dan bisa expired/banned. Strategi kita:

1. **Try tanpa cookie dulu** - Banyak URL bisa di-resolve tanpa login
2. **Detect login redirect** - Kalau redirect ke `/login.php`, berarti butuh auth
3. **Retry dengan cookie** - Baru pakai cookie kalau memang perlu

### Implementation di `httpResolveUrl`:

```typescript
export async function httpResolveUrl(shortUrl: string, options?: { cookie?: string }): Promise<ResolveResult> {
  const { cookie } = options || {};

  const doResolve = async (useCookie: boolean): Promise<ResolveResult> => {
    const headers: Record<string, string> = { ...BROWSER_HEADERS };
    if (useCookie && cookie) {
      headers['Cookie'] = cookie;
    }
    // ... axios request with redirect tracking
  };

  // First try: WITHOUT cookie (guest mode)
  const firstResult = await doResolve(false);
  
  // Check if resolved to login page
  if (cookie && firstResult.resolved.includes('/login')) {
    console.log(`[httpResolveUrl] Detected login redirect, retrying with cookie...`);
    return await doResolve(true);  // Retry WITH cookie
  }

  return firstResult;
}
```

### Flow di `publicservices/route.ts`:

```typescript
// Step 3: Get cookie EARLY (before URL resolution)
const earlyPlatform = detectedPlatform || platformDetect(url);
let poolCookie: string | null = null;
if (earlyPlatform) {
    poolCookie = bodyCookie || await cookiePoolGetRotating(earlyPlatform);
}

// Step 4: URL resolution - pass cookie for retry logic
const urlResult = await prepareUrl(url, { cookie: poolCookie || undefined });
```

---

## 🔧 Platform-Specific Behaviors

### Facebook
- **Short URLs**: `fb.watch`, `fb.me`, `l.facebook.com`, `/share/`
- **Cookie Required**: Stories (`/stories/`), Groups (`/groups/`)
- **Content Types**: video, reel, story, post, image
- **Special**: Stories URL sering redirect ke `/login.php` tanpa cookie

### Instagram
- **Short URLs**: `instagr.am`, `ig.me`
- **Cookie Required**: Stories (`/stories/`)
- **Content Types**: reel, story, video (IGTV), post
- **Special**: Shortcode-based IDs (e.g., `CxYz123`)

### Twitter/X
- **Short URLs**: `t.co/`
- **Cookie Required**: Never
- **Content Types**: Always 'post'
- **Special**: Status ID adalah numeric string panjang

### TikTok
- **Short URLs**: `vm.tiktok.com`, `vt.tiktok.com`
- **Cookie Required**: Never
- **Content Types**: Always 'video'
- **Special**: Video ID adalah numeric string 19 digit

### YouTube
- **Short URLs**: `youtu.be/`
- **Cookie Required**: Never
- **Content Types**: video, reel (Shorts)
- **Special**: Video ID selalu 11 karakter

### Weibo
- **Short URLs**: `t.cn/`
- **Cookie Required**: ALWAYS (semua konten)
- **Content Types**: Always 'post'
- **Special**: Dual ID format (userId:postId)

---

## 📊 Tracking Params yang Di-remove

```typescript
const TRACKING_PARAMS = [
  'fbclid',           // Facebook Click ID
  'igshid', 'igsh',   // Instagram Share ID
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',  // UTM
  's', 't',           // Generic tracking
  'ref', 'ref_src', 'ref_url',  // Referrer tracking
  '__cft__', '__tn__',  // Facebook internal
  'wtsid', '_rdr', 'rdid',  // Redirect tracking
  'share_url', 'app',  // Share tracking
  'mibextid', 'paipv', 'eav', 'sfnsn', 'extid',  // Mobile app tracking
  'img_index'  // Image index
];
```

---

## 🚀 Usage Examples

### Basic Usage (Async)
```typescript
import { prepareUrl } from '@/lib/url';

const result = await prepareUrl('https://fb.watch/abc123');
// result.platform = 'facebook'
// result.resolvedUrl = 'https://www.facebook.com/reel/123456789'
// result.contentType = 'reel'
```

### With Cookie (for auth-required content)
```typescript
const cookie = await cookiePoolGetRotating('facebook');
const result = await prepareUrl('https://facebook.com/stories/user/123', { 
  cookie 
});
```

### Sync Version (no HTTP, for quick checks)
```typescript
import { prepareUrlSync } from '@/lib/url';

const result = prepareUrlSync('https://www.instagram.com/p/CxYz123/');
// result.platform = 'instagram'
// result.contentId = 'CxYz123'
// result.wasResolved = false (no HTTP call)
```

---

## ⚠️ Error Codes

| Code | Description |
|------|-------------|
| `INVALID_URL` | URL format tidak valid |
| `UNSUPPORTED_PLATFORM` | Platform tidak didukung |
| `RESOLVE_FAILED` | Gagal resolve short URL |
| `MISSING_CONTENT_ID` | Tidak bisa extract content ID |

---

## 📝 Changelog

### December 2024
- Added cookie retry logic for login redirects
- Guest-first strategy to save cookies
- Early cookie fetch in publicservices route
- Keep `web.facebook.com` as valid subdomain (not normalized)

---

*Last updated: December 24, 2025*
