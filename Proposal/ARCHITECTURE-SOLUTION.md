# XTFetch Architecture Solution

## ✅ KESIMPULAN: Setup Sudah Benar!

Setelah review code, **arsitektur sudah benar**:

```
Frontend (Vercel)                    Backend (Railway)
┌─────────────────────┐              ┌─────────────────────┐
│ Admin Panel UI      │──────────────│ /api/admin/*        │
│                     │  HTTP calls  │                     │
│ NEXT_PUBLIC_API_URL │  + Bearer    │ Supabase SERVICE    │
│ = Railway URL       │  token       │ ROLE KEY            │
└─────────────────────┘              └─────────────────────┘
                                              │
                                              ▼
                                     ┌─────────────────────┐
                                     │ Supabase Database   │
                                     │ admin_cookie_pool   │
                                     └─────────────────────┘
```

Frontend admin panel **SUDAH** call backend API:
```typescript
// XTFetch-SocmedDownloader/src/app/admin/cookies/page.tsx
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const res = await fetch(`${API_URL}/api/admin/cookies/pool`, { headers: getAuthHeaders() });
```

---

## 🔧 YANG PERLU DI-CHECK

### 1. Frontend `.env` (Vercel)
```env
NEXT_PUBLIC_API_URL=https://xtfetch-api-production.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 2. Backend `.env` (Railway)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Security
ENCRYPTION_KEY=your-32-byte-hex-key

# Optional
REDIS_URL=redis://...
```

### 3. Supabase Tables
Pastikan tables exist:
- `admin_cookie_pool` - Cookie pool dengan encryption
- `admin_cookies` - Legacy single cookie (fallback)

---

## 🧪 CARA TEST

### Step 1: Test Backend Debug Endpoint
```bash
curl https://xtfetch-api-production.up.railway.app/api/v1/debug/cookies
```

Expected response jika tidak ada cookies:
```json
{
  "success": true,
  "summary": {
    "totalCookies": 0,
    "healthyCookies": 0,
    "platformsWithCookies": [],
    "platformsWithoutCookies": ["facebook", "instagram", "twitter", "weibo", "tiktok", "youtube"]
  }
}
```

### Step 2: Test Cookie untuk Platform
```bash
curl -X POST https://xtfetch-api-production.up.railway.app/api/v1/debug/test-cookie \
  -H "Content-Type: application/json" \
  -d '{"platform": "facebook"}'
```

### Step 3: Add Cookie via Admin Panel
1. Login ke frontend admin panel
2. Go to Cookies page
3. Add cookie untuk Facebook
4. Check debug endpoint lagi

### Step 4: Test Scrape dengan Debug
```bash
curl -X POST https://xtfetch-api-production.up.railway.app/api/v1/debug/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.facebook.com/share/p/1aCxfCS6x8/", "debug": true}'
```

---

## 📋 CHECKLIST

### Frontend (Vercel)
- [ ] `NEXT_PUBLIC_API_URL` set ke Railway URL
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
- [ ] Redeploy setelah update env vars

### Backend (Railway)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] `ENCRYPTION_KEY` set (32-byte hex)
- [ ] Redeploy setelah update env vars

### Supabase
- [ ] `admin_cookie_pool` table exists
- [ ] RLS policies configured
- [ ] `cookie_pool_stats` view exists

---

## 🚀 QUICK FIX

Jika cookie dari frontend tidak sampai ke database, kemungkinan:

1. **Frontend belum set `NEXT_PUBLIC_API_URL`**
   - Check Vercel environment variables
   - Harus: `https://xtfetch-api-production.up.railway.app`

2. **Auth token tidak valid**
   - Login ulang di frontend
   - Check browser console untuk errors

3. **Backend tidak bisa connect ke Supabase**
   - Check Railway logs
   - Verify `SUPABASE_SERVICE_ROLE_KEY`

4. **CORS issue**
   - Backend harus allow frontend origin
   - Check middleware CORS config

---

## 📁 FILES REFERENCE

### Frontend Admin Cookie Management
- `XTFetch-SocmedDownloader/src/app/admin/cookies/page.tsx`
- `XTFetch-SocmedDownloader/src/app/admin/cookies/CookiePoolModal.tsx`

### Backend Cookie API
- `api-xtfetch/src/app/api/admin/cookies/pool/route.ts`
- `api-xtfetch/src/lib/utils/cookie-pool.ts`
- `api-xtfetch/src/lib/utils/admin-cookie.ts`

### Debug Endpoints (NEW)
- `api-xtfetch/src/app/api/v1/debug/cookies/route.ts`
- `api-xtfetch/src/app/api/v1/debug/scrape/route.ts`
- `api-xtfetch/src/app/api/v1/debug/test-cookie/route.ts`
