# API Routes Breakdown & Cookie Flow Analysis

## 🚨 MASALAH UTAMA

**Cookie yang di-set dari Frontend TIDAK sampai ke Backend!**

### Kenapa?
1. Frontend (`XTFetch-SocmedDownloader`) dan Backend (`api-xtfetch`) adalah **2 project terpisah**
2. Frontend di Vercel, Backend di Railway - **beda domain**
3. Cookie yang di-set di frontend **tidak otomatis dikirim** ke backend API

### Flow Sekarang (BROKEN):
```
Frontend (Vercel)                    Backend (Railway)
┌─────────────────┐                  ┌─────────────────┐
│ Admin Panel     │                  │ API Routes      │
│ Set Cookie ─────┼──X──────────────>│ getRotatingCookie()
│ (localStorage?) │  TIDAK SAMPAI!   │ → returns NULL  │
└─────────────────┘                  └─────────────────┘
```

---

## 📊 API ROUTES MAPPING

### Legacy Routes (Root Level) - DEPRECATED
| Route | Method | Auth | Status | Notes |
|-------|--------|------|--------|-------|
| `/api` | POST | No | ⚠️ Legacy | Main download endpoint |
| `/api/playground` | GET/POST | No | ⚠️ Legacy | Guest testing |
| `/api/proxy` | GET | No | ✅ Active | Media proxy |
| `/api/status` | GET | No | ✅ Active | Service status |
| `/api/health` | GET | No | ✅ Active | Health check |
| `/api/announcements` | GET | No | ✅ Active | Public announcements |
| `/api/push/subscribe` | POST | No | ⚠️ Legacy | Push subscription |

### V1 Routes (Versioned) - RECOMMENDED
| Route | Method | Auth | Status | Notes |
|-------|--------|------|--------|-------|
| `/api/v1` | POST | No | ✅ Active | Main download endpoint |
| `/api/v1/playground` | GET/POST | No | ✅ Active | Guest testing (5 req/2min) |
| `/api/v1/proxy` | GET | No | ✅ Active | Media proxy |
| `/api/v1/status` | GET | No | ✅ Active | Service status |
| `/api/v1/cookies` | GET | No | ✅ Active | Cookie availability status |
| `/api/v1/announcements` | GET | No | ✅ Active | Public announcements |
| `/api/v1/publicservices` | GET | No | ✅ Active | Platform status |
| `/api/v1/push/subscribe` | POST | No | ✅ Active | Push subscription |
| `/api/v1/chat` | POST | No | ✅ Active | AI chat (Gemini) |

### Admin Routes (Auth Required)
| Route | Method | Auth | Status | Notes |
|-------|--------|------|--------|-------|
| `/api/admin/auth` | POST | No | ✅ Active | Admin login |
| `/api/admin/cookies` | CRUD | Bearer | ✅ Active | Legacy single cookie |
| `/api/admin/cookies/pool` | CRUD | Bearer | ✅ Active | Cookie pool management |
| `/api/admin/cookies/migrate` | POST | Bearer | ✅ Active | Encrypt cookies |
| `/api/admin/cookies/health-check` | POST | Bearer | ✅ Active | Test cookie health |
| `/api/admin/cookies/status` | GET | Bearer | ✅ Active | Pool status |
| `/api/admin/services` | CRUD | Bearer | ✅ Active | Platform config |
| `/api/admin/apikeys` | CRUD | Bearer | ✅ Active | API key management |
| `/api/admin/users` | CRUD | Bearer | ✅ Active | User management |
| `/api/admin/announcements` | CRUD | Bearer | ✅ Active | Announcements |
| `/api/admin/push` | POST | Bearer | ✅ Active | Send push notifications |
| `/api/admin/stats` | GET | Bearer | ✅ Active | Analytics |
| `/api/admin/settings` | CRUD | Bearer | ✅ Active | Global settings |
| `/api/admin/cache` | DELETE | Bearer | ✅ Active | Clear cache |
| `/api/admin/alerts` | CRUD | Bearer | ✅ Active | Alert config |
| `/api/admin/gemini` | POST | Bearer | ✅ Active | AI config |
| `/api/admin/browser-profiles` | CRUD | Bearer | ✅ Active | Browser profiles |
| `/api/admin/useragents/pool` | CRUD | Bearer | ✅ Active | User agent pool |

---

## 🍪 COOKIE FLOW ANALYSIS

### Database Tables
```sql
-- Legacy single cookie (1 per platform)
admin_cookies (
    platform TEXT PRIMARY KEY,
    cookie TEXT,
    enabled BOOLEAN,
    note TEXT
)

-- Cookie pool (multiple per platform)
admin_cookie_pool (
    id UUID PRIMARY KEY,
    platform TEXT,
    cookie TEXT,          -- Encrypted with AES-256-GCM
    label TEXT,
    status TEXT,          -- healthy, cooldown, expired, disabled
    enabled BOOLEAN,
    use_count INT,
    success_count INT,
    error_count INT,
    last_used_at TIMESTAMP,
    cooldown_until TIMESTAMP
)
```

