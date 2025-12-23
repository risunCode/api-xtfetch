# Quick Fix Checklist - API Routing Cleanup

**Estimated Time:** 1 hour + 1 week monitoring  
**Risk Level:** 🟢 Low (backward compatible during transition)

---

## ✅ Step-by-Step Action Plan

### Phase 1: Frontend Migration (30 minutes)

#### 1. Update `useStatus` Hook
**File:** `XTFetch-SocmedDownloader/src/hooks/useStatus.ts`

```diff
- const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
+ import { api } from '@/lib/api';

  export function useStatus() {
    const { data, error, isLoading, mutate } = useSWR(
-     `${API_URL}/api/status`,
+     '/api/v1/status',
-     async (url) => {
-       const res = await fetch(url);
+     async (endpoint) => {
+       const res = await api.get(endpoint);
-       return res.json();
+       return res;
      },
      {
        refreshInterval: 30000,
        revalidateOnFocus: false,
      }
    );
```

#### 2. Update `useAnnouncements` Hook
**File:** `XTFetch-SocmedDownloader/src/hooks/useAnnouncements.ts`

```diff
- const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
+ import { api } from '@/lib/api';

  export function useAnnouncements(page: string = 'home') {
    const { data, error, isLoading } = useSWR(
-     `${API_URL}/api/announcements?page=${page}`,
+     `/api/v1/announcements?page=${page}`,
-     async (url) => {
-       const res = await fetch(url);
+     async (endpoint) => {
+       const res = await api.get(endpoint);
-       return res.json();
+       return res;
      },
      {
        refreshInterval: 60000,
      }
    );
```

#### 3. Update Push Notifications
**File:** `XTFetch-SocmedDownloader/src/lib/utils/push-notifications.ts`

```diff
+ import { api } from '@/lib/api';
- const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  export async function subscribeToPush(subscription: PushSubscription) {
-   const response = await fetch(`${API_URL}/api/push/subscribe`, {
-     method: 'POST',
-     headers: { 'Content-Type': 'application/json' },
-     body: JSON.stringify({ subscription }),
-   });
+   const response = await api.post('/api/v1/push/subscribe', { subscription });
-   return response.json();
+   return response;
  }

  export async function unsubscribeFromPush(endpoint: string) {
-   const response = await fetch(`${API_URL}/api/push/subscribe`, {
-     method: 'DELETE',
-     headers: { 'Content-Type': 'application/json' },
-     body: JSON.stringify({ endpoint }),
-   });
+   const response = await api.delete('/api/v1/push/subscribe', { endpoint });
-   return response.json();
+   return response;
  }

  export async function checkSubscriptionStatus(endpoint?: string) {
-   const url = endpoint 
-     ? `${API_URL}/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`
-     : `${API_URL}/api/push/subscribe`;
-   const response = await fetch(url);
+   const url = endpoint ? `/api/v1/push/subscribe?endpoint=${encodeURIComponent(endpoint)}` : '/api/v1/push/subscribe';
+   const response = await api.get(url);
-   return response.json();
+   return response;
  }
```

#### 4. Update Maintenance Page
**File:** `XTFetch-SocmedDownloader/src/app/maintenance/page.tsx`

```diff
+ import { api } from '@/lib/api';
- const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  const fetchMaintenanceInfo = useCallback(async () => {
    try {
-     const res = await fetch(`${API_URL}/api/v1/status?t=` + Date.now());
-     const data = await res.json();
+     const data = await api.get(`/api/v1/status?t=${Date.now()}`);
      
      if (data.success && data.data) {
        setMaintenanceInfo({
          message: data.data.maintenanceMessage || 'System is under maintenance',
          content: data.data.maintenanceContent,
          lastUpdated: data.data.maintenanceLastUpdated,
        });
      }
    } catch (error) {
      console.error('Failed to fetch maintenance info:', error);
    }
- }, [API_URL]);
+ }, []);
```

---

### Phase 2: Add Deprecation Warnings (15 minutes)

#### 1. Update Legacy Status Endpoint
**File:** `api-xtfetch/src/app/api/status/route.ts`

```diff
  export async function GET() {
+   console.warn('[DEPRECATED] /api/status called. Use /api/v1/status instead. This endpoint will be removed on 2025-02-01.');
+   
    await serviceConfigLoad();
    const config = await serviceConfigGetAsync();
    
    // ... existing code ...
    
    return NextResponse.json({
      success: true,
      data: {
        maintenance,
        maintenanceMessage: maintenance ? maintenanceMessage : null,
        maintenanceContent: maintenance ? maintenanceContent : null,
        maintenanceLastUpdated: maintenance ? maintenanceLastUpdated : null,
        platforms: status,
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
+       'X-Deprecated': 'true',
+       'X-Deprecation-Message': 'Use /api/v1/status instead',
+       'X-Sunset-Date': '2025-02-01',
      },
    });
  }
```

#### 2. Update Legacy Announcements Endpoint
**File:** `api-xtfetch/src/app/api/announcements/route.ts`

```diff
  export async function GET(request: NextRequest) {
+   console.warn('[DEPRECATED] /api/announcements GET called. Use /api/v1/announcements instead. This endpoint will be removed on 2025-02-01.');
+   
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    // ... existing code ...
    
    return NextResponse.json({ success: true, data }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
+       'X-Deprecated': 'true',
+       'X-Deprecation-Message': 'Use /api/v1/announcements for GET. Use /api/admin/announcements for mutations.',
+       'X-Sunset-Date': '2025-02-01',
      },
    });
  }
```

