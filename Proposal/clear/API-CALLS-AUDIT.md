# XTFetch - Frontend API Calls Audit

**Date:** December 22, 2025  
**Scope:** All API calls from Frontend to Backend

---

## 📊 Summary

| Category | Count | Status |
|----------|-------|--------|
| V1 Endpoints (Correct) | 8 | ✅ |
| Admin Endpoints (Correct) | 15 | ✅ |
| Legacy Endpoints (WRONG) | 4 | ✅ FIXED |
| Documentation References | ~10 | ⚠️ UPDATE DOCS |

---

## ✅ V1 ENDPOINTS (CORRECT)

These are using the correct `/api/v1/*` pattern:

| File | Endpoint | Method |
|------|----------|--------|
| `src/app/page.tsx` | `/api/v1/publicservices` | GET |
| `src/app/advanced/page.tsx` | `/api/v1/playground` | POST |
| `src/app/maintenance/page.tsx` | `/api/v1/status` | GET |
| `src/components/ai/AIChat.tsx` | `/api/v1/chat` | POST |
| `src/hooks/useAnnouncements.ts` | `/api/v1/announcements` | GET |
| `src/hooks/useCookieStatus.ts` | `/api/v1/cookies` | GET |
| `src/hooks/usePlayground.ts` | `/api/v1/playground` | GET |
| `src/hooks/useStatus.ts` | `/api/v1/status` | GET |
| `src/lib/api/proxy.ts` | `/api/v1/proxy` | GET |
| `src/lib/utils/hls-downloader.ts` | `/api/v1/proxy` | GET |
| `src/lib/utils/push-notifications.ts` | `/api/v1/push/subscribe` | POST |
| `src/lib/utils/thumbnail-utils.ts` | `/api/v1/proxy` | GET |

---

## ✅ ADMIN ENDPOINTS (CORRECT)

These are using the correct `/api/admin/*` pattern:

| File | Endpoint | Method |
|------|----------|--------|
| `src/app/admin/communications/page.tsx` | `/api/admin/announcements` | GET/POST |
| `src/app/admin/communications/page.tsx` | `/api/admin/push` | GET/POST |
| `src/app/admin/cookies/page.tsx` | `/api/admin/cookies/pool` | GET |
| `src/app/admin/cookies/CookiePoolModal.tsx` | `/api/admin/cookies/pool` | CRUD |
| `src/app/admin/services/page.tsx` | `/api/admin/services` | GET/PATCH |
| `src/app/admin/services/page.tsx` | `/api/admin/settings` | GET/PATCH |
| `src/app/admin/settings/page.tsx` | `/api/admin/cache` | DELETE |
| `src/app/admin/settings/page.tsx` | `/api/admin/cookies/migrate` | POST |
| `src/app/admin/users/page.tsx` | `/api/admin/users` | CRUD |
| `src/hooks/admin/useAlerts.ts` | `/api/admin/alerts` | GET |
| `src/hooks/admin/useAlerts.ts` | `/api/admin/cookies/health-check` | POST |
| `src/hooks/admin/useApiKeys.ts` | `/api/admin/apikeys` | CRUD |
| `src/hooks/admin/useBrowserProfiles.ts` | `/api/admin/browser-profiles` | CRUD |
| `src/hooks/admin/useCookies.ts` | `/api/admin/cookies/pool` | CRUD |
| `src/hooks/admin/useGeminiKeys.ts` | `/api/admin/gemini` | CRUD |
| `src/hooks/admin/useServices.ts` | `/api/admin/services` | GET |
| `src/hooks/admin/useSettings.ts` | `/api/admin/settings` | GET |
| `src/hooks/admin/useSettings.ts` | `/api/admin/cache` | DELETE |
| `src/hooks/admin/useStats.ts` | `/api/admin/stats` | GET |
| `src/hooks/admin/useUserAgents.ts` | `/api/admin/useragents/pool` | CRUD |
| `src/hooks/admin/useUsers.ts` | `/api/admin/users` | GET |
| `src/hooks/useUpdatePrompt.ts` | `/api/admin/settings` | GET |

---

## ⚠️ LEGACY ENDPOINTS (NEEDS FIX)

These are using OLD `/api/*` pattern instead of `/api/v1/*`:

### 1. `src/app/admin/communications/page.tsx`

**Lines 109, 131, 136:**
```typescript
// WRONG - Legacy
fetch(`${API_URL}/api/announcements`, { ... })
fetch(`${API_URL}/api/announcements?id=${id}`, { method: 'DELETE', ... })

// SHOULD BE
fetch(`${API_URL}/api/v1/announcements`, { ... })
```