### Cookie Retrieval Flow
```
1. Scraper calls getAdminCookie(platform)
   ↓
2. getAdminCookie() calls getRotatingCookie(platform)
   ↓
3. getRotatingCookie() queries admin_cookie_pool:
   - WHERE platform = ?
   - AND enabled = true
   - AND status = 'healthy'
   - ORDER BY last_used_at ASC (least recently used)
   ↓
4. If found → decrypt & return cookie
   If not found → fallback to admin_cookies table
   ↓
5. Scraper uses cookie in HTTP headers
```

### Current Problem
```
Frontend Admin Panel                 Backend API
┌─────────────────────┐              ┌─────────────────────┐
│ POST /api/admin/    │              │                     │
│ cookies/pool        │──────────────│ Supabase Direct?    │
│                     │              │ OR                  │
│ Body: {             │              │ Backend API?        │
│   platform: 'fb',   │              │                     │
│   cookie: '...'     │              │                     │
│ }                   │              │                     │
└─────────────────────┘              └─────────────────────┘
                                              │
                                              ▼
                                     ┌─────────────────────┐
                                     │ Supabase            │
                                     │ admin_cookie_pool   │
                                     │ table               │
                                     └─────────────────────┘
```

---

## 🔧 SOLUSI

### Option 1: Frontend calls Backend API (RECOMMENDED)
Frontend harus call backend API untuk manage cookies:

```typescript
// Frontend: src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL; // Railway URL

export async function addCookieToPool(platform: string, cookie: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/cookies/pool`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ platform, cookie }),
    });
    return res.json();
}
```

### Option 2: Frontend direct to Supabase
Frontend bisa langsung insert ke Supabase, tapi:
- ❌ Tidak ada encryption (backend handles encryption)
- ❌ Bypass validation
- ❌ Security risk

---

## 🧪 TEST ROUTES YANG DIBUTUHKAN

### 1. Debug Cookie Status
```
GET /api/v1/debug/cookies
```
Returns:
- Cookie pool stats per platform
- Which cookies are healthy/cooldown/expired
- Last used timestamps

### 2. Test Scraper with Cookie
```
POST /api/v1/debug/scrape
Body: {
    url: "https://facebook.com/...",
    forceCookie: true,  // Force use cookie even if not needed
    debug: true         // Return debug info
}
```
Returns:
- Cookie used (masked)
- Request headers sent
- Response status
- Scraper result

### 3. Cookie Health Check
```
POST /api/v1/debug/cookie-test
Body: {
    platform: "facebook",
    testUrl: "https://facebook.com/..."
}
```
Returns:
- Cookie found: yes/no
- Cookie status
- Test request result

---

## 📝 ACTION ITEMS

1. **Create debug routes** untuk testing
2. **Verify frontend** calls backend API (bukan direct Supabase)
3. **Check Supabase** apakah ada data di `admin_cookie_pool`
4. **Add logging** di `getRotatingCookie()` untuk debug

---

## 🔍 QUICK DEBUG COMMANDS

### Check if cookies exist in database
```sql
SELECT platform, status, enabled, 
       LEFT(cookie, 20) as cookie_preview,
       use_count, success_count, error_count
FROM admin_cookie_pool
ORDER BY platform;
```

### Check legacy cookies
```sql
SELECT platform, enabled, 
       LEFT(cookie, 20) as cookie_preview
FROM admin_cookies;
```

---

## ✅ DEBUG ROUTES CREATED

### 1. Cookie Status
```
GET /api/v1/debug/cookies
```
Returns all cookie pool status per platform.

**Test:**
```bash
curl https://xtfetch-api-production.up.railway.app/api/v1/debug/cookies
```

### 2. Debug Scrape
```
POST /api/v1/debug/scrape
Body: { "url": "https://facebook.com/...", "debug": true }
```
Returns scraper result with debug info (cookie used, timing, etc).

**Test:**
```bash
curl -X POST https://xtfetch-api-production.up.railway.app/api/v1/debug/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.facebook.com/share/p/1aCxfCS6x8/", "debug": true}'
```

### 3. Test Cookie
```
POST /api/v1/debug/test-cookie
Body: { "platform": "facebook" }
```
Tests if cookies exist and are accessible for a platform.

**Test:**
```bash
curl -X POST https://xtfetch-api-production.up.railway.app/api/v1/debug/test-cookie \
  -H "Content-Type: application/json" \
  -d '{"platform": "facebook"}'
```

---

## 📌 NEXT STEPS

1. ✅ Debug routes created
2. Deploy ke Railway
3. Test debug endpoints
4. Check Supabase data
5. Fix frontend cookie management if needed
