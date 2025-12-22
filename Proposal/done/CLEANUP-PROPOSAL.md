# XTFetch Frontend Cleanup Proposal

> **Dokumen ini menjelaskan API calls yang ada, mana yang sudah centralized ke backend, dan apa yang perlu di-cleanup dari frontend.**

---

## 🤔 Kenapa Perlu Cleanup?

### 1. Duplicate Code
Frontend masih punya ~40 API routes yang SAMA dengan backend. Ini bikin:
- Confusing - mana yang dipake?
- Maintenance nightmare - update 2 tempat
- Security risk - scraper logic masih exposed di frontend bundle

### 2. Bundle Size
Frontend masih include deps yang cuma dipake backend:
- `axios` (~50KB) - HTTP client untuk scraping
- `cheerio` (~200KB) - HTML parser untuk scraping
- `@upstash/redis` (~20KB) - Server-side caching

Total: **~270KB** yang gak perlu di frontend!

### 3. Separation of Concerns
- **Frontend** = UI only, call API
- **Backend** = Business logic, scraping, database

Sekarang masih campur aduk.

---

## 📊 Current State Analysis

### Backend API Routes (api-xtfetch) ✅
Semua API yang seharusnya ada di backend:

```
api-xtfetch/src/app/api/
├── route.ts                    # POST /api - Main download
├── proxy/route.ts              # GET /api/proxy - Media proxy
├── status/route.ts             # GET /api/status - Service status
├── playground/route.ts         # GET/POST /api/playground - Guest API
├── announcements/route.ts      # GET/POST/PUT/DELETE - Announcements
├── push/subscribe/route.ts     # POST/DELETE/GET - Push subscription
│
└── admin/                      # Admin APIs (auth required)
    ├── auth/route.ts           # POST - Admin login
    ├── services/route.ts       # GET/PUT - Platform management
    ├── stats/route.ts          # GET - Analytics
    ├── apikeys/route.ts        # GET/POST/DELETE - API keys
    ├── users/route.ts          # GET/PUT - User management
    ├── settings/route.ts       # GET/POST - Global settings
    ├── cache/route.ts          # GET/POST/DELETE - Cache management
    ├── alerts/route.ts         # GET/PUT/POST - Discord alerts
    ├── push/route.ts           # GET/POST - Push notifications
    ├── announcements/route.ts  # GET - Admin announcements
    ├── playground-examples/    # GET/POST/DELETE - Playground examples
    ├── browser-profiles/       # GET/POST - Browser profiles
    │   └── [id]/route.ts       # GET/PATCH/DELETE - Single profile
    ├── useragents/pool/        # GET/POST - User agent pool
    └── cookies/
        ├── route.ts            # GET/POST/DELETE - Legacy cookies
        ├── pool/route.ts       # GET/POST - Cookie pool
        ├── status/route.ts     # GET - Cookie status
        ├── health-check/       # GET/POST - Health check
        └── migrate/route.ts    # POST - Migration
```

**Total: 27 API endpoints di backend**

---

### Frontend API Routes (MASIH ADA - PERLU DIHAPUS) ❌

```
XTFetch-SocmedDownloader/src/app/api/
├── route.ts                    # ❌ DUPLICATE - Pindah ke backend
├── proxy/route.ts              # ❌ DUPLICATE - Pindah ke backend
├── status/route.ts             # ❌ DUPLICATE - Pindah ke backend
├── status/cookies/route.ts     # ❌ DUPLICATE - Pindah ke backend
├── playground/route.ts         # ❌ DUPLICATE - Pindah ke backend
├── announcements/route.ts      # ❌ DUPLICATE - Pindah ke backend
├── push/subscribe/route.ts     # ❌ DUPLICATE - Pindah ke backend
├── settings/update-prompt/     # ❌ DUPLICATE - Data dari global_settings
│
├── download/route.ts           # ❌ LEGACY - Gak dipake
├── download/[platform]/        # ❌ LEGACY - Gak dipake
├── facebook/fetch-source/      # ❌ LEGACY - Internal helper
├── tiktok/route.ts             # ❌ LEGACY - Gak dipake
├── twitter/route.ts            # ❌ LEGACY - Gak dipake
├── weibo/route.ts              # ❌ LEGACY - Gak dipake
├── meta/route.ts               # ❓ CEK - URL metadata
├── auth/discord/route.ts       # ❓ CEK - Discord OAuth
│
└── admin/                      # ❌ SEMUA DUPLICATE
    └── (semua routes)          # Sudah ada di backend
```

**Total: ~40+ API routes yang perlu dihapus dari frontend**

---

## 🔍 Frontend API Calls Audit

