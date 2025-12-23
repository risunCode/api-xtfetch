# API Routes Comparison - Legacy vs V1

Quick reference untuk melihat perbedaan antara legacy dan v1 endpoints.

---

## 🔴 DUPLICATE ROUTES (MUST FIX)

### 1. Status Endpoint

| Aspect | `/api/status` (Legacy) | `/api/v1/status` (V1) |
|--------|----------------------|---------------------|
| **Error Handling** | ❌ No try-catch | ✅ Proper try-catch |
| **Response Meta** | ❌ None | ✅ endpoint, timestamp, version |
| **API Docs** | ❌ None | ✅ Lists all endpoints |
| **CORS** | ❌ No OPTIONS | ✅ OPTIONS handler |
| **Used By** | `useStatus` hook, maintenance page | None yet |
| **Lines of Code** | 35 | 65 |
| **Recommendation** | 🗑️ **DELETE** | ✅ **USE THIS** |

**Response Comparison:**

```typescript
// Legacy /api/status
{
  success: true,
  data: {
    maintenance: false,
    maintenanceMessage: null,
    platforms: [...]
  }
}

// V1 /api/v1/status
{
  success: true,
  data: {
    maintenance: false,
    maintenanceMessage: null,
    platforms: [...],
    apiVersion: 'v1',
    endpoints: {
      premium: '/api/v1?key={API_KEY}&url={URL}',
      playground: '/api/v1/playground?url={URL}',
      // ... more endpoints
    }
  },
  meta: {
    endpoint: '/api/v1/status',
    timestamp: '2024-12-23T...',
    version: '1.0.0'
  }
}
```

---

### 2. Announcements Endpoint

| Aspect | `/api/announcements` (Legacy) | `/api/v1/announcements` (V1) |
|--------|----------------------------|---------------------------|
| **Methods** | ❌ GET, POST, PUT, DELETE (mixed) | ✅ GET only (public) |
| **Auth** | ⚠️ Admin check for mutations | ✅ No auth (read-only) |
| **Response Meta** | ❌ None | ✅ endpoint, page, count |
| **CORS** | ❌ No OPTIONS | ✅ OPTIONS handler |
| **Used By** | `useAnnouncements` hook | None yet |
| **Lines of Code** | 95 | 45 |
| **Recommendation** | 🗑️ **DELETE GET**, move mutations to `/api/admin/announcements` | ✅ **USE THIS** |

**Response Comparison:**

```typescript
// Legacy /api/announcements
{
  success: true,
  data: [...]
}

// V1 /api/v1/announcements
{
  success: true,
  data: [...],
  meta: {
    endpoint: '/api/v1/announcements',
    page: 'home',
    count: 3
  }
}
```

**Admin Operations:**
```typescript
// ❌ OLD: Mixed in /api/announcements
POST /api/announcements    // Create
PUT /api/announcements     // Update
DELETE /api/announcements  // Delete

// ✅ NEW: Separate admin endpoint (already exists!)
POST /api/admin/announcements    // Create
PUT /api/admin/announcements     // Update
DELETE /api/admin/announcements  // Delete
```

---

### 3. Push Subscribe Endpoint

| Aspect | `/api/push/subscribe` (Legacy) | `/api/v1/push/subscribe` (V1) |
|--------|------------------------------|----------------------------|
| **Error Messages** | ❌ Basic | ✅ Detailed with context |
| **Response Meta** | ❌ None | ✅ endpoint, message |
| **CORS** | ❌ No OPTIONS | ✅ OPTIONS handler |
| **Used By** | `push-notifications.ts` | None yet |
| **Lines of Code** | 85 | 145 |
| **Recommendation** | 🗑️ **DELETE** | ✅ **USE THIS** |

**Response Comparison:**

```typescript
// Legacy /api/push/subscribe
{
  success: true
}

// V1 /api/v1/push/subscribe
{
  success: true,
  meta: {
    endpoint: '/api/v1/push/subscribe',
    message: 'Successfully subscribed to push notifications'
  }
}
```

**Error Comparison:**

```typescript
// Legacy
{ success: false, error: 'Invalid subscription data' }

// V1
{
  success: false,
  error: 'Invalid subscription data - endpoint and keys required',
  meta: { endpoint: '/api/v1/push/subscribe' }
}
```

---

## ✅ UNIQUE ROUTES (NO DUPLICATES)

### Public V1 Routes

| Route | Purpose | Auth | Used By |
|-------|---------|------|---------|
| `/api/v1` | Premium API (key required) | API Key | External users |
| `/api/v1/publicservices` | Free homepage API | None | Homepage |
| `/api/v1/playground` | Testing API | None | Advanced page |
| `/api/v1/proxy` | Media proxy | None | Media preview |
| `/api/v1/youtube/merge` | YouTube HD merge | None | YouTube downloads |
| `/api/v1/chat` | AI chat | None | AI Chat component |
| `/api/v1/ads` | Public ads display | None | AdBannerCard |
| `/api/v1/cookies` | Cookie status | None | Cookie status check |

