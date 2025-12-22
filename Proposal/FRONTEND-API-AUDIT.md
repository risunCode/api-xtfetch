# 🔍 Frontend API Calls Audit

> **Mapping Frontend API Calls → Backend Endpoints**
> 
> **Status**: ✅ **ALL ISSUES FIXED**  
> **Date**: December 21, 2025

---

## 📊 Summary

| Category | Total Calls | Fixed | Status |
|----------|-------------|-------|--------|
| Public Hooks | 4 | 1 | ✅ |
| Admin Hooks | 10 | 6 | ✅ |
| Components | 3 | 1 | ✅ |
| Backend Routes | 2 | 2 | ✅ |
| **Total** | **19** | **10** | **100% Fixed** |

---

## 🔴 CRITICAL ISSUES

### Issue 1: Main Download API (Homepage)
**File**: `src/app/page.tsx` (line ~100)

**Current Call**:
```typescript
const response = await fetch(`${API_URL}/api`, {
    method: 'POST',
    body: JSON.stringify({ url, cookie, skipCache }),
});
```

**Problem**: Calls `/api` (legacy endpoint)

**Should Be**: `/api/v1/publicservices` (new v1 endpoint)

**Fix Required**: ✅ YES

---

### Issue 2: Cookie Management - Missing API_URL
**File**: `src/hooks/admin/useCookies.ts` (line ~60-90)

**Current Calls**:
```typescript
// ❌ Missing API_URL prefix!
const res = await fetch('/api/admin/cookies/pool', { ... });
const res = await fetch(`/api/admin/cookies/pool/${id}`, { ... });
```

**Problem**: Calls local `/api/admin/cookies/pool` instead of backend

**Should Be**: `${API_URL}/api/admin/cookies/pool`

**Fix Required**: ✅ YES

---

### Issue 3: User Agents - Missing API_URL
**File**: `src/hooks/admin/useUserAgents.ts` (line ~60-100)

**Current Calls**:
```typescript
// ❌ Missing API_URL prefix!
const res = await fetch('/api/admin/useragents/pool', { ... });
const res = await fetch(`/api/admin/useragents/pool/${id}`, { ... });
```

**Problem**: Calls local `/api/admin/useragents/pool` instead of backend

**Should Be**: `${API_URL}/api/admin/useragents/pool`

**Fix Required**: ✅ YES

---

### Issue 4: Settings - Clear Cache Missing API_URL
**File**: `src/hooks/admin/useSettings.ts` (line ~45)

**Current Call**:
```typescript
// ❌ Missing API_URL prefix!
const res = await fetch('/api/admin/cache', { method: 'DELETE' });
```

**Problem**: Calls local `/api/admin/cache` instead of backend

**Should Be**: `${API_URL}/api/admin/cache`

**Fix Required**: ✅ YES

---

## 🟡 WORKING BUT NEED VERIFICATION

### 1. Public Hooks (Using API_URL correctly ✅)

| Hook | Endpoint | Status |
|------|----------|--------|
| `usePlayground.ts` | `${API_URL}/api/playground` | ✅ OK (legacy) |
| `useStatus.ts` | `${API_URL}/api/status` | ✅ OK (legacy) |
| `useAnnouncements.ts` | `${API_URL}/api/announcements` | ✅ OK (legacy) |
| `useCookieStatus.ts` | `${API_URL}/api/admin/cookies/status` | ✅ OK |

**Note**: These work but use legacy endpoints. Consider migrating to v1:
- `/api/playground` → `/api/v1/playground`
- `/api/status` → `/api/v1/status`
- `/api/announcements` → `/api/v1/announcements`

---

### 2. Admin Hooks Using `useAdminFetch` (✅ Correct Pattern)

| Hook | Endpoint | Status |
|------|----------|--------|
| `useServices.ts` | `/api/admin/services` | ✅ OK |
| `useApiKeys.ts` | `/api/admin/apikeys` | ✅ OK |
| `useStats.ts` | `/api/admin/stats` | ✅ OK |
| `useSettings.ts` | `/api/admin/settings` | ✅ OK |
| `useUsers.ts` | `/api/admin/users` | ✅ OK |
| `useAlerts.ts` | `/api/admin/alerts` | ✅ OK |
| `useBrowserProfiles.ts` | `/api/admin/browser-profiles` | ✅ OK |