### Hooks yang Sudah Call Backend ✅

| Hook | Endpoint | Status |
|------|----------|--------|
| `useAdminFetch` | `${API_URL}/api/admin/*` | ✅ Centralized |
| `useAnnouncements` | `${API_URL}/api/announcements` | ✅ Centralized |
| `useStatus` | `${API_URL}/api/status` | ✅ Centralized |
| `useCookieStatus` | `${API_URL}/api/admin/cookies/status` | ✅ Centralized |
| `useUpdatePrompt` | `${API_URL}/api/admin/settings` | ✅ Centralized |
| `usePlayground` | `${API_URL}/api/playground` | ✅ Centralized |

### Pages yang Sudah Call Backend ✅

| Page | Endpoint | Status |
|------|----------|--------|
| `page.tsx` (Home) | `${API_URL}/api` | ✅ Centralized |
| `share/page.tsx` | `${API_URL}/api` | ✅ Centralized |
| `advanced/page.tsx` | Uses `getProxyUrl()` | ✅ Centralized |

### Components yang Sudah Call Backend ✅

| Component | Usage | Status |
|-----------|-------|--------|
| `MediaGallery.tsx` | `getProxyUrl()` | ✅ Centralized |
| `DownloadPreview.tsx` | `getProxyUrl()` | ✅ Centralized |
| `OptimizedImage.tsx` | `getProxyUrl()` | ✅ Centralized |

---

## 🗑️ Files to Delete from Frontend

### 1. API Routes (HAPUS SEMUA)

```bash
# Hapus semua API routes
rm -rf src/app/api/
```

**Atau kalau mau selective:**

```
DELETE: src/app/api/
├── route.ts                    # Main download
├── proxy/                      # Media proxy
├── status/                     # Service status
├── playground/                 # Guest API
├── announcements/              # Announcements
├── push/                       # Push subscription
├── settings/                   # Settings
├── download/                   # Legacy download
├── facebook/                   # FB helper
├── tiktok/                     # TikTok
├── twitter/                    # Twitter
├── weibo/                      # Weibo
├── meta/                       # URL metadata
├── auth/                       # Discord OAuth
└── admin/                      # Admin APIs (semua)
```

### 2. Core Modules (HAPUS - Backend Only)

```
DELETE: src/core/
├── scrapers/                   # Platform scrapers
├── security/                   # Encryption, rate limit
├── database/                   # Supabase client
└── config/                     # Constants
```

### 3. Lib Services (HAPUS - Backend Only)

```
DELETE: src/lib/
├── services/                   # Scraper implementations
├── cookies/                    # Cookie management
├── http/                       # HTTP client
├── url/                        # URL processing
└── redis.ts                    # Redis client
```

### 4. Middleware (HAPUS)

```
DELETE: src/middleware.ts       # Rate limiting, CORS (backend handles)
```

---

## 📦 Dependencies to Remove

### Current Frontend Dependencies

```json
{
  "dependencies": {
    // KEEP - UI & Framework
    "next": "^16.0.10",
    "react": "^19.2.1",
    "react-dom": "^19.2.1",
    "framer-motion": "^12.18.1",
    "lucide-react": "^0.511.0",
    "@fortawesome/*": "...",
    "sweetalert2": "^11.21.0",
    "next-intl": "^4.1.0",
    "swr": "^2.3.3",
    
    // KEEP - Client-side storage
    "idb": "^8.0.3",
    
    // KEEP - Media playback
    "hls.js": "^1.6.5",
    
    // KEEP - Auth (client-side)
    "@supabase/supabase-js": "^2.87.3",
    
    // ❌ REMOVE - Backend only
    "axios": "^1.7.9",              // Backend HTTP client
    "cheerio": "^1.0.0",            // HTML parsing
    "@upstash/redis": "^1.35.8",    // Redis caching
    
    // ❓ CHECK - Mungkin masih dipake
    "@vercel/analytics": "^1.6.1",  // Keep for frontend analytics
  }
}
```

### Dependencies to Remove

```bash
npm uninstall axios cheerio @upstash/redis
```

**Kenapa hapus ini?**

| Dependency | Size | Alasan Hapus |
|------------|------|--------------|
| `axios` | ~50KB | HTTP client untuk scraping - backend only |
| `cheerio` | ~200KB | HTML parser untuk scraping - backend only |
| `@upstash/redis` | ~20KB | Server-side caching - backend only |

**Yang TETAP di frontend:**
- `@supabase/supabase-js` - Auth (login/logout di client)
- `swr` - Data fetching & caching di client
- `hls.js` - Video playback
- `idb` - IndexedDB untuk history

**Estimated size reduction: ~270KB dari bundle**

