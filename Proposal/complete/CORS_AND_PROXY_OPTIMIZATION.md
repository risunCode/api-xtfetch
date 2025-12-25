# 🔒 Proposal: CORS Security Fix

**Date:** December 25, 2024  
**Status:** PENDING REVIEW  
**Priority:** HIGH

---

## 📋 Architecture Overview

```
Frontend (Vercel)     : https://xt-fetch.vercel.app
Bridge (Vercel)       : https://api-xfetch.vercel.app
Backend (Railway)     : https://xtfetch-api-production.up.railway.app

Flow: Frontend → Bridge → Backend
      (Fixed hostname for frontend, backend can move anywhere)
```

---

## 🎯 CORS Security Enhancement

### Current State (MASALAH)

```typescript
// next.config.ts - TERLALU PERMISSIVE!
{ key: 'Access-Control-Allow-Origin', value: process.env.CORS_ORIGIN || '*' }
```

Saat ini CORS fallback ke `*` (allow all origins).

### Proposed Fix

#### Allowed Origins (Strict List)

```typescript
const ALLOWED_ORIGINS = [
    // Production
    'https://xt-fetch.vercel.app',        // Frontend
    'https://api-xfetch.vercel.app',      // Bridge
    'https://xtfetch.com',                // Custom domain
    'https://www.xtfetch.com',            // Custom domain www
    'https://xtfetch-api-production.up.railway.app', // Backend direct
    
    // Development
    'http://localhost:3001',              // Frontend dev
    'http://localhost:3002',              // Backend dev
    'http://localhost:3003',              // Bridge dev
];
```

#### CORS Behavior

| Request Type | Origin | Result |
|--------------|--------|--------|
| Browser from `xt-fetch.vercel.app` | ✅ Allowed | Access granted |
| Browser from `localhost:3001` | ✅ Allowed | Access granted |
| Browser from `random-site.com` | ❌ Blocked | No CORS header = browser blocks |
| Server-to-server (curl, API) | No origin | ✅ Allowed | Server calls work |
| Bridge to Backend | `api-xfetch.vercel.app` | ✅ Allowed | Bridge works |

---

## 📊 V1 Endpoints Access Matrix

| Endpoint | Auth Required | CORS | Notes |
|----------|---------------|------|-------|
| `GET /api/v1` | ✅ API Key | Strict | Premium API |
| `POST /api/v1/publicservices` | ❌ None | Strict | Free tier download |
| `GET /api/v1/proxy` | ❌ None | **Open** | Thumbnail sharing (public) |
| `GET /api/v1/status` | ❌ None | Strict | Platform status |
| `GET /api/v1/settings` | ❌ None | Strict | Public settings |
| `GET /api/v1/cookies` | ❌ None | Strict | Cookie status (boolean) |
| `POST /api/v1/playground` | ❌ None | Strict | Public testing |
| `POST /api/v1/push/*` | ❌ None | Strict | Push notifications |

**Note:** `/api/v1/proxy` tetap open CORS karena dipakai untuk share thumbnail ke platform lain.

---

## 🔧 Implementation

### File 1: `next.config.ts`

```typescript
// BEFORE
{ key: 'Access-Control-Allow-Origin', value: process.env.CORS_ORIGIN || '*' }

// AFTER - Remove this line, let middleware handle CORS dynamically
// Delete the Access-Control-Allow-Origin header from next.config.ts
```

### File 2: `middleware.ts`

Update `getCorsHeaders` function:

```typescript
function getCorsHeaders(origin: string | null, pathname: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Bridge-Secret',
        'Access-Control-Max-Age': '86400',
    };

    // Special case: /api/v1/proxy is open for thumbnail sharing
    if (pathname.startsWith('/api/v1/proxy')) {
        headers['Access-Control-Allow-Origin'] = '*';
        return headers;
    }

    // Strict CORS for other endpoints
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
    } else if (!origin) {
        // Server-to-server (no origin header) - allow
        headers['Access-Control-Allow-Origin'] = '*';
    }
    // Browser from unknown origin = NO Access-Control-Allow-Origin = blocked

    return headers;
}
```

---

## 🧪 Testing Checklist

### After Implementation

```bash
# ✅ Should work - allowed origin
curl -H "Origin: https://xt-fetch.vercel.app" \
     https://xtfetch-api-production.up.railway.app/api/v1/status

# ✅ Should work - localhost dev
curl -H "Origin: http://localhost:3001" \
     http://localhost:3002/api/v1/status

# ❌ Should be blocked - unknown origin (no CORS header in response)
curl -H "Origin: https://evil-site.com" \
     https://xtfetch-api-production.up.railway.app/api/v1/publicservices

# ✅ Should work - server-to-server (no origin)
curl https://xtfetch-api-production.up.railway.app/api/v1/status

# ✅ Should work - proxy is open
curl -H "Origin: https://any-site.com" \
     https://xtfetch-api-production.up.railway.app/api/v1/proxy?url=...
```

---

## 📁 Files to Modify

| File | Change |
|------|--------|
| `api-xtfetch/next.config.ts` | Remove `Access-Control-Allow-Origin: *` header |
| `api-xtfetch/src/middleware.ts` | Update `getCorsHeaders()` with strict logic |

---

## ⚠️ Important Notes

1. **Bridge tetap work** - `api-xfetch.vercel.app` ada di allowed list
2. **Proxy tetap public** - Untuk share thumbnail ke mana aja
3. **Server-to-server tetap work** - Curl, Postman, API integrations gak kena block
4. **Hanya browser dari unknown origin yang ke-block**

---

## 🚀 Streaming Optimization (SKIPPED)

Streaming optimization **tidak diperlukan** untuk setup ini karena:
- JSON responses kecil (<100KB)
- Video/media proxy langsung ke CDN, bukan lewat bridge
- Vercel serverless ada timeout limit

Bisa di-revisit kalau ada performance issue di kemudian hari.

---

**Author:** Kiro AI  
**Last Updated:** December 25, 2024