#### 3. Update Legacy Push Subscribe Endpoint
**File:** `api-xtfetch/src/app/api/push/subscribe/route.ts`

```diff
  export async function POST(request: NextRequest) {
+   console.warn('[DEPRECATED] /api/push/subscribe POST called. Use /api/v1/push/subscribe instead. This endpoint will be removed on 2025-02-01.');
+   
    if (!supabaseAdmin) {
-     return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
+     return NextResponse.json({ 
+       success: false, 
+       error: 'Database not configured',
+       deprecated: true,
+       newEndpoint: '/api/v1/push/subscribe'
+     }, { 
+       status: 503,
+       headers: {
+         'X-Deprecated': 'true',
+         'X-Deprecation-Message': 'Use /api/v1/push/subscribe instead',
+         'X-Sunset-Date': '2025-02-01',
+       }
+     });
    }
    
    // ... rest of the code with same headers
  }

  export async function DELETE(request: NextRequest) {
+   console.warn('[DEPRECATED] /api/push/subscribe DELETE called. Use /api/v1/push/subscribe instead. This endpoint will be removed on 2025-02-01.');
    // ... same pattern
  }

  export async function GET(request: NextRequest) {
+   console.warn('[DEPRECATED] /api/push/subscribe GET called. Use /api/v1/push/subscribe instead. This endpoint will be removed on 2025-02-01.');
    // ... same pattern
  }
```

---

### Phase 3: Testing (15 minutes)

#### Frontend Tests

```bash
# 1. Start backend
cd api-xtfetch
npm run dev

# 2. Start frontend
cd XTFetch-SocmedDownloader
npm run dev

# 3. Test pages
# - Open http://localhost:3001
# - Check browser console for errors
# - Verify status in sidebar
# - Check announcements display
# - Test push notification subscription
# - Visit /maintenance page
```

#### API Tests

```bash
# Test v1 endpoints
curl http://localhost:3002/api/v1/status
curl http://localhost:3002/api/v1/announcements?page=home
curl -X POST http://localhost:3002/api/v1/push/subscribe \
  -H "Content-Type: application/json" \
  -d '{"subscription":{"endpoint":"test","keys":{"p256dh":"test","auth":"test"}}}'

# Check deprecation headers on legacy endpoints
curl -I http://localhost:3002/api/status
curl -I http://localhost:3002/api/announcements
curl -I http://localhost:3002/api/push/subscribe
```

---

### Phase 4: Monitor (1 week)

#### Check Logs Daily

```bash
# Backend logs
cd api-xtfetch
npm run dev | grep DEPRECATED

# Expected output:
# [DEPRECATED] /api/status called. Use /api/v1/status instead...
# (Should be ZERO after frontend migration)
```

#### Verify Zero Legacy Usage

After 1 week of monitoring:
- ✅ No `[DEPRECATED]` warnings in logs
- ✅ Frontend working correctly
- ✅ No user complaints
- ✅ All tests passing

---

### Phase 5: Cleanup (5 minutes)

#### Delete Legacy Routes

```bash
cd api-xtfetch/src/app/api

# Delete legacy endpoints
rm -rf status/
rm -rf announcements/
rm -rf push/

# Verify deletion
git status
```

#### Update Documentation

```bash
# Update API.md
# Remove legacy endpoints
# Add migration notes
```

---

## 🎯 Quick Commands

### Full Migration Script

```bash
# Frontend migration
cd XTFetch-SocmedDownloader

# 1. Update hooks
code src/hooks/useStatus.ts
code src/hooks/useAnnouncements.ts

# 2. Update utils
code src/lib/utils/push-notifications.ts

# 3. Update pages
code src/app/maintenance/page.tsx

# 4. Test
npm run dev

# Backend deprecation warnings
cd ../api-xtfetch

# 1. Add warnings
code src/app/api/status/route.ts
code src/app/api/announcements/route.ts
code src/app/api/push/subscribe/route.ts

# 2. Test
npm run dev
```

---

## ✅ Verification Checklist

### Before Migration
- [ ] Backup current code (git commit)
- [ ] Document current API usage
- [ ] Inform team about migration

### During Migration
- [ ] Update frontend hooks ✅
- [ ] Update push notifications ✅
- [ ] Update maintenance page ✅
- [ ] Add deprecation warnings ✅
- [ ] Test all affected pages ✅

### After Migration
- [ ] Monitor logs for 1 week
- [ ] Verify zero legacy usage
- [ ] Delete legacy routes
- [ ] Update documentation
- [ ] Close migration ticket

---

## 🚨 Rollback Plan

If something breaks:

```bash
# 1. Revert frontend changes
cd XTFetch-SocmedDownloader
git revert HEAD

# 2. Keep legacy endpoints active
cd ../api-xtfetch
# Don't delete legacy routes yet

# 3. Investigate issue
# Check browser console
# Check backend logs
# Check network tab

# 4. Fix and retry
```

---

## 📊 Success Metrics

- ✅ Zero `[DEPRECATED]` warnings in logs
- ✅ All frontend tests passing
- ✅ No 404 errors in production
- ✅ Reduced codebase by 165 lines
- ✅ Better error messages in v1
- ✅ Consistent API response format

---

## 🎉 Done!

After completing all phases:
- Cleaner API structure
- Better error handling
- Future-proof versioning
- Reduced code duplication
- Improved documentation

**Total Time:** ~1 hour active work + 1 week monitoring  
**Total Benefit:** High - Better maintainability & consistency

---

**Created:** December 23, 2024  
**Status:** Ready to execute  
**Next Action:** Start Phase 1 (Frontend Migration)