---

## 🏷️ Backend Renaming Suggestions

Beberapa file/folder di backend namanya kurang jelas. Saran rename:

### API Routes

| Current | Suggested | Alasan |
|---------|-----------|--------|
| `/api/route.ts` | `/api/download/route.ts` | Lebih jelas ini endpoint download |
| `/api/admin/cookies/route.ts` | `/api/admin/cookies/legacy/route.ts` | Bedain dari pool |
| `/api/admin/push/route.ts` | `/api/admin/notifications/route.ts` | Lebih deskriptif |
| `/api/admin/alerts/route.ts` | `/api/admin/discord-alerts/route.ts` | Jelas ini Discord |

### Lib Modules

| Current | Suggested | Alasan |
|---------|-----------|--------|
| `lib/integrations/admin-alerts.ts` | `lib/integrations/discord-webhook.ts` | Lebih jelas |
| `lib/utils/admin-cookie.ts` | `lib/utils/legacy-cookie.ts` | Bedain dari pool |
| `lib/http/anti-ban.ts` | `lib/http/browser-profiles.ts` | Lebih deskriptif |

### Core Modules

| Current | Suggested | Alasan |
|---------|-----------|--------|
| `core/scrapers/index.ts` | OK | Udah jelas |
| `core/security/index.ts` | OK | Udah jelas |
| `core/database/index.ts` | OK | Udah jelas |

**Note:** Rename ini optional, bisa dilakukan nanti setelah cleanup frontend.

---

## ❓ FAQ

---

## 📋 Cleanup Checklist

### Phase 1: Delete API Routes
- [ ] Delete `src/app/api/` folder entirely
- [ ] Verify frontend still builds

### Phase 2: Delete Core Modules
- [ ] Delete `src/core/` folder
- [ ] Delete `src/lib/services/`
- [ ] Delete `src/lib/cookies/`
- [ ] Delete `src/lib/http/`
- [ ] Delete `src/lib/url/`
- [ ] Delete `src/lib/redis.ts`
- [ ] Delete `src/middleware.ts`
- [ ] Fix any import errors

### Phase 3: Remove Dependencies
- [ ] `npm uninstall axios cheerio @upstash/redis`
- [ ] Update `package.json`
- [ ] Verify build still works

### Phase 4: Verify
- [ ] Run `npm run build`
- [ ] Test all pages load
- [ ] Test download flow
- [ ] Test admin panel

---

