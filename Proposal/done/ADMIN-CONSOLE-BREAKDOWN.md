# XTFetch Admin Console - Full Breakdown

> **Document Version**: 1.0  
> **Last Updated**: December 20, 2025  
> **Purpose**: Complete analysis of Admin Console features, architecture, issues, and redesign recommendations

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Features Breakdown](#3-features-breakdown)
4. [Database Schema](#4-database-schema)
5. [API Endpoints](#5-api-endpoints)
6. [Known Issues](#6-known-issues)
7. [Security Analysis](#7-security-analysis)
8. [Redesign Recommendations](#8-redesign-recommendations)

---

## 1. Overview

### 1.1 What is Admin Console?

Admin Console adalah panel administrasi untuk XTFetch yang memungkinkan admin untuk:
- Monitor analytics dan statistik download
- Mengontrol platform services (enable/disable)
- Mengelola Cookie Pool untuk scraping
- Mengelola API Keys untuk akses programmatic
- Mengirim announcements dan push notifications
- Mengelola users dan roles
- Mengatur global settings dan security

### 1.2 Access Control

| Role | Access Level |
|------|--------------|
| `user` | Dashboard, API Keys (own), Playground, Telegram |
| `admin` | All features + Services, Cookies, Announcements, Users, Settings |

### 1.3 Tech Stack

- **Frontend**: Next.js 16 App Router, React 19, Framer Motion
- **Auth**: Supabase JWT (via `verifyAdminSession`)
- **Database**: Supabase (PostgreSQL)
- **Rate Limiting**: Redis (primary) + In-memory (fallback)
- **State**: React useState + SWR-like manual fetching


---

## 2. Architecture

### 2.1 File Structure

```
src/app/admin/
├── layout.tsx              # Main layout with sidebar, auth check, context
├── page.tsx                # Redirect to /admin/dashboard
├── dashboard/
│   └── page.tsx            # Analytics dashboard
├── services/
│   └── page.tsx            # Platform control (enable/disable)
├── cookies/
│   ├── page.tsx            # Cookie Pool overview
│   └── CookiePoolModal.tsx # Cookie management modal
├── apikey/
│   └── page.tsx            # API Keys + Guest Playground settings
├── announcements/
│   └── page.tsx            # Announcements + Push notifications
├── users/
│   └── page.tsx            # User management
├── settings/
│   └── page.tsx            # Global settings + Security
├── playground/
│   └── page.tsx            # API testing playground
├── telegram/
│   └── page.tsx            # Telegram bot (coming soon)
├── discord/
│   └── (empty)             # Discord integration (planned)
└── push/
    └── (empty)             # Merged into announcements
```

### 2.2 API Structure

```
src/app/api/admin/
├── auth/
│   └── route.ts            # GET: check auth, POST: verify admin
├── stats/
│   └── route.ts            # GET: analytics data
├── services/
│   └── route.ts            # GET/POST/PUT: platform config
├── cookies/
│   ├── route.ts            # CRUD: admin cookies (legacy single)
│   ├── pool/
│   │   ├── route.ts        # GET/POST: cookie pool
│   │   └── [id]/
│   │       └── route.ts    # PATCH/DELETE: single cookie
│   └── status/
│       └── route.ts        # GET: cookie status per platform
├── apikeys/
│   └── route.ts            # GET/POST: API key management
├── announcements/
│   └── route.ts            # CRUD: announcements
├── push/
│   └── route.ts            # GET: stats, POST: send notification
├── users/
│   └── route.ts            # GET/POST/DELETE: user management
├── settings/
│   └── route.ts            # GET/POST: global settings
└── cache/
    └── route.ts            # GET: stats, DELETE: clear cache
```

### 2.3 Auth Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin Layout                              │
├─────────────────────────────────────────────────────────────┤
│  1. useLayoutEffect: installAdminFetchGlobal()              │
│     - Intercepts all fetch() calls                          │
│     - Auto-injects Bearer token from Supabase session       │
│                                                              │
│  2. useEffect: checkAuth()                                  │
│     - getSession() from Supabase                            │
│     - getUserProfile() from users table                     │
│     - Set user state with role                              │
│                                                              │
│  3. AdminContext provides:                                  │
│     - user: UserProfile                                     │
│     - isAdmin: boolean                                      │
│     - canAccess(role): boolean                              │
│     - adminFetch: fetch wrapper                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Route                                 │
├─────────────────────────────────────────────────────────────┤
│  verifyAdminSession(request)                                │
│  ├── Extract Bearer token from Authorization header         │
│  ├── Verify with Supabase auth.getUser()                   │
│  ├── Check role from users table                           │
│  └── Return { valid, userId, role, error }                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   API Route  │────▶│   Supabase   │
│   (React)    │◀────│   (Next.js)  │◀────│  (Postgres)  │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    │                    │
       ▼                    ▼                    ▼
  Local State          In-Memory            Persistent
  (useState)           Cache (30s)          Storage
```


---

## 3. Features Breakdown

### 3.1 Dashboard (`/admin/dashboard`)

**Purpose**: Analytics overview dan monitoring

**Features**:
| Feature | Description | Data Source |
|---------|-------------|-------------|
| Total Downloads | Sum of all downloads | `download_logs` table |
| Success Rate | Success/Total percentage | `download_logs` table |
| Failed Count | Error count | `download_logs` table |
| Countries | Unique countries | `download_logs.country` |
| Platforms | Active platforms | `download_logs.platform` |
| API Keys | Active/Total keys | `api_keys` table |
| Platform Chart | Bar chart by platform | Aggregated stats |
| Country Chart | Bar chart by country | Aggregated stats |
| System Status | API/DB/Cache/CDN status | Hardcoded "operational" |
| Source Breakdown | web/api/playground | `download_logs.source` |
| Recent Errors | Last 10 errors | `download_errors` table |
| Daily Trend | Downloads per day | Aggregated by date |

**Controls**:
- Period selector: 24h, 7 days, 30 days
- Auto-refresh toggle (30s interval)
- Manual refresh button

**Issues**:
- ⚠️ System Status is hardcoded, not real monitoring
- ⚠️ No real-time updates (polling only)
- ⚠️ Country flags use emoji conversion (may not work on all systems)

---

### 3.2 Services (`/admin/services`)

**Purpose**: Control platform services

**Features**:
| Feature | Description | Storage |
|---------|-------------|---------|
| Platform Toggle | Enable/disable platform | `service_config` table |
| Rate Limit | Per-platform req/min | `service_config.rate_limit` |
| Cache Time | TTL in seconds | `service_config.cache_time` |
| Disabled Message | Custom message when off | `service_config.disabled_message` |
| Stats Display | Requests/Success/Error/Avg time | In-memory + periodic DB sync |
| Maintenance Mode | Global service disable | `service_config` (id='global') |
| Maintenance Message | Custom maintenance text | `service_config.maintenance_message` |
| API Key Required | Toggle API key requirement | `service_config.api_key_required` |
| Reset Stats | Clear platform statistics | In-memory reset |

**Platforms Managed**:
- Facebook (HTML Scraping)
- Instagram (Embed API)
- Twitter/X (Syndication API)
- TikTok (TikWM API)
- Weibo (Mobile API)

**Issues**:
- ⚠️ Stats are in-memory, lost on server restart
- ⚠️ Stats only sync to DB every 100 requests
- ⚠️ No historical stats tracking
- ⚠️ YouTube listed in UI but service removed

---

### 3.3 Cookies (`/admin/cookies`)

**Purpose**: Manage Cookie Pool for authenticated scraping

**Features**:
| Feature | Description | Storage |
|---------|-------------|---------|
| Pool Overview | Stats per platform | `cookie_pool` table |
| Add Cookie | Add new cookie to pool | `cookie_pool` table |
| Edit Cookie | Update label/note/max_uses | `cookie_pool` table |
| Delete Cookie | Remove from pool | `cookie_pool` table |
| Toggle Enable | Enable/disable cookie | `cookie_pool.enabled` |
| Test Health | Verify cookie validity | API call to platform |
| Reset Status | Force healthy status | `cookie_pool.status` |
| View Full Cookie | Show/copy full value | Modal display |

**Cookie Status Types**:
| Status | Description | Auto-Recovery |
|--------|-------------|---------------|
| `healthy` | Working normally | N/A |
| `cooldown` | Rate limited, resting | 30 minutes |
| `expired` | Session invalid | Manual replace |
| `disabled` | Manually disabled | Manual enable |

**Cookie Fields**:
```typescript
interface PooledCookie {
    id: string;
    platform: string;           // facebook, instagram, twitter, weibo
    cookie: string;             // Full cookie value (encrypted?)
    label: string | null;       // User-friendly name
    user_id: string | null;     // Owner (null = admin)
    status: CookieStatus;
    last_used_at: string | null;
    use_count: number;
    success_count: number;
    error_count: number;
    last_error: string | null;
    cooldown_until: string | null;
    max_uses_per_hour: number;  // Rate limit per cookie
    enabled: boolean;
    note: string | null;
    created_at: string;
}
```

**Required Cookies per Platform**:
| Platform | Required Cookies |
|----------|-----------------|
| Facebook | `c_user`, `xs` |
| Instagram | `sessionid` |
| Twitter | `auth_token`, `ct0` |
| Weibo | `SUB` |

**Issues**:
- ⚠️ Cookies stored in plain text (should be encrypted)
- ⚠️ No automatic health check scheduling
- ⚠️ Cooldown timer not visible in real-time
- ⚠️ No bulk import/export feature


---

### 3.4 API Keys (`/admin/apikey`)

**Purpose**: Manage programmatic API access

**Features**:
| Feature | Description | Storage |
|---------|-------------|---------|
| Create Key | Generate new API key | `api_keys` table |
| List Keys | View all keys with stats | `api_keys` table |
| Toggle Key | Enable/disable key | `api_keys.enabled` |
| Delete Key | Remove key permanently | `api_keys` table |
| Regenerate | Generate new key value | `api_keys.key_hash` |
| Copy Key | Copy to clipboard | Frontend only |
| View Stats | Requests/Success/Error | `api_keys` stats columns |

**Key Creation Options**:
| Option | Description | Default |
|--------|-------------|---------|
| Name | Identifier for the key | Required |
| Rate Limit | Requests per minute | 60 |
| Validity | Expiration period | Never |
| Length | Key character length | 32 |
| Format | alphanumeric/hex/base64 | alphanumeric |
| Prefix | Custom prefix | `xtf_live` or `xtf_test` |

**Key Format**:
```
{prefix}_{random_string}
Example: xtf_live_AbCdEfGh1234567890...
```

**Key Storage**:
- Full key shown ONCE at creation (not stored)
- Only hash stored in database (`key_hash`)
- Preview stored for display (`key_preview`: first 12 + last 4 chars)

**Guest Playground Settings** (embedded in this page):
| Setting | Description | Default |
|---------|-------------|---------|
| Enabled | Toggle playground access | true |
| Rate Limit | Requests per 2 minutes | 5 |

**Issues**:
- ⚠️ No key usage analytics/graphs
- ⚠️ No IP whitelist per key
- ⚠️ No webhook notifications for key usage
- ⚠️ Rate limit is in-memory, not Redis-backed per key

---

### 3.5 Announcements (`/admin/announcements`)

**Purpose**: Site-wide alerts and push notifications

**Two Tabs**:

#### Tab 1: Announcements (Site Alerts)

| Feature | Description | Storage |
|---------|-------------|---------|
| Create | New announcement | `announcements` table |
| Edit | Update existing | `announcements` table |
| Delete | Remove announcement | `announcements` table |
| Toggle | Enable/disable | `announcements.enabled` |
| Type | info/success/warning/error | `announcements.type` |
| Pages | Target pages | `announcements.pages` (array) |
| Show Once | Dismiss permanently | `announcements.show_once` |

**Announcement Fields**:
```typescript
interface Announcement {
    id: number;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    pages: string[];        // ['home', 'settings', 'about', 'history', 'advanced']
    enabled: boolean;
    show_once: boolean;
    created_at: string;
}
```

#### Tab 2: Push Notifications

| Feature | Description | Storage |
|---------|-------------|---------|
| Subscriber Count | Total PWA subscribers | `push_subscriptions` table |
| VAPID Status | Configuration check | Environment variables |
| Send Notification | Broadcast to all | Web Push API |

**Push Notification Fields**:
```typescript
interface PushPayload {
    title: string;      // Required, max 100 chars
    body: string;       // Optional, max 200 chars
    url: string;        // Click destination, default '/'
}
```

**VAPID Configuration Required**:
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
```

**Issues**:
- ⚠️ No announcement scheduling
- ⚠️ No push notification history
- ⚠️ No segment targeting for push
- ⚠️ No A/B testing for announcements

---

### 3.6 Users (`/admin/users`)

**Purpose**: User management and moderation

**Features**:
| Feature | Description | Storage |
|---------|-------------|---------|
| List Users | Paginated user list | `users` table |
| Search | By email/username/display_name | Query filter |
| Filter by Role | user/admin | Query filter |
| Filter by Status | active/frozen | Query filter |
| Create User | Add new user (admin only) | Supabase Auth Admin API |
| Set Role | Change user role | `users.role` |
| Freeze/Unfreeze | Toggle account access | `users.is_active` |
| Delete User | Remove user permanently | `users` table (cascade) |
| View Activity | User activity log | `user_activity` table |

**User Fields**:
```typescript
interface User {
    id: string;
    email: string;
    username: string | null;
    display_name: string | null;
    role: 'user' | 'admin';
    is_active: boolean;
    referral_code: string | null;
    total_referrals: number;
    last_login: string | null;
    last_activity: string | null;
    created_at: string;
}
```

**Activity Log Fields**:
```typescript
interface ActivityLog {
    id: number;
    action: string;
    details: Record<string, unknown> | null;
    ip_address: string | null;
    country: string | null;
    created_at: string;
}
```

**Issues**:
- ⚠️ No bulk actions (mass freeze/delete)
- ⚠️ No user export feature
- ⚠️ No email verification status display
- ⚠️ Requires `SUPABASE_SERVICE_ROLE_KEY` for user creation
- ⚠️ No password reset from admin


---

### 3.7 Settings (`/admin/settings`)

**Purpose**: Global configuration and security

**Sections**:

#### Site Information
| Setting | Description | Key |
|---------|-------------|-----|
| Site Name | Display name | `site_name` |
| Description | Site description | `site_description` |

#### Social Links
| Setting | Description | Key |
|---------|-------------|-----|
| Discord Invite | Discord server link | `discord_invite` |
| Telegram Channel | Telegram link | `telegram_channel` |
| GitHub Repo | Repository link | `github_repo` |

#### Discord Webhook
| Setting | Description | Key |
|---------|-------------|-----|
| Webhook URL | Discord webhook endpoint | `discord_webhook_url` |
| Notifications | Enable download notifications | `discord_notify_enabled` |

#### PWA Update Prompt
| Setting | Description | Key |
|---------|-------------|-----|
| Enabled | Show update prompt | `update_prompt_enabled` |
| Mode | always/once/session | `update_prompt_mode` |
| Delay | Seconds before showing | `update_prompt_delay_seconds` |
| Dismissable | Allow "Later" button | `update_prompt_dismissable` |
| Custom Message | Override default text | `update_prompt_custom_message` |

#### System
| Setting | Description | Key |
|---------|-------------|-----|
| Cache TTL | Default cache duration | `cache_ttl` |
| Logging | Enable request logging | `logging_enabled` |

#### Security (from service_config)
| Setting | Description | Storage |
|---------|-------------|---------|
| API Key Required | Require key for downloads | `service_config.api_key_required` |
| Maintenance Mode | Disable all services | `service_config.maintenance_mode` |
| Maintenance Message | Custom message | `service_config.maintenance_message` |

#### Danger Zone
| Action | Description |
|--------|-------------|
| Clear Cache | Delete all cached responses |

**Storage**: `global_settings` table (key-value pairs)

**Issues**:
- ⚠️ Settings scattered between `global_settings` and `service_config`
- ⚠️ No settings validation
- ⚠️ No settings history/audit log
- ⚠️ No environment variable override display

---

### 3.8 Playground (`/admin/playground`)

**Purpose**: Test API endpoints directly

**Features**:
| Feature | Description |
|---------|-------------|
| Platform Cards | Quick access to each platform |
| Sample URLs | Pre-filled test URLs |
| Cookie Input | Optional cookie override |
| Admin Cookie Badge | Shows if admin cookie available |
| Response Gallery | Visual media preview |
| JSON View | Raw response data |
| Timing Display | Request duration |
| Status Badge | Success/error indicator |
| Public/Private Badge | Cookie usage indicator |

**Endpoints Tested**:
| Platform | Path | Method |
|----------|------|--------|
| Facebook | /api | POST |
| Instagram | /api | POST |
| Twitter | /api | POST |
| TikTok | /api | POST |
| YouTube | /api | POST |
| Weibo | /api | POST |

**Test Endpoints**:
| Name | Path | Method |
|------|------|--------|
| Service Status | /api/status | GET |

**Issues**:
- ⚠️ YouTube endpoint listed but service removed
- ⚠️ No request history
- ⚠️ No cURL export
- ⚠️ No batch testing

---

### 3.9 Telegram (`/admin/telegram`)

**Purpose**: Telegram bot integration (COMING SOON)

**Planned Features**:
- Bot token configuration
- Admin chat ID setup
- Bot commands preview
- Test message sending

**Current Status**: Preview only, not functional

**Issues**:
- ⚠️ Not implemented
- ⚠️ No backend API

---

### 3.10 Discord (`/admin/discord`)

**Purpose**: Discord integration (PLANNED)

**Current Status**: Empty folder, not implemented

**Planned Features**:
- Webhook management
- Bot integration
- Notification settings


---

## 4. Database Schema

### 4.1 Tables Used by Admin Console

#### `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user',           -- 'user' | 'admin'
    is_active BOOLEAN DEFAULT true,
    referral_code TEXT,
    total_referrals INTEGER DEFAULT 0,
    last_login TIMESTAMPTZ,
    last_activity TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `user_activity`
```sql
CREATE TABLE user_activity (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    country TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `api_keys`
```sql
CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,      -- SHA256 hash
    key_preview TEXT,                    -- First 12 + last 4 chars
    enabled BOOLEAN DEFAULT true,
    rate_limit INTEGER DEFAULT 60,
    expires_at TIMESTAMPTZ,
    total_requests INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RPC functions for atomic increment
CREATE FUNCTION increment_api_key_success(key_id TEXT)
RETURNS void AS $$
    UPDATE api_keys 
    SET success_count = success_count + 1, 
        total_requests = total_requests + 1 
    WHERE id = key_id;
$$ LANGUAGE SQL;

CREATE FUNCTION increment_api_key_error(key_id TEXT)
RETURNS void AS $$
    UPDATE api_keys 
    SET error_count = error_count + 1, 
        total_requests = total_requests + 1 
    WHERE id = key_id;
$$ LANGUAGE SQL;
```

#### `service_config`
```sql
CREATE TABLE service_config (
    id TEXT PRIMARY KEY,                 -- 'global' or platform id
    enabled BOOLEAN DEFAULT true,
    rate_limit INTEGER DEFAULT 10,
    cache_time INTEGER DEFAULT 300,
    method TEXT,
    disabled_message TEXT,
    maintenance_mode BOOLEAN DEFAULT false,
    maintenance_message TEXT,
    api_key_required BOOLEAN DEFAULT false,
    playground_enabled BOOLEAN DEFAULT true,
    playground_rate_limit INTEGER DEFAULT 5,
    stats JSONB,                         -- { totalRequests, successCount, errorCount, avgResponseTime }
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `cookie_pool`
```sql
CREATE TABLE cookie_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL,              -- facebook, instagram, twitter, weibo
    cookie TEXT NOT NULL,                -- Full cookie value
    label TEXT,
    user_id UUID REFERENCES users(id),   -- null = admin cookie
    status TEXT DEFAULT 'healthy',       -- healthy, cooldown, expired, disabled
    last_used_at TIMESTAMPTZ,
    use_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    cooldown_until TIMESTAMPTZ,
    max_uses_per_hour INTEGER DEFAULT 60,
    enabled BOOLEAN DEFAULT true,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cookie_pool_platform ON cookie_pool(platform);
CREATE INDEX idx_cookie_pool_status ON cookie_pool(status);
```

#### `admin_cookies` (Legacy - single cookie per platform)
```sql
CREATE TABLE admin_cookies (
    platform TEXT PRIMARY KEY,
    cookie JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    note TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `announcements`
```sql
CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',            -- info, success, warning, error
    pages TEXT[] DEFAULT '{home}',
    enabled BOOLEAN DEFAULT true,
    show_once BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `push_subscriptions`
```sql
CREATE TABLE push_subscriptions (
    id SERIAL PRIMARY KEY,
    endpoint TEXT UNIQUE NOT NULL,
    keys JSONB NOT NULL,                 -- { p256dh, auth }
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `global_settings`
```sql
CREATE TABLE global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `api_cache`
```sql
CREATE TABLE api_cache (
    cache_key TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    url TEXT,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_cache_platform ON api_cache(platform);
CREATE INDEX idx_api_cache_expires ON api_cache(expires_at);
```

#### `download_logs`
```sql
CREATE TABLE download_logs (
    id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,
    url TEXT,
    success BOOLEAN DEFAULT true,
    source TEXT DEFAULT 'web',           -- web, api, playground
    country TEXT,
    ip_hash TEXT,                        -- Hashed IP for privacy
    user_id UUID REFERENCES users(id),
    api_key_id TEXT,
    response_time INTEGER,               -- ms
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_download_logs_platform ON download_logs(platform);
CREATE INDEX idx_download_logs_created ON download_logs(created_at);
```

#### `download_errors`
```sql
CREATE TABLE download_errors (
    id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,
    url TEXT,
    error_type TEXT,
    error_message TEXT,
    country TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```


---

## 5. API Endpoints

### 5.1 Authentication

#### `GET /api/admin/auth`
Check current auth status.

**Response**:
```json
{
    "success": true,
    "authenticated": true,
    "userId": "uuid",
    "email": "admin@example.com",
    "username": "admin",
    "role": "admin",
    "isAdmin": true
}
```

#### `POST /api/admin/auth`
Verify admin access specifically.

**Response**:
```json
{
    "success": true,
    "message": "Admin access verified",
    "userId": "uuid",
    "username": "admin"
}
```

---

### 5.2 Statistics

#### `GET /api/admin/stats`
Get analytics data.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| days | number | 7 | Period in days |
| type | string | 'all' | platform/country/source/success/errors/all |

**Response** (type=all):
```json
{
    "success": true,
    "data": {
        "period": "7 days",
        "platform": { "facebook": 100, "instagram": 50 },
        "country": { "US": 80, "ID": 70 },
        "source": { "web": 100, "api": 50 },
        "successRate": { "total": 150, "success": 140, "rate": 93.3 },
        "dailyTrend": { "2025-12-20": 50, "2025-12-19": 40 },
        "recentErrors": [...]
    }
}
```

---

### 5.3 Services

#### `GET /api/admin/services`
Get all service configurations.

**Response**:
```json
{
    "success": true,
    "data": {
        "platforms": {
            "facebook": {
                "id": "facebook",
                "name": "Facebook",
                "enabled": true,
                "method": "HTML Scraping",
                "rateLimit": 10,
                "cacheTime": 300,
                "disabledMessage": "...",
                "lastUpdated": "2025-12-20T...",
                "stats": { "totalRequests": 100, "successCount": 95, "errorCount": 5, "avgResponseTime": 1200 }
            }
        },
        "globalRateLimit": 15,
        "playgroundRateLimit": 5,
        "playgroundEnabled": true,
        "maintenanceMode": false,
        "maintenanceMessage": "...",
        "apiKeyRequired": false,
        "lastUpdated": "2025-12-20T..."
    }
}
```

#### `POST /api/admin/services`
Update platform or global config.

**Actions**:

1. **updatePlatform**
```json
{
    "action": "updatePlatform",
    "platformId": "facebook",
    "enabled": true,
    "rateLimit": 15,
    "cacheTime": 600,
    "disabledMessage": "Custom message"
}
```

2. **resetStats**
```json
{
    "action": "resetStats",
    "platformId": "facebook"  // optional, omit for all
}
```

3. **updateGlobal**
```json
{
    "action": "updateGlobal",
    "playgroundEnabled": true,
    "playgroundRateLimit": 10,
    "maintenanceMode": false,
    "maintenanceMessage": "...",
    "globalRateLimit": 20,
    "apiKeyRequired": true
}
```

4. **resetDefaults**
```json
{
    "action": "resetDefaults"
}
```

#### `PUT /api/admin/services`
Quick update for global settings.

```json
{
    "maintenanceMode": true,
    "maintenanceMessage": "Under maintenance",
    "globalRateLimit": 30,
    "apiKeyRequired": false
}
```

---

### 5.4 Cookies

#### `GET /api/admin/cookies`
List all admin cookies (legacy single-cookie system).

#### `POST /api/admin/cookies`
Create/update admin cookie.

```json
{
    "platform": "facebook",
    "cookie": "[{\"name\":\"c_user\",...}]",
    "note": "Main account"
}
```

#### `PATCH /api/admin/cookies`
Toggle cookie enabled status.

```json
{
    "platform": "facebook",
    "enabled": false
}
```

#### `DELETE /api/admin/cookies?platform=facebook`
Delete admin cookie.

---

### 5.5 Cookie Pool

#### `GET /api/admin/cookies/pool`
Get cookies or stats.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| platform | string | Get cookies for platform |
| stats | 'true' | Get stats for all platforms |

#### `POST /api/admin/cookies/pool`
Add new cookie to pool.

```json
{
    "platform": "facebook",
    "cookie": "[{\"name\":\"c_user\",...}]",
    "label": "Account 1",
    "note": "Personal account",
    "max_uses_per_hour": 60
}
```

#### `GET /api/admin/cookies/pool/[id]?test=true`
Test cookie health.

#### `PATCH /api/admin/cookies/pool/[id]`
Update cookie.

```json
{
    "label": "New label",
    "note": "Updated note",
    "max_uses_per_hour": 30,
    "enabled": true,
    "status": "healthy"
}
```

#### `DELETE /api/admin/cookies/pool/[id]`
Delete cookie from pool.

#### `GET /api/admin/cookies/status`
Get admin cookie availability per platform.

**Response**:
```json
{
    "facebook": true,
    "instagram": false,
    "twitter": true,
    "weibo": false
}
```


---

### 5.6 API Keys

#### `GET /api/admin/apikeys`
List all API keys.

**Response**:
```json
{
    "success": true,
    "data": [
        {
            "id": "abc123",
            "name": "Production",
            "key": "xtf_live_AbCd...xyz",
            "hashedKey": "sha256...",
            "enabled": true,
            "rateLimit": 60,
            "created": "2025-12-20T...",
            "lastUsed": "2025-12-20T...",
            "expiresAt": null,
            "stats": { "totalRequests": 100, "successCount": 95, "errorCount": 5 }
        }
    ]
}
```

#### `POST /api/admin/apikeys`
Manage API keys.

**Actions**:

1. **create**
```json
{
    "action": "create",
    "name": "My App",
    "rateLimit": 100,
    "isTest": false,
    "keyLength": 32,
    "keyFormat": "alphanumeric",
    "validityDays": 30,
    "prefix": "myapp"
}
```

**Response**:
```json
{
    "success": true,
    "data": { "id": "...", "name": "My App", ... },
    "plainKey": "myapp_AbCdEfGh...",
    "message": "API key created. Save the key now!"
}
```

2. **update**
```json
{
    "action": "update",
    "id": "abc123",
    "name": "New Name",
    "enabled": false,
    "rateLimit": 50
}
```

3. **delete**
```json
{
    "action": "delete",
    "id": "abc123"
}
```

4. **regenerate**
```json
{
    "action": "regenerate",
    "id": "abc123"
}
```

5. **resetStats**
```json
{
    "action": "resetStats",
    "id": "abc123"
}
```

---

### 5.7 Announcements

#### `GET /api/admin/announcements`
List all announcements.

#### `POST /api/announcements` (Note: not under /admin)
Create announcement.

```json
{
    "title": "New Feature",
    "message": "Check out our new feature!",
    "type": "info",
    "pages": ["home", "settings"],
    "enabled": true,
    "show_once": false
}
```

#### `PUT /api/announcements`
Update announcement.

```json
{
    "id": 1,
    "title": "Updated Title",
    "enabled": false
}
```

#### `DELETE /api/announcements?id=1`
Delete announcement.

---

### 5.8 Push Notifications

#### `GET /api/admin/push`
Get push notification stats.

**Response**:
```json
{
    "success": true,
    "data": {
        "isConfigured": true,
        "subscriberCount": 150
    }
}
```

#### `POST /api/admin/push`
Send push notification to all subscribers.

```json
{
    "title": "New Update!",
    "body": "Check out the latest features",
    "url": "/about"
}
```

**Response**:
```json
{
    "success": true,
    "sent": 145,
    "failed": 5
}
```

---

### 5.9 Users

#### `GET /api/admin/users`
List users with pagination and filters.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page |
| search | string | '' | Search query |
| role | string | '' | Filter by role |
| status | string | '' | active/inactive |

**Response**:
```json
{
    "success": true,
    "data": {
        "users": [...],
        "total": 100,
        "page": 1,
        "limit": 20,
        "totalPages": 5
    }
}
```

#### `POST /api/admin/users`
User management actions.

**Actions**:

1. **updateRole**
```json
{
    "action": "updateRole",
    "userId": "uuid",
    "role": "admin"
}
```

2. **toggleStatus**
```json
{
    "action": "toggleStatus",
    "userId": "uuid",
    "isActive": false
}
```

3. **updateProfile**
```json
{
    "action": "updateProfile",
    "userId": "uuid",
    "username": "newname",
    "displayName": "New Name",
    "avatarUrl": "https://..."
}
```

4. **getActivity**
```json
{
    "action": "getActivity",
    "userId": "uuid"
}
```

5. **createUser** (requires SUPABASE_SERVICE_ROLE_KEY)
```json
{
    "action": "createUser",
    "email": "user@example.com",
    "password": "securepassword",
    "role": "user"
}
```

#### `DELETE /api/admin/users`
Delete user.

```json
{
    "userId": "uuid"
}
```

---

### 5.10 Settings

#### `GET /api/admin/settings`
Get all global settings.

**Response**:
```json
{
    "success": true,
    "data": {
        "site_name": "XTFetch",
        "site_description": "Social Media Video Downloader",
        "discord_invite": "https://discord.gg/...",
        "discord_webhook_url": "https://discord.com/api/webhooks/...",
        "discord_notify_enabled": "true",
        "cache_ttl": "259200",
        "logging_enabled": "true",
        "update_prompt_enabled": "true",
        "update_prompt_mode": "always"
    }
}
```

#### `POST /api/admin/settings`
Update settings.

```json
{
    "settings": {
        "site_name": "XTFetch",
        "discord_notify_enabled": "false",
        "cache_ttl": "86400"
    }
}
```

---

### 5.11 Cache

#### `GET /api/admin/cache`
Get cache statistics.

**Response**:
```json
{
    "success": true,
    "data": {
        "size": 150,
        "hits": 1000,
        "misses": 200,
        "hitRate": "83.3%",
        "byPlatform": {
            "facebook": 50,
            "instagram": 40,
            "twitter": 30,
            "tiktok": 20,
            "weibo": 10
        }
    }
}
```

#### `DELETE /api/admin/cache`
Clear all cache.

**Response**:
```json
{
    "success": true,
    "message": "Cache cleared",
    "cleared": {
        "total": 150
    }
}
```


---

## 6. Known Issues

### 6.1 Critical Issues 🔴

| ID | Area | Issue | Impact | Solution |
|----|------|-------|--------|----------|
| C1 | Cookies | Cookies stored in plain text | Security risk - cookies can be stolen | Encrypt with AES-256-GCM before storing |
| C2 | Auth | No session refresh mechanism | Users logged out unexpectedly | Implement token refresh in layout |
| C3 | Stats | In-memory stats lost on restart | Data loss | Persist to Redis or DB immediately |
| C4 | Rate Limit | Per-key rate limit is in-memory only | Inconsistent across instances | Use Redis for all rate limiting |

### 6.2 High Priority Issues 🟠

| ID | Area | Issue | Impact | Solution |
|----|------|-------|--------|----------|
| H1 | Dashboard | System status is hardcoded | Misleading information | Implement real health checks |
| H2 | Services | YouTube listed but removed | Confusion | Remove YouTube from UI |
| H3 | Settings | Settings split between 2 tables | Inconsistent management | Consolidate to single table |
| H4 | Users | Requires SERVICE_ROLE_KEY for create | Limited functionality | Document requirement clearly |
| H5 | Cookies | No automatic health check | Stale cookies not detected | Add scheduled health checks |
| H6 | API Keys | Key shown only once | User may lose key | Add "reveal once more" with re-auth |

### 6.3 Medium Priority Issues 🟡

| ID | Area | Issue | Impact | Solution |
|----|------|-------|--------|----------|
| M1 | Dashboard | No real-time updates | Stale data | Implement WebSocket or SSE |
| M2 | Dashboard | Country flags use emoji | May not render on all systems | Use flag images |
| M3 | Cookies | No bulk import/export | Tedious management | Add CSV/JSON import/export |
| M4 | Cookies | Cooldown timer not real-time | User confusion | Add countdown timer |
| M5 | API Keys | No usage analytics graphs | Limited insights | Add charts with Chart.js |
| M6 | Announcements | No scheduling | Manual publish required | Add schedule datetime |
| M7 | Push | No notification history | Can't track sent notifications | Add history table |
| M8 | Users | No bulk actions | Tedious for many users | Add multi-select actions |
| M9 | Playground | No request history | Can't review past tests | Add local storage history |
| M10 | Playground | No cURL export | Developer inconvenience | Add copy as cURL button |

### 6.4 Low Priority Issues 🟢

| ID | Area | Issue | Impact | Solution |
|----|------|-------|--------|----------|
| L1 | UI | Inconsistent loading states | Minor UX issue | Standardize loading components |
| L2 | UI | No dark/light mode toggle in admin | Follows system only | Add theme toggle |
| L3 | Telegram | Not implemented | Missing feature | Implement or remove from nav |
| L4 | Discord | Empty folder | Incomplete | Implement or remove |
| L5 | Settings | No validation | Invalid values possible | Add Zod validation |
| L6 | API Keys | No IP whitelist | Less secure | Add IP restriction option |
| L7 | Push | No segment targeting | Blast to all only | Add user segments |

### 6.5 Technical Debt

| Area | Issue | Recommendation |
|------|-------|----------------|
| State Management | Each page manages own state | Consider Zustand or React Query |
| API Calls | Manual fetch with useEffect | Use SWR or React Query |
| Error Handling | Inconsistent error display | Create unified error boundary |
| Types | Some `any` types remain | Strict TypeScript |
| Testing | No tests for admin pages | Add Playwright E2E tests |
| Accessibility | Limited a11y support | Add ARIA labels, keyboard nav |

---

## 7. Security Analysis

### 7.1 Authentication

| Aspect | Current | Recommendation |
|--------|---------|----------------|
| Method | Supabase JWT | ✅ Good |
| Token Storage | Supabase handles | ✅ Good |
| Token Injection | Global fetch interceptor | ⚠️ Could be bypassed |
| Session Refresh | Not implemented | ❌ Add refresh logic |
| Role Check | Server-side verification | ✅ Good |

### 7.2 Authorization

| Aspect | Current | Recommendation |
|--------|---------|----------------|
| Role-based Access | user/admin only | Consider more granular roles |
| Page Protection | AdminGuard component | ✅ Good |
| API Protection | verifyAdminSession | ✅ Good |
| Action Logging | Partial (user_activity) | Add admin action audit log |

### 7.3 Data Protection

| Aspect | Current | Recommendation |
|--------|---------|----------------|
| Cookies | Plain text | ❌ Must encrypt |
| API Keys | Hashed (SHA256) | ✅ Good |
| Passwords | Supabase handles | ✅ Good |
| PII | IP hashed in logs | ✅ Good |
| Sensitive Display | Masked in UI | ✅ Good |

### 7.4 Rate Limiting

| Aspect | Current | Recommendation |
|--------|---------|----------------|
| Admin APIs | 60 req/min | ✅ Good |
| Implementation | Redis + Memory fallback | ✅ Good |
| Per-Key Limits | In-memory only | ❌ Use Redis |
| Bypass Protection | None | Add IP-based backup |

### 7.5 Input Validation

| Aspect | Current | Recommendation |
|--------|---------|----------------|
| API Input | Basic validation | Add Zod schemas |
| XSS Prevention | escapeHtml utility | ✅ Good |
| SQL Injection | Supabase parameterized | ✅ Good |
| File Upload | Not applicable | N/A |


---

## 8. Redesign Recommendations

### 8.1 Architecture Improvements

#### 8.1.1 State Management
```
Current: useState + manual fetch in each page
Proposed: Zustand stores + React Query

Benefits:
- Centralized state
- Automatic caching
- Optimistic updates
- Better loading/error states
```

#### 8.1.2 API Layer
```
Current: Direct fetch calls in components
Proposed: API client with hooks

// lib/admin/api.ts
export const adminApi = {
    services: {
        getAll: () => fetch('/api/admin/services'),
        update: (id, data) => fetch('/api/admin/services', { method: 'POST', body: JSON.stringify(data) })
    },
    // ...
};

// hooks/useServices.ts
export function useServices() {
    return useQuery(['services'], adminApi.services.getAll);
}
```

#### 8.1.3 Real-time Updates
```
Current: Manual refresh / polling
Proposed: Supabase Realtime subscriptions

// Subscribe to changes
supabase
    .channel('admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'service_config' }, handleChange)
    .subscribe();
```

### 8.2 Database Improvements

#### 8.2.1 Consolidate Settings
```sql
-- Merge service_config global row into global_settings
-- Or create new admin_config table

CREATE TABLE admin_config (
    id TEXT PRIMARY KEY DEFAULT 'main',
    maintenance_mode BOOLEAN DEFAULT false,
    maintenance_message TEXT,
    api_key_required BOOLEAN DEFAULT false,
    playground_enabled BOOLEAN DEFAULT true,
    playground_rate_limit INTEGER DEFAULT 5,
    global_rate_limit INTEGER DEFAULT 15,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);
```

#### 8.2.2 Add Audit Log
```sql
CREATE TABLE admin_audit_log (
    id SERIAL PRIMARY KEY,
    admin_id UUID REFERENCES users(id),
    action TEXT NOT NULL,           -- 'service.update', 'user.delete', etc.
    target_type TEXT,               -- 'service', 'user', 'cookie', etc.
    target_id TEXT,
    old_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 8.2.3 Encrypt Cookies
```sql
-- Add encrypted column
ALTER TABLE cookie_pool ADD COLUMN cookie_encrypted TEXT;

-- Migration: encrypt existing cookies
UPDATE cookie_pool SET cookie_encrypted = encrypt(cookie);
ALTER TABLE cookie_pool DROP COLUMN cookie;
ALTER TABLE cookie_pool RENAME COLUMN cookie_encrypted TO cookie;
```

### 8.3 UI/UX Improvements

#### 8.3.1 Navigation Restructure
```
Current:
├── Dashboard
├── API Keys
├── Playground
├── Telegram
├── Services (admin)
├── Cookies (admin)
├── Announcements (admin)
├── Users (admin)
└── Settings (admin)

Proposed:
├── Overview (Dashboard)
├── Services
│   ├── Platforms
│   ├── Cookies
│   └── Cache
├── Access
│   ├── API Keys
│   ├── Users
│   └── Playground
├── Communications
│   ├── Announcements
│   ├── Push Notifications
│   └── Integrations (Discord, Telegram)
└── Settings
    ├── General
    ├── Security
    └── Audit Log
```

#### 8.3.2 Dashboard Redesign
```
Current: Static cards + basic charts
Proposed:
- Real-time counters with animations
- Interactive charts (click to filter)
- Quick actions panel
- Recent activity feed
- System health with actual checks
- Customizable widgets
```

#### 8.3.3 Unified Components
```typescript
// components/admin/DataTable.tsx
// Reusable table with sorting, filtering, pagination

// components/admin/StatCard.tsx
// Consistent stat display

// components/admin/ActionModal.tsx
// Standardized modal for CRUD operations

// components/admin/StatusBadge.tsx
// Consistent status indicators
```

### 8.4 Feature Additions

#### 8.4.1 Priority Features
| Feature | Description | Effort |
|---------|-------------|--------|
| Cookie Encryption | Encrypt all stored cookies | Medium |
| Audit Log | Track all admin actions | Medium |
| Real Health Checks | Actual service monitoring | High |
| Scheduled Announcements | Publish at specific time | Low |
| API Key Analytics | Usage graphs per key | Medium |
| Bulk User Actions | Multi-select operations | Low |

#### 8.4.2 Nice-to-Have Features
| Feature | Description | Effort |
|---------|-------------|--------|
| Dark/Light Toggle | Theme switch in admin | Low |
| Export Data | CSV/JSON export for all tables | Medium |
| Webhook Notifications | Notify on events | Medium |
| Two-Factor Auth | Extra security for admin | High |
| Role Permissions | Granular access control | High |
| Dashboard Customization | Drag-drop widgets | High |

### 8.5 Performance Improvements

#### 8.5.1 Caching Strategy
```
Current: 30s in-memory cache for service config
Proposed:
- Redis for all frequently accessed data
- Stale-while-revalidate pattern
- Cache invalidation on updates
```

#### 8.5.2 Query Optimization
```
Current: Multiple queries per page load
Proposed:
- Batch queries where possible
- Use database views for complex aggregations
- Add proper indexes
```

#### 8.5.3 Bundle Optimization
```
Current: All admin code in main bundle
Proposed:
- Dynamic imports for admin pages
- Separate admin chunk
- Lazy load heavy components (charts)
```

---

## 9. Implementation Priority

### Phase 1: Critical Fixes (Week 1-2)
1. ✅ Encrypt cookies in database
2. ✅ Fix in-memory stats persistence
3. ✅ Remove YouTube from UI
4. ✅ Add session refresh

### Phase 2: Security & Stability (Week 3-4)
1. Add audit logging
2. Implement real health checks
3. Move all rate limiting to Redis
4. Add input validation with Zod

### Phase 3: UX Improvements (Week 5-6)
1. Implement React Query for data fetching
2. Add real-time updates
3. Redesign dashboard
4. Add scheduled announcements

### Phase 4: New Features (Week 7-8)
1. API key analytics
2. Bulk user actions
3. Cookie import/export
4. Notification history

---

## 10. Conclusion

Admin Console XTFetch memiliki fondasi yang solid dengan fitur-fitur essential untuk mengelola social media downloader. Namun, ada beberapa area yang perlu diperbaiki:

**Strengths**:
- Clean UI dengan Framer Motion animations
- Role-based access control
- Comprehensive platform management
- Cookie pool system dengan health tracking

**Weaknesses**:
- Cookie storage tidak terenkripsi
- Stats in-memory (hilang saat restart)
- Beberapa fitur belum diimplementasi (Telegram, Discord)
- Tidak ada audit logging

**Immediate Actions**:
1. Encrypt cookies
2. Persist stats to database
3. Remove dead features from UI
4. Add audit logging

**Long-term Goals**:
1. Real-time dashboard
2. Granular permissions
3. Advanced analytics
4. Integration ecosystem

---

*Document generated by Kiro AI Assistant*
*Last updated: December 20, 2025*
