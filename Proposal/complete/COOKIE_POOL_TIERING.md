# 🍪 Proposal: Cookie Pool Tiering System

**Date:** December 25, 2024  
**Status:** PENDING REVIEW  
**Priority:** MEDIUM

---

## 📋 Executive Summary

Split cookie pool menjadi 2 tier:
- **Public Cookies** → Free tier (publicservices, playground)
- **Private Cookies** → Premium API (paying users with API key)

---

## 🎯 Why Cookie Tiering?

### Current Problem

Semua endpoint pakai cookie pool yang sama:
```
publicservices (free) ──┐
playground (free)     ──┼──► Same Cookie Pool ──► Cookies get burned fast!
premium API (paid)    ──┘
```

**Issues:**
1. Free users "burn" cookies cepat (rate limited, banned)
2. Premium users kena impact dari cookie yang udah "burnt"
3. Gak bisa prioritize cookie quality untuk paying customers
4. Semua cookies degraded at same rate

### Proposed Solution

```
publicservices (free) ──┐
playground (free)     ──┼──► PUBLIC Cookie Pool (expendable)
                        │
premium API (paid)    ──────► PRIVATE Cookie Pool (protected)
```

**Benefits:**
1. ✅ Public cookies bisa di-burn tanpa affect premium users
2. ✅ Private cookies tetap fresh dan reliable
3. ✅ Better SLA untuk paying customers
4. ✅ Easier cookie management (separate pools)
5. ✅ Can use "lower quality" cookies for public tier

---

## 📊 Database Schema Changes

### Option A: Add `tier` Column (Recommended)

```sql
-- Add tier column to existing table
ALTER TABLE admin_cookie_pool 
ADD COLUMN tier VARCHAR(10) NOT NULL DEFAULT 'public';

-- Create index for faster queries
CREATE INDEX idx_cookie_pool_tier ON admin_cookie_pool(tier);

-- Update constraint
ALTER TABLE admin_cookie_pool 
ADD CONSTRAINT cookie_tier_check 
CHECK (tier IN ('public', 'private'));
```

**Pros:**
- Minimal schema change
- Easy migration (all existing = public)
- Single table, simpler queries
- Can easily move cookies between tiers

**Cons:**
- Slightly more complex queries

### Option B: Separate Tables

```sql
-- Public cookies (free tier)
CREATE TABLE public_cookie_pool (
    -- Same structure as admin_cookie_pool
);

-- Private cookies (premium tier)
CREATE TABLE private_cookie_pool (
    -- Same structure as admin_cookie_pool
);
```

**Pros:**
- Complete isolation
- Simpler queries per tier

**Cons:**
- Code duplication
- Harder to move cookies between tiers
- Two tables to maintain

### Recommendation: **Option A** (Add tier column)

---

## 🔧 Code Changes

### 1. Update `PooledCookie` Interface

**File:** `src/lib/cookies/pool.ts`

```typescript
export type CookieTier = 'public' | 'private';

export interface PooledCookie {
    id: string;
    platform: string;
    cookie: string;
    tier: CookieTier;  // NEW
    // ... rest of fields
}
```

### 2. Update `cookiePoolGetRotating` Function

```typescript
/**
 * Get a rotating cookie from the pool for a platform
 * @param platform - Platform ID (facebook, instagram, etc.)
 * @param tier - Cookie tier ('public' for free, 'private' for premium)
 */
export async function cookiePoolGetRotating(
    platform: string, 
    tier: CookieTier = 'public'  // Default to public
): Promise<string | null> {
    const db = getSupabase();
    if (!db) return null;

    try {
        // Query with tier filter
        const { data, error } = await db
            .from('admin_cookie_pool')
            .select('*')
            .eq('platform', platform)
            .eq('tier', tier)  // NEW: Filter by tier
            .eq('enabled', true)
            .eq('status', 'healthy')
            .or('cooldown_until.is.null,cooldown_until.lt.now()')
            .order('last_used_at', { ascending: true, nullsFirst: true })
            .order('use_count', { ascending: true })
            .limit(1)
            .single();

        if (data) {
            // ... existing logic
        }

        // Fallback: If private tier has no cookies, DON'T fallback to public
        // This ensures premium users get error instead of degraded service
        if (tier === 'private') {
            logger.warn('cookies', `[${platform}] No private cookies available!`);
            return null;
        }

        // For public tier, try cooldown cookies as fallback
        // ... existing fallback logic
    } catch (e) {
        logger.error('cookies', `[${platform}] cookiePoolGetRotating error: ${e}`);
        return null;
    }
}
```

### 3. Update API Routes

**File:** `src/app/api/v1/publicservices/route.ts`

