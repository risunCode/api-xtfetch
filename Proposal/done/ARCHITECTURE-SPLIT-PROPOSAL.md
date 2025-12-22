# XTFetch Architecture Split Proposal

> **Dokumen ini menjelaskan strategi pemisahan XTFetch dari monolith menjadi Frontend + Backend terpisah untuk keamanan, skalabilitas, dan maintainability yang lebih baik.**

---

## 📋 Executive Summary

### Masalah Saat Ini
1. **Security Risk** - Scraper logic, API endpoints, dan method bisa di-sniff dari browser
2. **Tight Coupling** - Frontend dan backend di satu codebase, susah scale independent
3. **Exposed Infrastructure** - Rate limits, cache TTL, cookie health visible di network tab
4. **Single Point of Failure** - Satu deploy down = semua down

### Solusi
Pisahkan menjadi 2 project independen:
- **Frontend** (`xtfetch-web`) - UI only, static-ish, deployed di edge
- **Backend** (`xtfetch-api`) - All processing, API only, deployed di serverless/VPS

### Expected Outcome
- ✅ Scraper logic tersembunyi dari public
- ✅ Independent scaling
- ✅ Better security posture
- ✅ Cleaner codebase
- ✅ Easier maintenance

---

## 🏗️ Architecture Overview

### Current (Monolith)
```
┌─────────────────────────────────────────────────────────┐
│                    XTFetch (Next.js)                    │
│                    xtfetch.com                          │
├─────────────────────────────────────────────────────────┤
│  Frontend          │  Backend                           │
│  ├── Pages         │  ├── API Routes                   │
│  ├── Components    │  ├── Scrapers                     │
│  ├── Hooks         │  ├── Cookie Pool                  │
│  └── i18n          │  ├── Rate Limiting                │
│                    │  ├── Auth                         │
│                    │  └── Database                     │
└─────────────────────────────────────────────────────────┘
```

### Proposed (Split)
```
┌──────────────────────────┐     ┌──────────────────────────┐
│   XTFetch-SocmedDownloader│     │   api-xtfetch (Backend)  │
│   xt-fetch.vercel.app    │────▶│   api-xtfetch.vercel.app │
├──────────────────────────┤     ├──────────────────────────┤
│  ├── Pages               │     │  ├── API Routes          │
│  ├── Components          │     │  ├── Scrapers            │
│  ├── Hooks               │     │  ├── Cookie Pool         │
│  ├── i18n                │     │  ├── Rate Limiting       │
│  ├── Admin UI            │     │  ├── Auth Verification   │
│  └── API Client          │     │  ├── Media Proxy         │
│                          │     │  └── Database            │
└──────────────────────────┘     └──────────────────────────┘
         │                                   │
         │                                   │
         ▼                                   ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│   Vercel (Edge)          │     │   Vercel (Serverless)    │
│   CDN + Static           │     │   atau VPS/Railway       │
└──────────────────────────┘     └──────────────────────────┘
                                             │
                                             ▼
                                 ┌──────────────────────────┐
                                 │   Supabase (PostgreSQL)  │
                                 │   + Redis (optional)     │
                                 └──────────────────────────┘
```

---

## 📁 Project Structure

### Frontend (`XTFetch-SocmedDownloader`)

