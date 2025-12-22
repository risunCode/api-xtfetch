# API Call Optimization Analysis

> Analisis penggunaan API calls dan rekomendasi optimisasi.

---

## 📊 Current API Call Patterns

### 1. Polling/Interval Calls (Potential Waste)

| Location | Endpoint | Interval | Purpose |
|----------|----------|----------|---------|
| `/maintenance` | `/api/status` | 30s | Check if maintenance over |
| ServiceWorker | `registration.update()` | 30min | Check SW updates |

### 2. Page Load Calls (One-time)

| Page | Endpoints Called | Count |
|------|------------------|-------|
| **Home** | `/api` (on submit) | 1 per download |
| **Sidebar** | `/api/status` | 1 per page load |
| **Settings** | `/api/status/cookies` | 1 |
| **Advanced** | `/api/playground` | 1 + 1 per test |
| **Admin Overview** | `/api/admin/apikeys` | 1 |
| **Admin Services** | `/api/admin/services`, `/api/admin/settings` | 2 |
| **Admin Playground** | `/api/admin/cookies/status`, `/api/admin/services`, `/api/admin/playground-examples` | 3 |
| **Admin Settings** | `/api/admin/settings`, `/api/admin/services` | 2 |
| **Admin Users** | via hook | 1 |
| **Admin Communications** | `/api/admin/announcements`, `/api/admin/push` | 2 |

### 3. Action-based Calls (User Triggered)
- Form submissions (download, save settings, etc.)
- CRUD operations (create/update/delete)
- These are necessary and not wasteful

---

## ⚠️ Identified Issues

### Issue 1: Sidebar fetches `/api/status` on EVERY page navigation
```tsx
// Sidebar.tsx - line 49
fetch('/api/status')
```
**Impact:** Called every time user navigates between pages.

### Issue 2: Maintenance page polls every 30 seconds
```tsx
// maintenance/page.tsx
setInterval(fetchMaintenanceInfo, 30000);
```
**Impact:** 2 calls/minute while user waits on maintenance page.

### Issue 3: Admin pages make multiple parallel calls on load
```tsx
// Admin Playground loads 3 endpoints simultaneously
fetch('/api/admin/cookies/status')
fetch('/api/admin/services')
fetch('/api/admin/playground-examples')
```
**Impact:** 3 calls per page load, but these are parallel so OK.

### Issue 4: No caching for static-ish data
- Platform status doesn't change often
- Cookie status doesn't change often
- Could be cached client-side

---

## 🚀 Optimization Strategies

### Strategy 1: Client-Side Caching (SWR/React Query)
```tsx
// Instead of raw fetch, use SWR with revalidation
import useSWR from 'swr';

const { data } = useSWR('/api/status', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    refreshInterval: 60000, // Only refresh every 60s
    dedupingInterval: 30000, // Dedupe calls within 30s
});
```
**Benefit:** Automatic caching, deduplication, smart revalidation.

### Strategy 2: Combine Related Endpoints
```tsx
// Instead of 3 separate calls:
// GET /api/admin/cookies/status
// GET /api/admin/services  
// GET /api/admin/playground-examples

// Create one combined endpoint:
// GET /api/admin/playground-init
// Returns: { cookieStatus, services, examples }
```
**Benefit:** 1 call instead of 3.

### Strategy 3: Server-Sent Events (SSE) for Real-time
```tsx
// For maintenance status - use SSE instead of polling
const eventSource = new EventSource('/api/events/maintenance');
eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (!data.maintenance) {
        window.location.href = '/';
    }
};
```
**Benefit:** Server pushes updates, no polling needed.

### Strategy 4: WebSocket for Admin Dashboard
```tsx
// For real-time stats in admin dashboard
const ws = new WebSocket('wss://api/admin/realtime');
ws.onmessage = (e) => {
    const { type, data } = JSON.parse(e.data);
    if (type === 'stats') updateStats(data);
    if (type === 'maintenance') updateMaintenance(data);
};
```
**Benefit:** Bi-directional, real-time updates.

### Strategy 5: Conditional Polling
```tsx
// Only poll when tab is visible
useEffect(() => {
    if (document.hidden) return;
    
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
}, []);

// Or use Page Visibility API
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearInterval(pollInterval);
    } else {
        pollInterval = setInterval(fetchStatus, 30000);
    }
});
```
**Benefit:** No wasted calls when user is on different tab.

---

## 📋 Recommended Actions

### Quick Wins (Low Effort, High Impact)

1. ✅ **Add SWR/React Query** for data fetching
   - Automatic caching & deduplication
   - Smart revalidation
   - Effort: Medium | Impact: High
   - **DONE:** Installed SWR, created `useStatus` hook, updated Sidebar

2. ✅ **Cache sidebar status with SWR**
   - Using SWR with 60s dedupingInterval
   - Effort: Low | Impact: Medium
   - **DONE:** Sidebar now uses `useStatus()` hook