```typescript
// Free tier - use public cookies
const poolCookie = await cookiePoolGetRotating(platform, 'public');
```

**File:** `src/app/api/v1/playground/route.ts`

```typescript
// Free tier - use public cookies
const poolCookie = await cookiePoolGetRotating(platform, 'public');
```

**File:** `src/app/api/v1/route.ts` (Premium API)

```typescript
// Premium tier - use private cookies
const poolCookie = await cookiePoolGetRotating(platform, 'private');
```

### 4. Update Admin UI

**Location:** `/admin/resources` → Cookies Tab

#### 4.1 Filter by Tier (Top of table)

```
┌─────────────────────────────────────────────────────────────┐
│  🍪 Cookies                                                 │
├─────────────────────────────────────────────────────────────┤
│  Platform: [All ▼]   Tier: [All ▼]   Status: [All ▼]       │
│                            ├── All                          │
│                            ├── 🌐 Public (Free)             │
│                            └── 🔒 Private (Premium)         │
├─────────────────────────────────────────────────────────────┤
│  Platform │ Tier    │ Label    │ Status  │ Uses │ Actions  │
│  ──────── │ ─────── │ ──────── │ ─────── │ ──── │ ──────── │
│  facebook │ 🌐 Public│ FB-01   │ healthy │ 234  │ ✏️ 🗑️    │
│  facebook │ 🔒 Private│ FB-VIP │ healthy │ 45   │ ✏️ 🗑️    │
│  instagram│ 🌐 Public│ IG-01   │ cooldown│ 567  │ ✏️ 🗑️    │
└─────────────────────────────────────────────────────────────┘
```

#### 4.2 Add/Edit Cookie Modal

```
┌─────────────────────────────────────────────────────────────┐
│  Add New Cookie                                      [X]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Platform *        [Facebook ▼]                             │
│                                                             │
│  Tier *            (○) 🌐 Public (Free Tier)                │
│                    (●) 🔒 Private (Premium API)             │
│                                                             │
│  Label             [FB-Premium-01        ]                  │
│                                                             │
│  Cookie *          [                                   ]    │
│                    [                                   ]    │
│                                                             │
│  Note              [VIP account, handle with care     ]    │
│                                                             │
│                              [Cancel]  [Add Cookie]         │
└─────────────────────────────────────────────────────────────┘
```

#### 4.3 Stats Cards (Per Tier)

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  🌐 Public Pool  │  │  🔒 Private Pool │  │  📊 Total        │
│  ────────────────│  │  ────────────────│  │  ────────────────│
│  Total: 24       │  │  Total: 12       │  │  Total: 36       │
│  Healthy: 18     │  │  Healthy: 11     │  │  Healthy: 29     │
│  Cooldown: 4     │  │  Cooldown: 1     │  │  Cooldown: 5     │
│  Expired: 2      │  │  Expired: 0      │  │  Expired: 2      │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

#### 4.4 Quick Actions

- **Bulk Change Tier:** Select multiple cookies → "Move to Public/Private"
- **Tier Badge:** Visual indicator (🌐/🔒) in table rows
- **Sort by Tier:** Click column header to sort

### 5. Update Stats Types

```typescript
interface CookiePoolStats {
    platform: string;
    tier: CookieTier;  // NEW
    total: number;
    enabled_count: number;
    healthy_count: number;
    cooldown_count: number;
    expired_count: number;
    disabled_count: number;
    total_uses: number;
    total_success: number;
    total_errors: number;
}

// Aggregated stats for dashboard
interface CookieTierSummary {
    public: {
        total: number;
        healthy: number;
        cooldown: number;
        expired: number;
    };
    private: {
        total: number;
        healthy: number;
        cooldown: number;
        expired: number;
    };
}
```

---

## 📊 Cookie Distribution Strategy

### Recommended Distribution

| Platform | Public Cookies | Private Cookies | Notes |
|----------|----------------|-----------------|-------|
| Facebook | 5-10 | 3-5 | High volume, burns fast |
| Instagram | 5-10 | 3-5 | High volume, burns fast |
| Twitter | 3-5 | 2-3 | Medium volume |
| TikTok | 3-5 | 2-3 | Medium volume |
| Weibo | 2-3 | 1-2 | Low volume |
| YouTube | 2-3 | 1-2 | Usually no cookie needed |

### Cookie Quality Guidelines

**Public Tier:**
- Can use older/less reliable cookies
- Higher error tolerance
- Faster rotation (more aggressive cooldown)
- Expendable - expect higher burn rate

**Private Tier:**
- Use freshest, most reliable cookies
- Lower error tolerance (mark cooldown faster)
- Slower rotation (preserve quality)
- Protected - minimize burn rate

---

## 🔄 Migration Plan