```
XTFetch-SocmedDownloader/
├── .env.local
│   └── NEXT_PUBLIC_API_URL=https://api-xtfetch.vercel.app
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (public)/                 # Public pages
│   │   │   ├── page.tsx              # Home - URL input
│   │   │   ├── history/page.tsx      # Download history
│   │   │   ├── settings/page.tsx     # User settings
│   │   │   ├── about/page.tsx        # About page
│   │   │   ├── advanced/page.tsx     # Advanced tools
│   │   │   ├── share/page.tsx        # Share page
│   │   │   └── install/page.tsx      # PWA install guide
│   │   │
│   │   ├── admin/                    # Admin pages (protected)
│   │   │   ├── page.tsx              # Dashboard
│   │   │   ├── access/page.tsx       # API Keys
│   │   │   ├── services/page.tsx     # Platform management
│   │   │   ├── users/page.tsx        # User management
│   │   │   ├── communications/       # Announcements
│   │   │   └── settings/page.tsx     # Global settings
│   │   │
│   │   ├── auth/                     # Auth pages
│   │   │   ├── page.tsx              # Login
│   │   │   └── reset/page.tsx        # Password reset
│   │   │
│   │   ├── docs/                     # Documentation
│   │   │   ├── page.tsx
│   │   │   ├── api/
│   │   │   ├── changelog/
│   │   │   ├── faq/
│   │   │   └── guides/
│   │   │
│   │   ├── maintenance/page.tsx      # Maintenance page
│   │   ├── layout.tsx                # Root layout
│   │   └── globals.css               # Global styles
│   │
│   ├── components/                   # React components
│   │   ├── ui/                       # Base UI (buttons, inputs, etc)
│   │   ├── media/                    # MediaGallery, VideoPlayer
│   │   ├── admin/                    # Admin-specific components
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── AdminGuard.tsx
│   │   ├── AnnouncementBanner.tsx
│   │   └── ServiceWorkerRegister.tsx
│   │
│   ├── hooks/                        # React hooks
│   │   ├── useTheme.ts
│   │   ├── useHistory.ts             # IndexedDB history
│   │   ├── useAnnouncements.ts
│   │   ├── useUpdatePrompt.ts
│   │   └── admin/                    # Admin hooks (fetch from API)
│   │       ├── useServices.ts
│   │       ├── useApiKeys.ts
│   │       ├── useCookies.ts
│   │       ├── useStats.ts
│   │       └── useUsers.ts
│   │
│   ├── lib/                          # Utilities
│   │   ├── api/                      # API client
│   │   │   ├── client.ts             # Base fetch wrapper
│   │   │   ├── download.ts           # Download API calls
│   │   │   ├── admin.ts              # Admin API calls
│   │   │   └── types.ts              # API response types
│   │   │
│   │   ├── storage/                  # Client-side storage
│   │   │   ├── indexeddb.ts          # History storage
│   │   │   ├── localStorage.ts       # Settings storage
│   │   │   └── index.ts
│   │   │
│   │   ├── utils/                    # Helper functions
│   │   │   ├── format-utils.ts       # formatBytes, formatNumber
│   │   │   ├── url-utils.ts          # URL validation (basic)
│   │   │   ├── thumbnail-utils.ts    # Proxy thumbnail URLs
│   │   │   └── discord-webhook.ts    # User's Discord webhook
│   │   │
│   │   └── types.ts                  # Shared types
│   │
│   ├── i18n/                         # Internationalization
│   │   ├── config.ts
│   │   └── messages/
│   │       ├── en.json
│   │       └── id.json
│   │
│   └── types/                        # TypeScript types
│       └── index.ts
│
├── public/                           # Static assets
│   ├── icon.png
│   ├── manifest.json
│   ├── sw.js                         # Service Worker
│   └── robots.txt
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### Backend (`api-xtfetch`)

```
api-xtfetch/
├── .env
│   ├── SUPABASE_URL=
│   ├── SUPABASE_SERVICE_ROLE_KEY=
│   ├── ENCRYPTION_KEY=
│   ├── ALLOWED_ORIGINS=https://xt-fetch.vercel.app
│   └── REDIS_URL= (optional)
│
├── src/
│   ├── app/
│   │   └── api/                      # All API routes
│   │       │
│   │       ├── route.ts              # POST /api - Main download
│   │       ├── proxy/route.ts        # GET /api/proxy - Media proxy
│   │       ├── status/route.ts       # GET /api/status - Public status
│   │       ├── playground/route.ts   # POST /api/playground - Guest API
│   │       │
│   │       ├── download/             # Platform-specific (optional)
│   │       │   └── [platform]/route.ts
│   │       │
│   │       ├── admin/                # Admin APIs (protected)
│   │       │   ├── auth/route.ts     # Login, logout, verify
│   │       │   ├── services/route.ts # Platform management
│   │       │   ├── cookies/
│   │       │   │   ├── route.ts      # Legacy single cookie
│   │       │   │   ├── pool/route.ts # Cookie pool CRUD
│   │       │   │   └── health-check/route.ts
│   │       │   ├── apikeys/route.ts  # API key management
│   │       │   ├── users/route.ts    # User management
│   │       │   ├── stats/route.ts    # Analytics
│   │       │   ├── settings/route.ts # Global settings
│   │       │   ├── announcements/route.ts
│   │       │   ├── push/route.ts     # Push notifications
│   │       │   ├── cache/route.ts    # Cache management
│   │       │   └── alerts/route.ts   # System alerts
│   │       │
│   │       ├── announcements/route.ts # Public announcements
│   │       └── push/
│   │           └── subscribe/route.ts # Push subscription
│   │
│   ├── core/                         # Core business logic
│   │   ├── scrapers/                 # Platform scrapers
│   │   │   ├── index.ts              # Barrel export
│   │   │   ├── types.ts              # Scraper types
│   │   │   ├── factory.ts            # getScraper()
│   │   │   ├── facebook.ts
│   │   │   ├── instagram.ts
│   │   │   ├── twitter.ts
│   │   │   ├── tiktok.ts
│   │   │   ├── weibo.ts
│   │   │   └── youtube.ts
│   │   │
│   │   ├── security/                 # Security utilities
│   │   │   ├── index.ts
│   │   │   ├── encryption.ts         # AES-256-GCM
│   │   │   ├── rate-limit.ts         # Rate limiting
│   │   │   ├── auth.ts               # JWT verification
│   │   │   └── validation.ts         # Input sanitization
│   │   │
│   │   ├── database/                 # Database layer
│   │   │   ├── index.ts
│   │   │   ├── supabase.ts           # Supabase client
│   │   │   ├── cache.ts              # Redis/memory cache
│   │   │   └── config.ts             # Service config
│   │   │
│   │   └── config/                   # App configuration
│   │       ├── index.ts
│   │       ├── constants.ts
│   │       └── environment.ts
│   │
│   ├── lib/                          # Shared utilities
│   │   ├── cookies/                  # Cookie management
│   │   │   ├── index.ts
│   │   │   ├── parser.ts             # Parse cookie strings
│   │   │   ├── pool.ts               # Cookie pool rotation
│   │   │   └── health.ts             # Health tracking
│   │   │
│   │   ├── http/                     # HTTP utilities
│   │   │   ├── index.ts
│   │   │   ├── client.ts             # Axios instance
│   │   │   ├── headers.ts            # Browser headers
│   │   │   └── proxy.ts              # Proxy utilities
│   │   │
│   │   ├── url/                      # URL processing
│   │   │   ├── index.ts
│   │   │   ├── normalize.ts          # URL normalization
│   │   │   ├── detect.ts             # Platform detection
│   │   │   └── resolve.ts            # Redirect resolution
│   │   │
│   │   ├── services/                 # Service helpers
│   │   │   ├── download-handler.ts   # Main download logic
│   │   │   ├── analytics.ts          # Track downloads/errors
│   │   │   └── notifications.ts      # Push notifications
│   │   │
│   │   └── utils/                    # General utilities
│   │       ├── format.ts
│   │       └── errors.ts
│   │
│   ├── middleware.ts                 # Global middleware
│   │   └── CORS, rate limiting, security headers
│   │
│   └── types/                        # TypeScript types
│       └── index.ts
│
├── next.config.ts                    # Minimal config (API only)
├── tsconfig.json
└── package.json
```

---

## 🔄 Data Flow

### 1. Download Flow (Public User)

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER JOURNEY                               │
└─────────────────────────────────────────────────────────────────────┘

[User] Paste URL di xtfetch.com
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND (xtfetch-web)                                              │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Basic URL validation (format check)                              │
│ 2. Show loading state                                               │
│ 3. POST request ke api.xtfetch.com/api                              │
│    Body: { url: "https://..." }                                     │
│    Headers: { X-API-Key: "..." } (optional)                         │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ HTTPS
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND (xtfetch-api)                                               │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Middleware: CORS check, rate limit, security headers             │
│ 2. Validate API key (if provided)                                   │
│ 3. Normalize & resolve URL (follow redirects)                       │
│ 4. Detect platform                                                  │
│ 5. Check cache → if hit, return cached                              │
│ 6. Get cookie from pool (if needed)                                 │
│ 7. Run scraper                                                      │
│ 8. Parse response, extract media URLs                               │
│ 9. Cache result                                                     │
│ 10. Track analytics (downloads table)                               │
│ 11. Return JSON response                                            │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ JSON Response
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND (xtfetch-web)                                              │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Receive response:                                                │
│    {                                                                │
│      success: true,                                                 │
│      platform: "instagram",                                         │
│      data: {                                                        │
│        title: "...",                                                │
│        author: "...",                                               │
│        thumbnail: "...",                                            │
│        formats: [{ url, quality, type }],                           │
│        engagement: { likes, comments, shares }                      │
│      }                                                              │
│    }                                                                │
│                                                                     │
│ 2. Render MediaGallery component                                    │
│ 3. User selects quality                                             │
│ 4. User clicks download                                             │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Download Request
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND (xtfetch-api) - /api/proxy                                  │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Validate proxy request                                           │
│ 2. Fetch media from source                                          │
│ 3. Stream to client with proper headers                             │
│ 4. Anti-IDM headers (X-Content-Type-Options, etc)                   │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Binary Stream
         ▼
[User] File downloaded ✅
```

