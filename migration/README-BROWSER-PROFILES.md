# Browser Profiles - Anti-Detection System

XTFetch menggunakan sistem Browser Profiles untuk menghindari detection saat scraping platform sosial media.

---

## Overview

Browser Profiles adalah kumpulan user agent dan client hints yang dirotasi secara otomatis untuk membuat request terlihat seperti berasal dari browser asli.

---

## Database Table: `browser_profiles`

```sql
CREATE TABLE browser_profiles (
    id UUID PRIMARY KEY,
    platform TEXT DEFAULT 'all',        -- Target platform (all, facebook, instagram, etc.)
    label TEXT NOT NULL,                 -- Profile name
    note TEXT,                           -- Optional notes
    user_agent TEXT NOT NULL,            -- Full user agent string
    sec_ch_ua TEXT,                      -- Client hints: sec-ch-ua
    sec_ch_ua_platform TEXT,             -- Client hints: sec-ch-ua-platform  
    sec_ch_ua_mobile TEXT DEFAULT '?0',  -- Client hints: sec-ch-ua-mobile
    accept_language TEXT DEFAULT 'en-US,en;q=0.9',
    browser browser_type,                -- chrome, firefox, safari, edge, opera, other
    device_type device_type,             -- desktop, mobile, tablet
    os TEXT,                             -- Operating system
    is_chromium BOOLEAN DEFAULT false,   -- Is Chromium-based browser
    enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 5,          -- Higher = more preferred
    use_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

---

## Fallback Profiles (Hardcoded)

Jika database kosong atau tidak tersedia, sistem menggunakan fallback profiles:

| Label | Browser | OS | Priority |
|-------|---------|-----|----------|
| Chrome 143 Windows | Chrome | Windows | 10 |
| Chrome 143 macOS | Chrome | macOS | 10 |
| Firefox 134 Windows | Firefox | Windows | 5 |

---

## Default User Agents

```typescript
// Default (Chrome 143 Windows)
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

// Desktop (Chrome 143 macOS)
DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

// Mobile (Safari iOS 18.5)
MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
```

---

## Platform-Specific User Agent Selection

| Platform | Preferred Device | Reason |
|----------|-----------------|--------|
| TikTok | Mobile | TikTok API expects mobile UA |
| Weibo | Desktop | Weibo blocks mobile scraping |
| Facebook | Desktop (Chromium) | Requires client hints |
| Instagram | Desktop (Chromium) | Requires client hints |
| Twitter | Desktop | Standard desktop UA |
| YouTube | Desktop | Standard desktop UA |

---

## Rotation System

### Selection Algorithm
1. Filter profiles by platform (specific > 'all')
2. Filter by device type if specified
3. Apply chromium-only filter for Facebook/Instagram
4. Weighted random selection based on priority
5. Avoid selecting same profile consecutively

### Caching
- Database profiles cached for 5 minutes
- Sync cache for fallback profiles
- Auto-refresh on cache expiry

### Tracking
- `use_count` - Total times profile used
- `success_count` - Successful requests
- `error_count` - Failed requests
- `last_used_at` - Last usage timestamp
- `last_error` - Last error message

---

## API Functions

### Async (Database Rotation)
```typescript
// Get random profile with DB rotation
httpGetRandomProfileAsync({ platform?, chromiumOnly? }): Promise<BrowserProfile>

// Get user agent with DB rotation
httpGetUserAgentAsync(platform?, deviceType?): Promise<string>

// Get rotating headers with full profile
httpGetRotatingHeadersAsync({ platform?, cookie?, includeReferer?, chromiumOnly? }): Promise<Headers>
```

### Sync (Cached/Fallback)
```typescript
// Get random profile from cache
httpGetRandomProfile(chromiumOnly?): BrowserProfile

// Get user agent from cache
httpGetUserAgent(platform?): string

// Get rotating headers from cache
httpGetRotatingHeaders({ platform?, cookie?, includeReferer?, chromiumOnly? }): Headers
```

### Profile Management
```typescript
// Mark profile as used
httpMarkProfileUsed(profileId): Promise<void>

// Mark profile as successful
httpMarkProfileSuccess(profileId): Promise<void>

// Mark profile as error
httpMarkProfileError(profileId, error): Promise<void>

// Clear profile cache
httpClearProfileCache(): void

// Preload profiles into cache
httpPreloadProfiles(): Promise<void>
```

---

## Generated Headers Example

```typescript
// Facebook request headers
{
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,...',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'max-age=0',
  'DNT': '1',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Ch-Ua': '"Google Chrome";v="143", "Chromium";v="143", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Referer': 'https://www.facebook.com/',
  'Origin': 'https://www.facebook.com',
  'Cookie': '...'
}
```

---

## Rate Limiting Integration

Browser Profiles terintegrasi dengan rate limiting:

```typescript
// Check if platform is throttled
httpShouldThrottle(platform): boolean

// Track request for rate limiting
httpTrackRequest(platform): void

// Mark platform as rate limited (triggers backoff)
httpMarkRateLimited(platform): void

// Random delay between requests
httpRandomSleep(min?, max?): Promise<void>
```

---

## Admin Panel

Browser Profiles dapat dikelola melalui Admin Panel:
- View all profiles with stats
- Add new profiles
- Enable/disable profiles
- View success/error rates
- Filter by platform/browser/device

Location: `/admin/browser-profiles`

---

## Best Practices

1. Keep profiles updated with latest browser versions
2. Use high priority for most reliable profiles
3. Monitor error rates and disable problematic profiles
4. Use chromium-only for Facebook/Instagram (client hints required)
5. Rotate profiles regularly to avoid fingerprinting