### Phase 1: Database Migration

```sql
-- 1. Add tier column with default 'public'
ALTER TABLE admin_cookie_pool 
ADD COLUMN tier VARCHAR(10) NOT NULL DEFAULT 'public';

-- 2. Create index
CREATE INDEX idx_cookie_pool_tier ON admin_cookie_pool(tier);

-- 3. Update stats view to include tier
CREATE OR REPLACE VIEW cookie_pool_stats AS
SELECT 
    platform,
    tier,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE enabled = true) as enabled_count,
    COUNT(*) FILTER (WHERE status = 'healthy') as healthy_count,
    COUNT(*) FILTER (WHERE status = 'cooldown') as cooldown_count,
    COUNT(*) FILTER (WHERE status = 'expired') as expired_count,
    COUNT(*) FILTER (WHERE enabled = false) as disabled_count,
    SUM(use_count) as total_uses,
    SUM(success_count) as total_success,
    SUM(error_count) as total_errors
FROM admin_cookie_pool
GROUP BY platform, tier;
```

### Phase 2: Backend Code Update

1. Update `PooledCookie` interface
2. Update `cookiePoolGetRotating` to accept tier parameter
3. Update `cookiePoolAdd` to accept tier parameter
4. Update all API routes to pass correct tier

### Phase 3: Frontend Update

1. Add tier column to cookie table
2. Add tier filter/selector
3. Update stats display to show per-tier stats

### Phase 4: Cookie Assignment

1. Review existing cookies
2. Assign best cookies to 'private' tier
3. Keep rest as 'public' tier
4. Add new cookies with appropriate tier

---

## 🧪 Testing Checklist

### After Implementation

```bash
# Test public tier (should use public cookies)
curl -X POST http://localhost:3002/api/v1/publicservices \
  -H "Content-Type: application/json" \
  -d '{"url": "https://twitter.com/..."}'

# Test premium tier (should use private cookies)
curl "http://localhost:3002/api/v1?key=YOUR_API_KEY&url=https://twitter.com/..."

# Verify cookie usage in logs
# Should see: [twitter] Using public cookie: xxx...
# Should see: [twitter] Using private cookie: yyy...
```

### Admin UI Testing

1. [ ] Can add cookie with tier selection
2. [ ] Can edit cookie tier
3. [ ] Stats show per-tier breakdown
4. [ ] Filter cookies by tier

---

## 📁 Files to Modify

| Priority | File | Change |
|----------|------|--------|
| 🔴 HIGH | Database | Add `tier` column + index + update view |
| 🔴 HIGH | `api-xtfetch/src/lib/cookies/pool.ts` | Add tier parameter to functions |
| 🔴 HIGH | `api-xtfetch/src/app/api/v1/publicservices/route.ts` | Pass `'public'` tier |
| 🔴 HIGH | `api-xtfetch/src/app/api/v1/playground/route.ts` | Pass `'public'` tier |
| 🔴 HIGH | `api-xtfetch/src/app/api/v1/route.ts` | Pass `'private'` tier |
| 🟡 MED | `api-xtfetch/src/app/api/admin/cookies/pool/route.ts` | Support tier in CRUD |
| 🟡 MED | `XTFetch-SocmedDownloader/src/hooks/admin/useCookies.ts` | Add tier to types & filters |
| 🟡 MED | `XTFetch-SocmedDownloader/src/components/admin/CookieTable.tsx` | Add tier column & filter |
| 🟡 MED | `XTFetch-SocmedDownloader/src/components/admin/CookieModal.tsx` | Add tier selector |
| 🟢 LOW | `api-xtfetch/src/lib/cookies/admin.ts` | Update legacy functions |

---

## ⚠️ Important Considerations

### 1. Backward Compatibility

- Default tier = 'public' ensures existing cookies work
- Existing API calls without tier parameter use 'public'
- No breaking changes for current users

### 2. Fallback Behavior

```typescript
// Public tier: Has fallback to cooldown cookies
// Private tier: NO fallback - return null if no healthy cookies
//              This ensures premium users get clear error instead of degraded service
```

### 3. Cookie Movement

- Admin can change cookie tier anytime
- Moving public → private: Cookie gets "promoted"
- Moving private → public: Cookie gets "demoted" (maybe burnt)

### 4. Monitoring

- Alert when private pool is low (<2 healthy cookies)
- Alert when public pool is depleted
- Track success rate per tier

---

## 📈 Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Premium API reliability | ~85% | ~95%+ |
| Cookie burn rate (premium) | High | Low |
| Free tier availability | Variable | Acceptable |
| Cookie management complexity | Low | Medium |

---

**Author:** Kiro AI  
**Last Updated:** December 25, 2024
