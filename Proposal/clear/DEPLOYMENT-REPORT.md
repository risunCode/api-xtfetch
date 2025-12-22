# XTFetch API - Deployment Report

**Date:** December 22, 2025  
**Status:** ✅ LIVE  
**Backend URL:** `https://xtfetch-api-production.up.railway.app`

---

## 📊 Executive Summary

Backend API berhasil di-deploy ke Railway dengan full YouTube support via yt-dlp. Semua platform scrapers functional, dengan YouTube sebagai highlight utama yang sekarang support semua format dari 144p sampai 4K.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                             │
│                 XTFetch-SocmedDownloader                         │
│                     Port: 3001                                   │
├─────────────────────────────────────────────────────────────────┤
│  • Next.js 16 + React 19                                        │
│  • Supabase Auth (ANON KEY only)                                │
│  • Calls backend via NEXT_PUBLIC_API_URL                        │
│  • Admin Panel UI                                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP + Bearer Token
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Railway)                             │
│                      api-xtfetch                                 │
│                     Port: 3002                                   │
├─────────────────────────────────────────────────────────────────┤
│  • Next.js 15.5.9 API Routes                                    │
│  • Supabase SERVICE_ROLE_KEY                                    │
│  • Redis (rate limiting)                                        │
│  • yt-dlp + Python (YouTube)                                    │
│  • Cookie Pool with AES-256-GCM encryption                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                    │
├─────────────────────────────────────────────────────────────────┤
│  • PostgreSQL Database                                          │
│  • Tables: users, api_keys, downloads, errors,                  │
│            admin_cookie_pool, service_config, etc.              │
│  • Row Level Security (RLS)                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🌐 API Endpoints

### Public Endpoints (No Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check + yt-dlp version |
| `/api/v1/playground` | GET/POST | Free testing (5 req/2min) |
| `/api/v1/status` | GET | Service status |
| `/api/v1/cookies` | GET | Cookie availability per platform |
| `/api/v1/announcements` | GET | Public announcements |
| `/api/v1/publicservices` | GET | Platform status |
| `/api/v1/proxy` | GET | Media proxy (CORS bypass) |

### Admin Endpoints (Bearer Token Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/cookies/pool` | CRUD | Cookie pool management |
| `/api/admin/services` | CRUD | Platform configuration |
| `/api/admin/apikeys` | CRUD | API key management |
| `/api/admin/users` | CRUD | User management |
| `/api/admin/announcements` | CRUD | Announcements |
| `/api/admin/settings` | CRUD | Global settings |
| `/api/admin/stats` | GET | Analytics |
| `/api/admin/cache` | DELETE | Clear cache |

---

## 🎬 Supported Platforms

| Platform | Status | Method | Cookie Required |
|----------|--------|--------|-----------------|
| **YouTube** | ✅ Active | yt-dlp | No |
| **Facebook** | ✅ Active | HTML Scraping | For private content |
| **Instagram** | ✅ Active | GraphQL + Embed | For private content |
| **Twitter/X** | ✅ Active | Syndication API | For private content |
| **TikTok** | ✅ Active | TikWM API | No |
| **Weibo** | ✅ Active | Mobile API | Yes |

---

## 🔧 Technical Details

### YouTube Implementation
- **Method:** yt-dlp subprocess
- **Script:** `scripts/ytdlp-extract.py`
- **Features:**
  - All formats (144p to 4K)
  - Audio extraction
  - Thumbnail
  - Duration, view count, like count
  - Channel info
- **Note:** Video URLs are IP-locked to Railway server

### Cookie System
- **Storage:** `admin_cookie_pool` table in Supabase
- **Encryption:** AES-256-GCM at rest
- **Rotation:** Automatic least-recently-used
- **Health Tracking:** healthy → cooldown → expired
- **Cooldown:** 30 minutes after rate limit

### Build Fixes Applied
1. **Supabase Client:** Changed from module-level to lazy initialization
2. **Python Command:** Uses `python` on Windows, `python3` on Linux
3. **yt-dlp:** Removed `cookiesfrombrowser` (not available on server)
4. **TypeScript:** Added as devDependency in Dockerfile

---

## 📁 Key Files

### Backend Core
```
api-xtfetch/
├── src/
│   ├── app/api/
│   │   ├── v1/playground/route.ts    # Main public API
│   │   ├── admin/cookies/pool/       # Cookie management
│   │   └── health/route.ts           # Health check
│   ├── lib/
│   │   ├── services/youtube.ts       # YouTube scraper
│   │   ├── utils/cookie-pool.ts      # Cookie rotation
│   │   └── supabase.ts               # Shared Supabase client
│   └── core/scrapers/                # All platform scrapers
├── scripts/
│   └── ytdlp-extract.py              # yt-dlp extraction
├── Dockerfile                         # Railway deployment
└── railway.json                       # Railway config
```

### Frontend Admin
```
XTFetch-SocmedDownloader/
├── src/app/admin/
│   ├── cookies/                      # Cookie pool UI
│   ├── services/                     # Platform config UI
│   └── settings/                     # Global settings UI
└── .env                              # NEXT_PUBLIC_API_URL
```

---

## 🧪 Test Commands

### Health Check
```bash
curl https://xtfetch-api-production.up.railway.app/api/health
```

### YouTube
```bash
curl "https://xtfetch-api-production.up.railway.app/api/v1/playground?url=https://www.youtube.com/watch?v=xLIdoc75ip0"
```

### Facebook
```bash
curl "https://xtfetch-api-production.up.railway.app/api/v1/playground?url=https://web.facebook.com/share/p/1AL31BNod8/"
```

### Instagram
```bash
curl "https://xtfetch-api-production.up.railway.app/api/v1/playground?url=https://www.instagram.com/p/DP0aG2qAWW3/"
```

### Twitter/X
```bash
curl "https://xtfetch-api-production.up.railway.app/api/v1/playground?url=https://x.com/bbqvsbbch300/status/2002700845528531099"
```

---

## ⚙️ Environment Variables

### Frontend (Vercel)
```env
NEXT_PUBLIC_API_URL=https://xtfetch-api-production.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### Backend (Railway)
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
ENCRYPTION_KEY=your-32-byte-hex-key
REDIS_URL=redis://... (optional)
```

---

## 📝 Changelog

### December 22, 2025
- ✅ Deployed backend to Railway
- ✅ Fixed Supabase client initialization (build errors)
- ✅ Fixed Python command for Linux
- ✅ Removed browser cookies from yt-dlp
- ✅ YouTube fully working via yt-dlp
- ✅ All platforms tested and functional

---

## 🚀 Next Steps

1. **Frontend Sync:** Ensure `NEXT_PUBLIC_API_URL` is set in Vercel
2. **Add Cookies:** Add platform cookies via Admin Panel for private content
3. **Monitor:** Check Railway logs for errors
4. **Proxy:** Implement video proxy for YouTube (URLs are IP-locked)

---

*Report generated by Kiro AI Assistant*