## 🔄 API Flow After Cleanup

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (xt-fetch.vercel.app)               │
├─────────────────────────────────────────────────────────────────┤
│  Pages:                                                         │
│  ├── / (Home)           → POST ${API_URL}/api                   │
│  ├── /share             → POST ${API_URL}/api                   │
│  ├── /advanced          → Uses getProxyUrl()                    │
│  ├── /admin/*           → Uses useAdminFetch()                  │
│  └── /settings          → Uses useStatus(), useCookieStatus()   │
│                                                                 │
│  Hooks (all call backend):                                      │
│  ├── useAdminFetch      → ${API_URL}/api/admin/*                │
│  ├── useAnnouncements   → ${API_URL}/api/announcements          │
│  ├── useStatus          → ${API_URL}/api/status                 │
│  ├── useCookieStatus    → ${API_URL}/api/admin/cookies/status   │
│  ├── useUpdatePrompt    → ${API_URL}/api/admin/settings         │
│  └── usePlayground      → ${API_URL}/api/playground             │
│                                                                 │
│  Lib:                                                           │
│  ├── /lib/api/client.ts → API client wrapper                    │
│  ├── /lib/api/proxy.ts  → getProxyUrl() helper                  │
│  ├── /lib/storage/      → IndexedDB, localStorage               │
│  └── /lib/swr/          → SWR config                            │
│                                                                 │
│  NO API ROUTES - Pure UI                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (CORS)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (api-xtfetch.vercel.app)              │
├─────────────────────────────────────────────────────────────────┤
│  All API Routes:                                                │
│  ├── /api                 → Main download                       │
│  ├── /api/proxy           → Media proxy                         │
│  ├── /api/status          → Service status                      │
│  ├── /api/playground      → Guest API                           │
│  ├── /api/announcements   → Public announcements                │
│  ├── /api/push/subscribe  → Push subscription                   │
│  └── /api/admin/*         → All admin APIs                      │
│                                                                 │
│  Core:                                                          │
│  ├── /core/scrapers/      → Platform scrapers                   │
│  ├── /core/security/      → Encryption, auth                    │
│  ├── /core/database/      → Supabase client                     │
│  └── /core/config/        → Constants                           │
│                                                                 │
│  Lib:                                                           │
│  ├── /lib/services/       → Scraper implementations             │
│  ├── /lib/cookies/        → Cookie pool                         │
│  ├── /lib/http/           → HTTP client, anti-ban               │
│  └── /lib/url/            → URL processing                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SUPABASE + REDIS                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ Things to Check Before Cleanup

### 1. ~~Discord OAuth (`/api/auth/discord`)~~ ❌ HAPUS
Gak dipake. Discord webhook udah ada di backend (`lib/integrations/admin-alerts.ts`).

### 2. Meta Route (`/api/meta`)
Cek apakah masih dipake untuk URL preview. Kalau iya, perlu pindah ke backend.

### 3. Supabase Client di Frontend
Frontend masih butuh `@supabase/supabase-js` untuk:
- Auth (login/logout)
- Real-time subscriptions (kalau ada)

Jadi JANGAN hapus Supabase dari frontend.

---

## ❓ FAQ

### Q: Kenapa hapus axios dari frontend?
**A:** Axios cuma dipake buat HTTP requests ke external APIs (scraping). Frontend cukup pake `fetch()` native untuk call backend API. Lebih ringan, gak perlu deps tambahan.

### Q: Discord webhook masih ada kan?
**A:** Iya! Discord webhook ada di backend:
- `api-xtfetch/src/lib/integrations/admin-alerts.ts` - Kirim alert ke Discord
- `api-xtfetch/src/app/api/admin/alerts/route.ts` - API untuk config webhook

Fitur:
- Error spike alert
- Cookie pool low alert
- Platform down alert
- Test webhook

### Q: Gimana kalau frontend butuh call API yang belum ada di backend?
**A:** Tambahin di backend dulu, baru call dari frontend. Jangan bikin API route di frontend lagi.

### Q: Supabase auth gimana?
**A:** Tetap di frontend. Flow:
1. User login via Supabase Auth (frontend)
2. Dapat JWT token
3. Kirim token ke backend via `Authorization: Bearer <token>`
4. Backend verify token via Supabase

---

## 🚀 Execution Plan

### Step 1: Backup
```bash
git add -A
git commit -m "chore: before frontend cleanup"
git tag v1.2.2-before-cleanup
```

### Step 2: Delete API Routes
```bash
# Hapus semua API routes dari frontend
rm -rf src/app/api/
```

### Step 3: Delete Backend-Only Modules
```bash
# Core modules (scraping, security, database)
rm -rf src/core/

# Lib modules (services, cookies, http, url)
rm -rf src/lib/services/
rm -rf src/lib/cookies/
rm -rf src/lib/http/
rm -rf src/lib/url/
rm -f src/lib/redis.ts
rm -f src/lib/supabase.ts  # Backend punya sendiri

# Middleware (rate limiting handled by backend)
rm -f src/middleware.ts
```

### Step 4: Fix Import Errors
Setelah delete, mungkin ada import yang broken. Fix satu-satu.

### Step 5: Remove Dependencies
```bash
npm uninstall axios cheerio @upstash/redis
```

### Step 6: Build Test
```bash
npm run build
```

### Step 7: Manual Test
- [ ] Home page loads
- [ ] Download works
- [ ] Admin panel works
- [ ] Settings page works

### Step 8: Deploy
```bash
git add -A
git commit -m "chore: cleanup frontend - remove backend code"
git push
```

---

## 📁 Final Frontend Structure (After Cleanup)

```
XTFetch-SocmedDownloader/src/
├── app/                        # Next.js App Router
│   ├── (pages)/                # Public pages
│   ├── admin/                  # Admin pages (UI only)
│   ├── auth/                   # Auth pages
│   ├── docs/                   # Documentation
│   ├── layout.tsx
│   └── globals.css
│   # NO /api folder!
│
├── components/                 # React components
│   ├── ui/
│   ├── media/
│   └── admin/
│
├── hooks/                      # React hooks (call backend API)
│   ├── admin/
│   ├── useAnnouncements.ts
│   ├── useStatus.ts
│   └── ...
│
├── lib/                        # Utilities
│   ├── api/                    # API client (call backend)
│   │   ├── client.ts
│   │   ├── proxy.ts
│   │   └── types.ts
│   ├── storage/                # Client-side storage
│   │   ├── indexeddb.ts
│   │   └── localStorage.ts
│   ├── swr/                    # SWR config
│   └── utils/                  # UI utilities only
│       ├── format-utils.ts
│       └── ...
│   # NO services/, cookies/, http/, url/, redis.ts!
│
├── i18n/                       # Internationalization
└── types/                      # TypeScript types
```

---

*Proposal ini sudah di-review. Mau langsung eksekusi?*