3. ✅ **Conditional polling on maintenance page**
   - Only poll when tab is visible
   - Increased interval to 60s
   - Effort: Low | Impact: Low
   - **DONE:** Visibility-based polling implemented

### Medium Term

4. **Combine admin init endpoints**
   - Create `/api/admin/init` that returns all needed data
   - Effort: Medium | Impact: Medium

5. ✅ **Add HTTP caching headers**
   ```tsx
   // In API routes
   return NextResponse.json(data, {
       headers: {
           'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
       }
   });
   ```
   - Effort: Low | Impact: Medium
   - **DONE:** Added to `/api/status`

### Long Term

6. **Implement SSE for maintenance status**
   - Server pushes when maintenance changes
   - Effort: High | Impact: Medium

7. **WebSocket for admin real-time**
   - Real-time stats, notifications
   - Effort: High | Impact: High

---

## 📈 Estimated Savings

| Optimization | Current Calls | After | Savings | Status |
|--------------|---------------|-------|---------|--------|
| Sidebar caching | ~50/session | ~5/session | 90% | ✅ Done |
| Maintenance polling | 2/min | 1/min (visible only) | 50%+ | ✅ Done |
| Announcements | 1/page | 1/2min (cached) | 80% | ✅ Done |
| Settings page | 1/visit | 1/min (cached) | 50% | ✅ Done |
| Advanced page | 1/visit | 1/10s (cached) | 30% | ✅ Done |
| ServiceWorker | 1/load | 1/5min (cached) | 90% | ✅ Done |
| Admin hooks | varies | SWR dedup | 30% | ✅ Done |
| HTTP caching | 0 | CDN/browser | 50%+ | ✅ Done |

---

## 🎯 Priority Recommendation

1. ✅ **Immediate:** Add client-side caching for `/api/status` (sidebar) - **DONE**
2. ✅ **This Week:** Implement SWR for all data fetching - **DONE**
3. ✅ **Admin Pages:** Update to use SWR hooks - **DONE**
4. **Future:** SSE/WebSocket for real-time features (optional)

---

## ✅ OPTIMIZATION COMPLETE

All major optimizations have been implemented:
- SWR caching on all public pages
- SWR caching on all admin pages  
- HTTP cache headers on API routes
- Visibility-based polling
- Request deduplication
- Smart auto-refresh with SWR

---

## 📁 Files Created/Modified

### New Hooks (Public)
- `src/hooks/useStatus.ts` - Platform status with SWR
- `src/hooks/useAnnouncements.ts` - Announcements with 2min cache
- `src/hooks/useCookieStatus.ts` - Cookie status for settings
- `src/hooks/usePlayground.ts` - Playground rate limit
- `src/hooks/useUpdatePrompt.ts` - Service worker update settings
- `src/hooks/index.ts` - Public hooks barrel export

### New Hooks (Admin)
- `src/hooks/admin/useSettings.ts` - Admin global settings
- `src/hooks/admin/useUsers.ts` - User management with CRUD

### Modified Hooks
- `src/hooks/admin/useAdminFetch.ts` - Upgraded to SWR-based
- `src/hooks/admin/useStats.ts` - Uses SWR refreshInterval
- `src/hooks/admin/index.ts` - Added new exports

### Modified Components
- `src/components/Sidebar.tsx` - Uses `useStatus()` hook
- `src/components/Announcements.tsx` - Uses `useAnnouncements()` hook
- `src/components/ServiceWorkerRegister.tsx` - Uses `useUpdatePrompt()` hook

### Modified Pages
- `src/app/settings/page.tsx` - Uses `useCookieStatus()` hook
- `src/app/advanced/page.tsx` - Uses `usePlayground()` hook
- `src/app/maintenance/page.tsx` - Visibility-based polling
- `src/app/admin/page.tsx` - Uses `useApiKeys()` hook
- `src/app/admin/settings/page.tsx` - Uses `useSettings()` + `useServices()` hooks

### API Routes with Cache Headers
- `src/app/api/status/route.ts` - 30s cache
- `src/app/api/announcements/route.ts` - 60s cache
- `src/app/api/playground/route.ts` - 30s cache (GET only)

---

## 🔧 SWR Configuration Presets

```typescript
// src/lib/swr/fetcher.ts
export const SWR_CONFIG = {
    static: {      // Rarely changes (status, settings)
        revalidateOnFocus: false,
        dedupingInterval: 60000,
    },
    moderate: {    // Changes occasionally (admin stats)
        revalidateOnFocus: true,
        refreshInterval: 60000,
    },
    realtime: {    // Live data
        refreshInterval: 10000,
    },
};

// src/hooks/admin/useAdminFetch.ts
export const ADMIN_SWR_CONFIG = {
    default: { dedupingInterval: 30000 },
    static: { dedupingInterval: 60000 },
    realtime: { refreshInterval: 30000 },
};
```

---

*Analysis Date: December 2024*
*Last Updated: December 20, 2024*