### 2. `src/lib/utils/discord-webhook.ts`

**Line 145:**
```typescript
// WRONG - Legacy
return `${getBaseUrl()}/api/proxy?url=${...}`;

// SHOULD BE
return `${getBaseUrl()}/api/v1/proxy?url=${...}`;
```

---

## ⚠️ DOCUMENTATION REFERENCES (UPDATE)

These files reference legacy endpoints in documentation/UI:

### `src/app/advanced/page.tsx`
```typescript
// Line 291 - UI text shows legacy
<code>/api/playground?url=...</code>

// Line 297 - UI text shows legacy
<span>/api/playground</span>
```

### `src/app/docs/api/ApiOverviewPage.tsx`
```typescript
// Line 11
const PLAYGROUND_ENDPOINT = '/api/playground';

// Line 111
Use <code>/api/playground</code> for testing.
```

### `src/app/docs/api/endpoints/EndpointsPage.tsx`
```typescript
// Line 10
const PLAYGROUND_ENDPOINT = '/api/playground';

// Lines 84, 91, 102
<EndpointCard method="POST" path="/api/playground" ... />
{BASE_URL}/api/playground?url=...

// Lines 295, 302
<EndpointCard method="GET" path="/api/status" ... />

// Lines 323, 330
<EndpointCard method="GET" path="/api/proxy" ... />
```

### `src/app/docs/guides/api-keys/ApiKeysGuidePage.tsx`
```typescript
// Line 157
Use <code>/api/playground</code> instead.
```

---

## 🔧 FILES FIXED ✅

### Frontend - API Calls Updated
| File | Change |
|------|--------|
| `src/app/admin/communications/page.tsx` | `/api/announcements` → `/api/admin/announcements` (3x) |
| `src/lib/utils/discord-webhook.ts` | `/api/proxy` → `/api/v1/proxy` |

### Backend - Legacy Routes Deleted
| Route | Status |
|-------|--------|
| `/api/playground/route.ts` | ❌ Deleted (use `/api/v1/playground`) |
| `/api/proxy/route.ts` | ❌ Deleted (use `/api/v1/proxy`) |
| `/api/route.ts` | ❌ Deleted (use `/api/v1`) |

### Backend - Legacy Routes Kept (Non-downloader)
| Route | Reason |
|-------|--------|
| `/api/announcements` | Public announcements |
| `/api/health` | Health check |
| `/api/status` | Service status |
| `/api/push` | Push notifications |
| `/api/admin/*` | Admin routes |

---

## 📋 BACKEND ENDPOINT MAPPING

### V1 Public Endpoints (No Auth)
| Frontend Calls | Backend Route | Status |
|----------------|---------------|--------|
| `/api/v1/playground` | ✅ Exists | OK |
| `/api/v1/status` | ✅ Exists | OK |
| `/api/v1/cookies` | ✅ Exists | OK |
| `/api/v1/announcements` | ✅ Exists | OK |
| `/api/v1/proxy` | ✅ Exists | OK |
| `/api/v1/publicservices` | ✅ Exists | OK |
| `/api/v1/push/subscribe` | ✅ Exists | OK |
| `/api/v1/chat` | ✅ Exists | OK |

### Legacy Endpoints (Still in Backend)
| Endpoint | Backend Status | Action |
|----------|----------------|--------|
| `/api/playground` | ✅ Exists (legacy) | Keep for backward compat |
| `/api/status` | ✅ Exists (legacy) | Keep for backward compat |
| `/api/proxy` | ✅ Exists (legacy) | Keep for backward compat |
| `/api/announcements` | ✅ Exists (legacy) | Keep for backward compat |

---

## 🚀 ACTION PLAN

### Step 1: Fix Breaking API Calls
Fix 4 files with wrong endpoints:
1. `src/app/admin/communications/page.tsx` (3 changes)
2. `src/lib/utils/discord-webhook.ts` (1 change)

### Step 2: Update Documentation
Update 4 files with legacy references in docs/UI:
1. `src/app/advanced/page.tsx`
2. `src/app/docs/api/ApiOverviewPage.tsx`
3. `src/app/docs/api/endpoints/EndpointsPage.tsx`
4. `src/app/docs/guides/api-keys/ApiKeysGuidePage.tsx`

### Step 3: Keep Legacy Routes in Backend
Don't remove legacy routes - they provide backward compatibility for:
- Old API keys
- External integrations
- Cached documentation

---

*Report generated by Kiro AI Assistant*