### Admin Routes

| Route | Purpose | Auth | Used By |
|-------|---------|------|---------|
| `/api/admin/ads` | Manage ads | Bearer | Admin panel |
| `/api/admin/alerts` | System alerts | Bearer | Admin panel |
| `/api/admin/announcements` | Manage announcements | Bearer | Admin panel |
| `/api/admin/apikeys` | API key management | Bearer | Admin panel |
| `/api/admin/auth` | Admin auth | Bearer | Admin login |
| `/api/admin/browser-profiles` | Browser fingerprints | Bearer | Admin panel |
| `/api/admin/cache` | Cache management | Bearer | Admin panel |
| `/api/admin/cookies` | Cookie management | Bearer | Admin panel |
| `/api/admin/gemini` | Gemini AI keys | Bearer | Admin panel |
| `/api/admin/push` | Push management | Bearer | Admin panel |
| `/api/admin/services` | Platform config | Bearer | Admin panel |
| `/api/admin/settings` | Global settings | Bearer | Admin panel |
| `/api/admin/stats` | Statistics | Bearer | Admin panel |
| `/api/admin/useragents` | User-Agent pool | Bearer | Admin panel |
| `/api/admin/users` | User management | Bearer | Admin panel |

### Infrastructure Routes

| Route | Purpose | Auth | Used By |
|-------|---------|------|---------|
| `/api/health` | Health check | None | Railway/Render |

---

## 📊 Code Duplication Stats

| Endpoint | Legacy LOC | V1 LOC | Duplicate LOC | Savings |
|----------|-----------|--------|---------------|---------|
| Status | 35 | 65 | 35 | -35 lines |
| Announcements | 95 | 45 | 45 | -45 lines |
| Push Subscribe | 85 | 145 | 85 | -85 lines |
| **TOTAL** | **215** | **255** | **165** | **-165 lines** |

**After cleanup:** Remove 165 lines of duplicate code!

---

## 🎯 Migration Impact

### Frontend Files to Update

```
XTFetch-SocmedDownloader/src/
├── hooks/
│   ├── useStatus.ts                    # /api/status → /api/v1/status
│   └── useAnnouncements.ts             # /api/announcements → /api/v1/announcements
├── lib/utils/
│   └── push-notifications.ts           # /api/push/subscribe → /api/v1/push/subscribe
└── app/
    └── maintenance/page.tsx            # Direct fetch to /api/v1/status
```

**Total Files:** 4 files  
**Estimated Time:** 30 minutes  
**Risk Level:** Low (SWR will handle caching)

---

## 🔄 Response Format Standardization

### Legacy Format (Inconsistent)
```typescript
// Sometimes has meta, sometimes doesn't
{ success: true, data: {...} }
{ success: false, error: 'message' }
```

### V1 Format (Consistent)
```typescript
// Always has meta
{
  success: true,
  data: {...},
  meta: {
    endpoint: '/api/v1/...',
    timestamp: '...',
    // ... other metadata
  }
}

{
  success: false,
  error: 'Detailed error message',
  meta: {
    endpoint: '/api/v1/...'
  }
}
```

---

## 🚦 Traffic Analysis (Estimated)

Based on frontend code analysis:

| Endpoint | Calls/Page Load | Pages Using | Total Calls/Session |
|----------|----------------|-------------|---------------------|
| `/api/status` | 1 | All pages (Sidebar) | ~5-10 |
| `/api/announcements` | 1 | Home, Admin | ~2-3 |
| `/api/push/subscribe` | 1 | On permission grant | ~0-1 |

**Total Legacy Traffic:** ~7-14 calls per user session

**Migration Impact:** Zero downtime (both endpoints work during transition)

---

## ✅ Quality Improvements in V1

### 1. Error Handling
```typescript
// Legacy: Basic
catch { return error }

// V1: Detailed
catch (error) {
  console.error('[Push v1] Subscribe error:', error);
  return NextResponse.json({
    success: false,
    error: 'Internal server error',
    meta: { endpoint: '/api/v1/push/subscribe' }
  }, { status: 500 });
}
```

### 2. CORS Support
```typescript
// Legacy: None

// V1: Full CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

### 3. Response Metadata
```typescript
// Legacy: None

// V1: Rich metadata
meta: {
  endpoint: '/api/v1/status',
  timestamp: new Date().toISOString(),
  version: '1.0.0',
  query: 'subscription_status'
}
```

---

## 🎯 Recommendation Summary

| Action | Priority | Effort | Impact |
|--------|----------|--------|--------|
| Migrate frontend to v1 | 🔴 High | 30 min | High |
| Add deprecation warnings | 🟡 Medium | 15 min | Medium |
| Monitor legacy usage | 🟡 Medium | 1 week | Low |
| Delete legacy routes | 🟢 Low | 5 min | High |

**Total Effort:** ~1 hour + 1 week monitoring  
**Total Benefit:** Cleaner codebase, better error handling, future-proof API

---

**Last Updated:** December 23, 2024  
**Next Review:** After frontend migration