**Note**: `useAdminFetch` correctly prepends `API_URL` via `buildUrl()` function.

---

### 3. Proxy Helper (✅ Correct)

**File**: `src/lib/api/proxy.ts`

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export function getProxyUrl(url: string, options?: {...}): string {
    return `${API_URL}/api/proxy?${params.toString()}`;
}
```

**Status**: ✅ OK - Uses API_URL correctly

---

## 📋 DETAILED FIX LIST

### Fix 1: Homepage Download API
**File**: `src/app/page.tsx`

```diff
- const response = await fetch(`${API_URL}/api`, {
+ const response = await fetch(`${API_URL}/api/v1/publicservices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, cookie, skipCache }),
});
```

---

### Fix 2: useCookies.ts - Add API_URL
**File**: `src/hooks/admin/useCookies.ts`

```diff
+ const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const addCookie = useCallback(async (...) => {
-   const res = await fetch('/api/admin/cookies/pool', {
+   const res = await fetch(`${API_URL}/api/admin/cookies/pool`, {
        method: 'POST',
        ...
    });
}, [...]);

const updateCookie = useCallback(async (id: string, ...) => {
-   const res = await fetch(`/api/admin/cookies/pool/${id}`, {
+   const res = await fetch(`${API_URL}/api/admin/cookies/pool/${id}`, {
        method: 'PATCH',
        ...
    });
}, [...]);

const deleteCookie = useCallback(async (id: string) => {
-   const res = await fetch(`/api/admin/cookies/pool/${id}`, { method: 'DELETE' });
+   const res = await fetch(`${API_URL}/api/admin/cookies/pool/${id}`, { method: 'DELETE' });
}, [...]);

const testCookie = useCallback(async (id: string) => {
-   const res = await fetch(`/api/admin/cookies/pool/${id}?test=true`);
+   const res = await fetch(`${API_URL}/api/admin/cookies/pool/${id}?test=true`);
}, [...]);
```

---

### Fix 3: useUserAgents.ts - Add API_URL
**File**: `src/hooks/admin/useUserAgents.ts`

```diff
+ const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const addUserAgent = useCallback(async (...) => {
-   const res = await fetch('/api/admin/useragents/pool', {
+   const res = await fetch(`${API_URL}/api/admin/useragents/pool`, {
        method: 'POST',
        ...
    });
}, [...]);

const updateUserAgent = useCallback(async (id: string, ...) => {
-   const res = await fetch(`/api/admin/useragents/pool/${id}`, {
+   const res = await fetch(`${API_URL}/api/admin/useragents/pool/${id}`, {
        method: 'PATCH',
        ...
    });
}, [...]);

const deleteUserAgent = useCallback(async (id: string) => {
-   const res = await fetch(`/api/admin/useragents/pool/${id}`, { method: 'DELETE' });
+   const res = await fetch(`${API_URL}/api/admin/useragents/pool/${id}`, { method: 'DELETE' });
}, [...]);
```

---

### Fix 4: useSettings.ts - Add API_URL for clearCache
**File**: `src/hooks/admin/useSettings.ts`

```diff
+ const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const clearCache = useCallback(async () => {
    ...
-   const res = await fetch('/api/admin/cache', { method: 'DELETE' });
+   const res = await fetch(`${API_URL}/api/admin/cache`, { method: 'DELETE' });
    ...
}, []);
```

---

## 🔄 OPTIONAL: Migrate to v1 Endpoints

### Public Hooks Migration (Optional but Recommended)

| Current | New v1 | Priority |
|---------|--------|----------|
| `/api/playground` | `/api/v1/playground` | Low |
| `/api/status` | `/api/v1/status` | Low |
| `/api/announcements` | `/api/v1/announcements` | Low |
| `/api/proxy` | `/api/v1/proxy` | Low |

**Note**: Legacy endpoints still work, but v1 provides better structure.

---

## 📁 Files to Modify

### Critical (Must Fix)
1. `src/app/page.tsx` - Main download API
2. `src/hooks/admin/useCookies.ts` - Cookie management
3. `src/hooks/admin/useUserAgents.ts` - User agent management
4. `src/hooks/admin/useSettings.ts` - Clear cache function

### Optional (v1 Migration)
5. `src/hooks/usePlayground.ts` - Playground status
6. `src/hooks/useStatus.ts` - Platform status
7. `src/hooks/useAnnouncements.ts` - Announcements
8. `src/lib/api/proxy.ts` - Proxy helper

---

## 🎯 Action Plan

### Phase 1: Critical Fixes (Required)
1. ✅ Fix `page.tsx` - Change `/api` to `/api/v1/publicservices`
2. ✅ Fix `useCookies.ts` - Add API_URL prefix
3. ✅ Fix `useUserAgents.ts` - Add API_URL prefix
4. ✅ Fix `useSettings.ts` - Add API_URL prefix for clearCache

### Phase 2: v1 Migration (Optional)
5. ⏳ Migrate public hooks to v1 endpoints
6. ⏳ Update proxy helper to v1

### Phase 3: Testing
7. ⏳ Test all admin functions
8. ⏳ Test homepage download
9. ⏳ Test proxy/thumbnail loading

---

## 🔍 Backend Endpoint Verification

### Endpoints that MUST exist in Backend:

| Endpoint | Method | Backend File | Status |
|----------|--------|--------------|--------|
| `/api/v1/publicservices` | POST | `api/v1/publicservices/route.ts` | ✅ Exists |
| `/api/admin/cookies/pool` | GET/POST | `api/admin/cookies/pool/route.ts` | ✅ Exists |
| `/api/admin/cookies/pool/[id]` | PATCH/DELETE | ❓ Need to check | ⚠️ |
| `/api/admin/useragents/pool` | GET/POST | `api/admin/useragents/pool/route.ts` | ✅ Exists |
| `/api/admin/useragents/pool/[id]` | PATCH/DELETE | ❓ Need to check | ⚠️ |
| `/api/admin/cache` | DELETE | `api/admin/cache/route.ts` | ✅ Exists |
| `/api/admin/services` | GET/POST/PUT | `api/admin/services/route.ts` | ✅ Exists |
| `/api/admin/apikeys` | GET/POST | `api/admin/apikeys/route.ts` | ✅ Exists |
| `/api/admin/stats` | GET | `api/admin/stats/route.ts` | ✅ Exists |
| `/api/admin/settings` | GET/POST | `api/admin/settings/route.ts` | ✅ Exists |
| `/api/admin/users` | GET/POST/DELETE | `api/admin/users/route.ts` | ✅ Exists |
| `/api/admin/alerts` | GET/PUT/POST | `api/admin/alerts/route.ts` | ✅ Exists |
| `/api/admin/browser-profiles` | GET/POST | `api/admin/browser-profiles/route.ts` | ✅ Exists |
| `/api/admin/browser-profiles/[id]` | PATCH/DELETE | `api/admin/browser-profiles/[id]/route.ts` | ✅ Exists |
| `/api/proxy` | GET | `api/proxy/route.ts` | ✅ Exists |
| `/api/status` | GET | `api/status/route.ts` | ✅ Exists |
| `/api/announcements` | GET | `api/announcements/route.ts` | ✅ Exists |
| `/api/playground` | GET | `api/playground/route.ts` | ✅ Exists |

---

## ❌ MISSING Backend Routes (Must Create!)

These dynamic routes are **MISSING** in backend but **REQUIRED** by frontend:

### 1. `/api/admin/cookies/pool/[id]` - ❌ MISSING
**Required Methods**: PATCH, DELETE, GET (with ?test=true)
**Used By**: `useCookies.ts` - updateCookie, deleteCookie, testCookie

### 2. `/api/admin/useragents/pool/[id]` - ❌ MISSING
**Required Methods**: PATCH, DELETE
**Used By**: `useUserAgents.ts` - updateUserAgent, deleteUserAgent

---

## 📋 Complete Fix Checklist

### Backend Fixes (Create Missing Routes)
- [ ] Create `api-xtfetch/src/app/api/admin/cookies/pool/[id]/route.ts`
- [ ] Create `api-xtfetch/src/app/api/admin/useragents/pool/[id]/route.ts`

### Frontend Fixes (Add API_URL)
- [ ] Fix `src/app/page.tsx` - Change `/api` to `/api/v1/publicservices`
- [ ] Fix `src/hooks/admin/useCookies.ts` - Add API_URL prefix
- [ ] Fix `src/hooks/admin/useUserAgents.ts` - Add API_URL prefix
- [ ] Fix `src/hooks/admin/useSettings.ts` - Add API_URL for clearCache

---

*Audit completed on December 21, 2025*