### 2. Admin Flow

```
[Admin] Login di xtfetch.com/auth
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                            │
├─────────────────────────────────────────────────────────────────────┤
│ 1. POST api.xtfetch.com/api/admin/auth                              │
│    Body: { email, password }                                        │
│ 2. Receive JWT token                                                │
│ 3. Store in cookie/localStorage                                     │
│ 4. Redirect to /admin                                               │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
[Admin] Access /admin/services
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                            │
├─────────────────────────────────────────────────────────────────────┤
│ 1. GET api.xtfetch.com/api/admin/services                           │
│    Headers: { Authorization: "Bearer <jwt>" }                       │
│ 2. Render platform cards with data                                  │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND                                                             │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Verify JWT token                                                 │
│ 2. Check user role (must be admin)                                  │
│ 3. Fetch service config from DB                                     │
│ 4. Return sanitized config (no sensitive internals)                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Considerations

### CORS Configuration (Backend)

```typescript
// middleware.ts
const ALLOWED_ORIGINS = [
  'https://xt-fetch.vercel.app',
  process.env.NODE_ENV === 'development' && 'http://localhost:3000',
].filter(Boolean);

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  
  // Add CORS headers to response
  const response = NextResponse.next();
  if (ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  
  return response;
}
```

### API Client (Frontend)

```typescript
// lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-xtfetch.vercel.app';

