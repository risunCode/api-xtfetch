# Header Pool System Proposal

> **Goal**: Mengganti hardcoded User-Agent & Headers di `anti-ban.ts` dengan database-driven pool yang bisa diatur dari Admin Panel.

---

## 📊 Current State Analysis

### Hardcoded di `src/lib/http/anti-ban.ts`

```typescript
const BROWSER_PROFILES: BrowserProfile[] = [
    {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
        secChUa: '"Google Chrome";v="143", "Chromium";v="143"...',
        secChUaPlatform: '"Windows"',
        acceptLanguage: 'en-US,en;q=0.9',
    },
    // ... 5 more profiles hardcoded
];
```

### Existing `useragent_pool` Table

```sql
useragent_pool (
    id, platform, user_agent, device_type, browser, label,
    enabled, use_count, success_count, error_count, ...
)
```

**Problem**: Table hanya menyimpan `user_agent` string, tidak menyimpan full browser profile (sec-ch-ua, accept-language, dll).

---

## ✅ Proposed Solution

### Strategy: Upgrade to `browser_profiles` Table

Ganti `useragent_pool` dengan `browser_profiles` yang menyimpan complete browser fingerprint.

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEW STRUCTURE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  browser_profiles                                               │
│  ├── id (UUID)                                                  │
│  ├── platform ('all', 'facebook', 'instagram', etc.)           │
│  ├── label ('Chrome 143 Windows', 'Safari 18 Mac', etc.)       │
│  │                                                              │
│  │  // Core Headers                                             │
│  ├── user_agent (TEXT)                                          │
│  ├── sec_ch_ua (TEXT, nullable - Firefox/Safari don't have)    │
│  ├── sec_ch_ua_platform (TEXT, nullable)                       │
│  ├── sec_ch_ua_mobile (TEXT, default '?0')                     │
│  ├── accept_language (TEXT, default 'en-US,en;q=0.9')          │
│  │                                                              │
│  │  // Metadata                                                 │
│  ├── browser ('chrome', 'firefox', 'safari', 'edge')           │
│  ├── device_type ('desktop', 'mobile', 'tablet')               │
│  ├── os ('windows', 'macos', 'linux', 'ios', 'android')        │
│  ├── is_chromium (BOOLEAN - for Sec-Ch-* headers)              │
│  │                                                              │
│  │  // Stats & Control                                          │
│  ├── enabled (BOOLEAN)                                          │
│  ├── priority (INT, higher = more likely to be selected)       │
│  ├── use_count, success_count, error_count                     │
│  ├── last_used_at, last_error                                  │
│  └── created_at, updated_at                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Migration SQL

### Drop Old Table & Create New

```sql
-- Drop old useragent_pool
DROP TABLE IF EXISTS useragent_pool CASCADE;
DROP VIEW IF EXISTS useragent_pool_stats CASCADE;
DROP FUNCTION IF EXISTS increment_ua_use_count(TEXT) CASCADE;

-- Create new browser_profiles table
CREATE TABLE browser_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Targeting
    platform TEXT NOT NULL DEFAULT 'all',  -- 'all', 'facebook', 'instagram', etc.
    
    -- Display
    label TEXT NOT NULL,
    note TEXT,
    
    -- Core Headers
    user_agent TEXT NOT NULL,
    sec_ch_ua TEXT,                        -- NULL for Firefox/Safari
    sec_ch_ua_platform TEXT,               -- NULL for Firefox/Safari
    sec_ch_ua_mobile TEXT DEFAULT '?0',
    accept_language TEXT DEFAULT 'en-US,en;q=0.9',
    
    -- Metadata
    browser TEXT NOT NULL,                 -- 'chrome', 'firefox', 'safari', 'edge'
    device_type TEXT DEFAULT 'desktop',    -- 'desktop', 'mobile', 'tablet'
    os TEXT,                               -- 'windows', 'macos', 'linux', 'ios', 'android'
    is_chromium BOOLEAN DEFAULT false,     -- true for Chrome, Edge, Opera
    
    -- Control
    enabled BOOLEAN DEFAULT true,
    priority INT DEFAULT 0,                -- Higher = more likely selected
    
    -- Stats
    use_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_device_type CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
    CONSTRAINT valid_browser CHECK (browser IN ('chrome', 'firefox', 'safari', 'edge', 'opera', 'other'))
);
```

### Default Profiles

```sql
INSERT INTO browser_profiles (platform, label, user_agent, sec_ch_ua, sec_ch_ua_platform, browser, device_type, os, is_chromium, priority) VALUES
-- Chrome 143 Windows (High Priority)
('all', 'Chrome 143 Windows', 
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'chrome', 'desktop', 'windows', true, 10),

-- Chrome 143 Mac
('all', 'Chrome 143 macOS',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"macOS"', 'chrome', 'desktop', 'macos', true, 10),

-- Firefox 134 Windows (No Sec-Ch-*)
('all', 'Firefox 134 Windows',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
 NULL, NULL, 'firefox', 'desktop', 'windows', false, 5),

-- Safari 18.2 Mac (No Sec-Ch-*)
('all', 'Safari 18.2 macOS',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
 NULL, NULL, 'safari', 'desktop', 'macos', false, 5),

-- Edge 143 Windows
('all', 'Edge 143 Windows',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
 '"Microsoft Edge";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'edge', 'desktop', 'windows', true, 8),

-- Mobile Safari iOS
('all', 'Safari iOS 18',
 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
 NULL, NULL, 'safari', 'mobile', 'ios', false, 3),

-- Mobile Chrome Android
('all', 'Chrome Android 143',
 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Android"', 'chrome', 'mobile', 'android', true, 3),

-- Platform-specific: Facebook/Instagram prefer Chromium
('facebook', 'Chrome 143 FB',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'chrome', 'desktop', 'windows', true, 15),

('instagram', 'Chrome 143 IG',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
 '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
 '"Windows"', 'chrome', 'desktop', 'windows', true, 15),

-- Platform-specific: TikTok prefers mobile
('tiktok', 'Safari iOS TikTok',
 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
 NULL, NULL, 'safari', 'mobile', 'ios', false, 15);
```

---

## 🔧 Code Changes

### 1. Update `src/lib/http/anti-ban.ts`

```typescript
// Remove hardcoded BROWSER_PROFILES array

// Add DB loader
interface BrowserProfile {
    id: string;
    user_agent: string;
    sec_ch_ua: string | null;
    sec_ch_ua_platform: string | null;
    sec_ch_ua_mobile: string;
    accept_language: string;
    is_chromium: boolean;
    priority: number;
}

let profilesCache: { data: BrowserProfile[]; loadedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadProfiles(platform?: PlatformId): Promise<BrowserProfile[]> {
    // Check cache
    if (profilesCache && Date.now() - profilesCache.loadedAt < CACHE_TTL) {
        return filterByPlatform(profilesCache.data, platform);
    }
    
    // Load from DB
    const { supabase } = await import('@/core/database');
    const { data } = await supabase
        .from('browser_profiles')
        .select('*')
        .eq('enabled', true)
        .order('priority', { ascending: false })
        .order('last_used_at', { ascending: true, nullsFirst: true });
    
    profilesCache = { data: data || [], loadedAt: Date.now() };
    return filterByPlatform(profilesCache.data, platform);
}

function filterByPlatform(profiles: BrowserProfile[], platform?: PlatformId): BrowserProfile[] {
    if (!platform) return profiles.filter(p => p.platform === 'all');
    
    // Platform-specific first, then 'all'
    const specific = profiles.filter(p => p.platform === platform);
    if (specific.length > 0) return specific;
    return profiles.filter(p => p.platform === 'all');
}

// Update getRandomProfile to use DB
export async function getRandomProfileAsync(options?: { 
    platform?: PlatformId; 
    chromiumOnly?: boolean 
}): Promise<BrowserProfile> {
    let profiles = await loadProfiles(options?.platform);
    
    if (options?.chromiumOnly) {
        profiles = profiles.filter(p => p.is_chromium);
    }
    
    // Weighted random by priority
    const totalWeight = profiles.reduce((sum, p) => sum + (p.priority || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (const profile of profiles) {
        random -= (profile.priority || 1);
        if (random <= 0) return profile;
    }
    
    return profiles[0]; // Fallback
}

// Update getRotatingHeaders to be async
export async function getRotatingHeadersAsync(options: RotatingHeadersOptions = {}): Promise<Record<string, string>> {
    const { platform, cookie, chromiumOnly } = options;
    
    const useChromium = chromiumOnly || platform === 'facebook' || platform === 'instagram';
    const profile = await getRandomProfileAsync({ platform, chromiumOnly: useChromium });
    
    const headers: Record<string, string> = {
        'User-Agent': profile.user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': profile.accept_language,
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
    };
    
    // Add Chromium-specific headers
    if (profile.sec_ch_ua) {
        headers['Sec-Ch-Ua'] = profile.sec_ch_ua;
        headers['Sec-Ch-Ua-Mobile'] = profile.sec_ch_ua_mobile || '?0';
        headers['Sec-Ch-Ua-Platform'] = profile.sec_ch_ua_platform || '';
        headers['Sec-Fetch-Dest'] = 'document';
        headers['Sec-Fetch-Mode'] = 'navigate';
        headers['Sec-Fetch-User'] = '?1';
    }
    
    // Platform-specific
    if (platform === 'facebook') {
        headers['Referer'] = 'https://www.facebook.com/';
        headers['Origin'] = 'https://www.facebook.com';
    } else if (platform === 'instagram') {
        headers['Referer'] = 'https://www.instagram.com/';
        headers['Origin'] = 'https://www.instagram.com';
    }
    
    if (cookie) headers['Cookie'] = cookie;
    
    // Track usage (fire and forget)
    markProfileUsed(profile.id).catch(() => {});
    
    return headers;
}
```

### 2. Update Scrapers

All scrapers need to use `getRotatingHeadersAsync` instead of sync version:

```typescript
// Before
const headers = getRotatingHeaders({ platform: 'facebook', cookie });

// After
const headers = await getRotatingHeadersAsync({ platform: 'facebook', cookie });
```

### 3. Admin API Routes

Create `/api/admin/browser-profiles`:
- GET: List all profiles with stats
- POST: Add new profile
- PATCH: Update profile
- DELETE: Delete profile

### 4. Admin UI

Add to Services > Pools tab:
- Browser Profiles tab (alongside Cookie Pool, User-Agent Pool)
- Table with columns: Label, Browser, Platform, Device, Priority, Stats, Actions
- Add/Edit modal with all fields
- Test button to verify profile works

---

## 📁 Files to Modify/Create

```
migration/sql-7-browser-profiles.sql     # New migration
src/lib/http/anti-ban.ts                 # Update to use DB
src/lib/services/facebook.ts             # Use async headers
src/lib/services/instagram.ts            # Use async headers
src/lib/services/twitter.ts              # Use async headers
src/lib/services/weibo.ts                # Use async headers
src/app/api/admin/browser-profiles/      # New API routes
src/app/admin/services/page.tsx          # Add Browser Profiles tab
src/hooks/admin/useBrowserProfiles.ts    # New hook
```

---

## 🎯 Admin UI Design

### Services > Pools > Browser Profiles

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser Profiles                              [+ Add Profile]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Label          │ Browser │ Platform │ Device │ Priority │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ Chrome 143 Win │ Chrome  │ all      │ desktop│ 10      │   │
│  │ Firefox 134    │ Firefox │ all      │ desktop│ 5       │   │
│  │ Safari 18 Mac  │ Safari  │ all      │ desktop│ 5       │   │
│  │ Chrome FB      │ Chrome  │ facebook │ desktop│ 15      │   │
│  │ Safari TikTok  │ Safari  │ tiktok   │ mobile │ 15      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Stats: 10 profiles │ 8 enabled │ 1,234 total uses            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Add/Edit Modal

```
┌─────────────────────────────────────────────────────────────────┐
│  Add Browser Profile                                    [X]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Label:        [Chrome 143 Windows                    ]         │
│                                                                 │
│  Platform:     [all ▼]  Browser: [chrome ▼]  Device: [desktop▼]│
│                                                                 │
│  User-Agent:                                                    │
│  [Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36]│
│                                                                 │
│  ☑ Is Chromium (has Sec-Ch-* headers)                          │
│                                                                 │
│  Sec-Ch-Ua:                                                     │
│  ["Google Chrome";v="143", "Chromium";v="143"...              ]│
│                                                                 │
│  Sec-Ch-Ua-Platform: ["Windows"    ]                           │
│                                                                 │
│  Accept-Language:    [en-US,en;q=0.9]                          │
│                                                                 │
│  Priority: [10] (higher = more likely selected)                │
│                                                                 │
│  ☑ Enabled                                                      │
│                                                                 │
│                              [Cancel]  [Save Profile]           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Expected Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Update UA | Code change + deploy | Admin panel, instant |
| Platform-specific | Hardcoded logic | DB-driven per platform |
| A/B Testing | Not possible | Easy with priority weights |
| Monitoring | None | Use count, success/error stats |
| Flexibility | 6 fixed profiles | Unlimited, configurable |

---

## 🔄 Migration Plan

### Phase 1: Database
- [x] Create migration SQL
- [ ] Run migration
- [ ] Verify default profiles inserted

### Phase 2: Backend
- [x] Update `anti-ban.ts` with async DB loader
- [ ] Update all scrapers to use async headers (optional)
- [x] Create admin API routes
- [ ] Test with existing functionality

### Phase 3: Admin UI
- [x] Add Browser Profiles tab to Services > Pools
- [x] Create useBrowserProfiles hook
- [x] Add/Edit/Delete functionality
- [x] Stats display

### Phase 4: Cleanup
- [x] Remove hardcoded profiles from code (kept as fallback)
- [ ] Update documentation

---

*Proposal by: Kiro AI Assistant*
*Date: December 20, 2025*