interface FetchOptions extends RequestInit {
  auth?: boolean;
}

export async function apiClient<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { auth = false, ...fetchOptions } = options;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };
  
  // Add auth token if needed
  if (auth) {
    const token = getAuthToken(); // from cookie/localStorage
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
    credentials: 'include', // for cookies
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(response.status, error.message || 'Request failed');
  }
  
  return response.json();
}
```

### What's Hidden from Public

| Data | Before (Monolith) | After (Split) |
|------|-------------------|---------------|
| Scraper source code | Visible in bundle | Hidden in backend |
| Scraping methods | Visible in network | Hidden |
| Cookie values | Never exposed | Never exposed |
| Rate limit config | Visible in API response | Hidden (only effect visible) |
| Cache TTL | Visible | Hidden |
| Internal errors | Sometimes leaked | Sanitized |
| Admin endpoints | Discoverable | Same domain, but protected |

---

## 🚀 Deployment Strategy

### Phase 1: Setup Backend

```bash
# 1. Create new repo (sudah ada: api-xtfetch)
# 2. Copy backend files dari XTFetch-SocmedDownloader
cp -r src/app/api api-xtfetch/src/app/
cp -r src/core api-xtfetch/src/
cp -r src/lib/services api-xtfetch/src/lib/
cp -r src/lib/cookies api-xtfetch/src/lib/
cp -r src/lib/http api-xtfetch/src/lib/
cp -r src/lib/url api-xtfetch/src/lib/
cp src/middleware.ts api-xtfetch/src/

# 3. Setup package.json (minimal deps)
# 4. Configure environment
# 5. Deploy to Vercel (api-xtfetch.vercel.app)
```

### Phase 2: Update Frontend

```bash
# 1. Remove backend code dari XTFetch-SocmedDownloader
rm -rf src/app/api
rm -rf src/core
rm -rf src/lib/services
rm -rf src/lib/cookies
rm -rf src/lib/http
rm -rf src/lib/url
rm src/middleware.ts

# 2. Create API client
# 3. Update all hooks to use API client
# 4. Update environment variables
# 5. Test thoroughly
# 6. Deploy (xt-fetch.vercel.app)
```

### Phase 3: DNS & Routing

```
xt-fetch.vercel.app        → Vercel (XTFetch-SocmedDownloader)
api-xtfetch.vercel.app     → Vercel (api-xtfetch)
```

### Rollback Plan

Jika ada masalah:
1. Revert DNS ke monolith
2. Keep monolith running as backup selama 1 minggu
3. Fix issues di split version
4. Re-deploy

---

## 📦 Dependencies

### Frontend (`XTFetch-SocmedDownloader`)

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.400.0",
    "@fortawesome/react-fontawesome": "^0.2.0",
    "sweetalert2": "^11.0.0",
    "next-intl": "^3.0.0",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "@types/react": "^19.0.0"
  }
}
```

**Removed from frontend:**
- `@supabase/supabase-js` (backend only)
- `axios` (backend only)
- `cheerio` (backend only)
- `hls.js` (keep if HLS playback needed)
- `crypto` related (backend only)

### Backend (`api-xtfetch`)

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "axios": "^1.0.0",
    "cheerio": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

**No UI dependencies needed** - pure API.

---

## ⏱️ Timeline Estimate

| Phase | Task | Duration |
|-------|------|----------|
| 1 | Setup backend repo & structure | 1 day |
| 2 | Move & refactor API routes | 2-3 days |
| 3 | Move core & lib modules | 1-2 days |
| 4 | Setup CORS & middleware | 1 day |
| 5 | Create frontend API client | 1 day |
| 6 | Update frontend hooks | 2-3 days |
| 7 | Testing & debugging | 2-3 days |
| 8 | Deployment & DNS | 1 day |
| 9 | Monitoring & fixes | Ongoing |

**Total: ~2 weeks** untuk full migration

---

## ✅ Checklist

### Backend Setup
- [x] Setup `api-xtfetch` repository structure
- [x] Setup Next.js project (API routes only)
- [x] Move `/api/*` routes (main, proxy, status, playground)
- [x] Move `/core/*` modules (config, database, scrapers, security)
- [x] Move `/lib/services/*`, `/lib/cookies/*`, `/lib/http/*`, `/lib/url/*`
- [x] Setup middleware (CORS, rate limit, security)
- [x] Configure environment variables (.env.example)
- [x] Copy admin API routes (/api/admin/*)
- [x] Build passes successfully
- [ ] Setup Vercel project
- [ ] Deploy to api-xtfetch.vercel.app
- [ ] Test all endpoints

### Frontend Update
- [x] Create API client (`/lib/api/client.ts`)
- [x] Create API type definitions (`/lib/api/types.ts`)
- [x] Create proxy URL helper (`/lib/api/proxy.ts`)
- [x] Update `useAdminFetch` hook
- [x] Update main download logic (`page.tsx`)
- [x] Update share page (`share/page.tsx`)
- [x] Update playground hook (`usePlayground.ts`)
- [x] Update proxy URLs in MediaGallery
- [x] Update proxy URLs in DownloadPreview
- [x] Update proxy URLs in OptimizedImage
- [x] Update proxy URLs in advanced page
- [x] Update environment variables (`.env`)
- [x] Update `useStatus` hook
- [x] Update `useAnnouncements` hook
- [x] Update `useCookieStatus` hook
- [x] Update `useUpdatePrompt` hook
- [x] Frontend build passes
- [ ] Remove unused backend code (optional cleanup)
- [ ] Remove unused dependencies (optional cleanup)
- [ ] Test all features
- [ ] Deploy to xt-fetch.vercel.app

### Post-Migration
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify CORS working correctly
- [ ] Test admin functions
- [ ] Test download flow end-to-end
- [ ] Update documentation
- [ ] Archive monolith repo (keep as backup)

---

## 🤔 Open Questions

1. **Backend hosting**: Tetap Vercel atau pindah ke VPS/Railway untuk lebih control?
2. **Redis**: Perlu Redis untuk caching atau memory cache cukup?
3. **Rate limiting**: Pakai Vercel KV atau external service?
4. **Monitoring**: Setup error tracking (Sentry)?
5. **API versioning**: Perlu `/api/v1/` prefix?

---

## 📝 Notes

- Frontend tetap bisa jalan tanpa backend (show error message)
- Backend bisa di-scale independent (add more serverless functions)
- Jika Vercel limit tercapai, backend bisa pindah ke VPS tanpa affect frontend
- Cookie pool & encryption tetap di backend, never exposed
- Admin UI tetap di frontend, tapi semua data dari backend API

---

*Dokumen ini akan di-update sesuai feedback dan keputusan selanjutnya.*
