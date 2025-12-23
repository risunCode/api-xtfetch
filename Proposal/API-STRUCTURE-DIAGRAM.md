# API Structure Diagram

Visual representation of current vs proposed API structure.

---

## 🔴 CURRENT STRUCTURE (Messy - Has Duplicates)

```
api-xtfetch/src/app/api/
│
├── 🔴 LEGACY ROUTES (TO BE REMOVED)
│   ├── /status                    ❌ Duplicate of /api/v1/status
│   ├── /announcements             ❌ Duplicate of /api/v1/announcements
│   └── /push/subscribe            ❌ Duplicate of /api/v1/push/subscribe
│
├── 🟢 INFRASTRUCTURE
│   └── /health                    ✅ Keep (Railway/Render health check)
│
├── 🟡 ADMIN ENDPOINTS (Auth Required)
│   ├── /admin/ads                 ✅ Keep
│   ├── /admin/alerts              ✅ Keep
│   ├── /admin/announcements       ✅ Keep (CRUD operations)
│   ├── /admin/apikeys             ✅ Keep
│   ├── /admin/auth                ✅ Keep
│   ├── /admin/browser-profiles    ✅ Keep
│   ├── /admin/cache               ✅ Keep
│   ├── /admin/cookies             ✅ Keep
│   ├── /admin/gemini              ✅ Keep
│   ├── /admin/push                ✅ Keep (Push management)
│   ├── /admin/services            ✅ Keep
│   ├── /admin/settings            ✅ Keep
│   ├── /admin/stats               ✅ Keep
│   ├── /admin/useragents          ✅ Keep
│   └── /admin/users               ✅ Keep
│
└── 🔵 PUBLIC API V1
    ├── /v1                        ✅ Keep (Premium API with key)
    ├── /v1/ads                    ✅ Keep (Public ads display)
    ├── /v1/announcements          ✅ Keep (Public read-only)
    ├── /v1/chat                   ✅ Keep (AI chat)
    ├── /v1/cookies                ✅ Keep (Cookie status)
    ├── /v1/debug/*                ✅ Keep (Debug endpoints)
    ├── /v1/playground             ✅ Keep (Testing API)
    ├── /v1/proxy                  ✅ Keep (Media proxy)
    ├── /v1/publicservices         ✅ Keep (Free homepage API)
    ├── /v1/push/subscribe         ✅ Keep (Push subscription)
    ├── /v1/status                 ✅ Keep (Service status)
    └── /v1/youtube/merge          ✅ Keep (YouTube HD merge)
```

---

## ✅ PROPOSED STRUCTURE (Clean - No Duplicates)

```
api-xtfetch/src/app/api/
│
├── 🟢 INFRASTRUCTURE
│   └── /health                    ✅ Health check (Railway/Render)
│       └── GET - System health status
│
├── 🟡 ADMIN ENDPOINTS (Bearer Token Required)
│   └── /admin/*
│       ├── /ads                   ✅ Ad management
│       │   ├── GET    - List ads
│       │   ├── POST   - Create ad
│       │   ├── PUT    - Update ad
│       │   └── DELETE - Delete ad
│       │
│       ├── /alerts                ✅ System alerts
│       │   ├── GET    - List alerts
│       │   ├── POST   - Create alert
│       │   └── DELETE - Delete alert
│       │
│       ├── /announcements         ✅ Announcement CRUD
│       │   ├── GET    - List all announcements
│       │   ├── POST   - Create announcement
│       │   ├── PUT    - Update announcement
│       │   └── DELETE - Delete announcement
│       │
│       ├── /apikeys               ✅ API key management
│       │   ├── GET    - List API keys
│       │   ├── POST   - Create API key
│       │   └── DELETE - Revoke API key
│       │
│       ├── /auth                  ✅ Admin authentication
│       │   └── POST   - Verify admin session
│       │
│       ├── /browser-profiles      ✅ Browser fingerprints
│       │   ├── GET    - List profiles
│       │   ├── POST   - Create profile
│       │   ├── PUT    - Update profile
│       │   └── DELETE - Delete profile
│       │
│       ├── /cache                 ✅ Cache management
│       │   └── DELETE - Clear cache
│       │
│       ├── /cookies               ✅ Cookie management
│       │   ├── GET    - List cookies
│       │   ├── POST   - Add cookie
│       │   ├── PUT    - Update cookie
│       │   └── DELETE - Delete cookie
│       │   └── /pool/*            - Cookie pool operations
│       │   └── /health-check      - Cookie health check
│       │   └── /migrate           - Cookie migration
│       │   └── /status            - Cookie status
│       │
│       ├── /gemini                ✅ Gemini AI keys
│       │   ├── GET    - List keys
│       │   ├── POST   - Add key
│       │   └── DELETE - Delete key
│       │
│       ├── /push                  ✅ Push notification management
│       │   ├── GET    - List subscriptions
│       │   ├── POST   - Send push notification
│       │   └── DELETE - Delete subscription
│       │
│       ├── /services              ✅ Platform configuration
│       │   ├── GET    - Get config
│       │   └── PUT    - Update config
│       │
│       ├── /settings              ✅ Global settings
│       │   ├── GET    - Get settings
│       │   └── PUT    - Update settings
│       │
│       ├── /stats                 ✅ Statistics
│       │   └── GET    - Get stats
│       │
│       ├── /useragents            ✅ User-Agent pool
│       │   ├── GET    - List user agents
│       │   ├── POST   - Add user agent
│       │   └── DELETE - Delete user agent
│       │
│       └── /users                 ✅ User management
│           ├── GET    - List users
│           ├── POST   - Create/update user
│           └── DELETE - Delete user
│
└── 🔵 PUBLIC API V1 (No Auth / API Key)
    └── /v1/*
        ├── /                      ✅ Premium API (API key required)
        │   └── GET    - Download with API key
        │
        ├── /ads                   ✅ Public ads display
        │   ├── GET    - Get active ads
        │   └── POST   - Track ad click
        │
        ├── /announcements         ✅ Public announcements (read-only)
        │   └── GET    - Get active announcements
        │
        ├── /chat                  ✅ AI chat
        │   └── POST   - Send chat message
        │
        ├── /cookies               ✅ Cookie availability status
        │   └── GET    - Check which platforms have cookies
        │
        ├── /debug/*               ✅ Debug endpoints
        │   ├── /cookies           - Debug cookie pool
        │   ├── /scrape            - Debug scraper
        │   └── /test-cookie       - Test cookie validity
        │
        ├── /playground            ✅ Testing API (rate limited)
        │   ├── GET    - Test scraper (browser)
        │   └── POST   - Test scraper (API)
        │
        ├── /proxy                 ✅ Media proxy
        │   └── GET    - Proxy media URL
        │
        ├── /publicservices        ✅ Free homepage API
        │   └── POST   - Download without API key
        │
        ├── /push/subscribe        ✅ Push subscription
        │   ├── GET    - Check subscription status
        │   ├── POST   - Subscribe to push
        │   └── DELETE - Unsubscribe from push
        │
        ├── /status                ✅ Service status
        │   └── GET    - Get platform status
        │
        └── /youtube/merge         ✅ YouTube HD merge
            └── POST   - Merge video + audio
```

---

## 🔄 Data Flow Diagram

### Current (With Duplicates)

```
Frontend Components
│
├── Sidebar (useStatus hook)
│   ├── ❌ Calls /api/status
│   └── ✅ Should call /api/v1/status
│
├── Announcements (useAnnouncements hook)
│   ├── ❌ Calls /api/announcements
│   └── ✅ Should call /api/v1/announcements
│
├── Push Notifications (push-notifications.ts)
│   ├── ❌ Calls /api/push/subscribe
│   └── ✅ Should call /api/v1/push/subscribe
│
└── Admin Panel
    ├── ✅ Calls /api/admin/announcements (CRUD)
    └── ✅ Calls /api/admin/push (management)
```

### Proposed (Clean)

```
Frontend Components
│
├── Sidebar (useStatus hook)
│   └── ✅ /api/v1/status
│
├── Announcements (useAnnouncements hook)
│   └── ✅ /api/v1/announcements (read-only)
│
├── Push Notifications (push-notifications.ts)
│   └── ✅ /api/v1/push/subscribe
│
└── Admin Panel
    ├── ✅ /api/admin/announcements (CRUD)
    └── ✅ /api/admin/push (management)
```

---

## 📊 Endpoint Categorization

### By Access Level

```
┌─────────────────────────────────────────────────────────┐
│ PUBLIC (No Auth)                                        │
├─────────────────────────────────────────────────────────┤
│ /api/health                                             │
│ /api/v1/status                                          │
│ /api/v1/announcements                                   │
│ /api/v1/ads                                             │
│ /api/v1/cookies                                         │
│ /api/v1/proxy                                           │
│ /api/v1/publicservices                                  │
│ /api/v1/playground                                      │
│ /api/v1/push/subscribe                                  │
│ /api/v1/youtube/merge                                   │
│ /api/v1/chat                                            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ PREMIUM (API Key Required)                              │
├─────────────────────────────────────────────────────────┤
│ /api/v1?key={KEY}&url={URL}                             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ADMIN (Bearer Token Required)                           │
├─────────────────────────────────────────────────────────┤
│ /api/admin/*                                            │
│ - All admin endpoints require authentication            │
└─────────────────────────────────────────────────────────┘
```

### By Purpose

```
┌─────────────────────────────────────────────────────────┐
│ INFRASTRUCTURE                                          │
├─────────────────────────────────────────────────────────┤
│ /api/health          - Health monitoring                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ CONTENT DELIVERY                                        │
├─────────────────────────────────────────────────────────┤
│ /api/v1/status       - Platform status                  │
│ /api/v1/announcements - Announcements                   │
│ /api/v1/ads          - Advertisements                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ MEDIA PROCESSING                                        │
├─────────────────────────────────────────────────────────┤
│ /api/v1              - Premium download                 │
│ /api/v1/publicservices - Free download                  │
│ /api/v1/playground   - Testing download                 │
│ /api/v1/proxy        - Media proxy                      │
│ /api/v1/youtube/merge - YouTube HD merge                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ USER FEATURES                                           │
├─────────────────────────────────────────────────────────┤
│ /api/v1/push/subscribe - Push notifications             │
│ /api/v1/chat         - AI chat                          │
│ /api/v1/cookies      - Cookie status                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ADMIN MANAGEMENT                                        │
├─────────────────────────────────────────────────────────┤
│ /api/admin/*         - All admin operations             │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Migration Path

### Step 1: Identify Duplicates
```
❌ /api/status           → ✅ /api/v1/status
❌ /api/announcements    → ✅ /api/v1/announcements
❌ /api/push/subscribe   → ✅ /api/v1/push/subscribe
```

### Step 2: Update Frontend
```
useStatus hook           → Use /api/v1/status
useAnnouncements hook    → Use /api/v1/announcements
push-notifications.ts    → Use /api/v1/push/subscribe
maintenance page         → Use /api/v1/status
```

### Step 3: Add Deprecation Warnings
```
/api/status              → Add X-Deprecated header
/api/announcements       → Add X-Deprecated header
/api/push/subscribe      → Add X-Deprecated header
```

### Step 4: Monitor & Delete
```
Monitor logs for 1 week  → Verify zero usage
Delete legacy routes     → Clean codebase
Update documentation     → Reflect changes
```

---

## 📈 Benefits Visualization

### Before Cleanup
```
Total Endpoints: 45
├── Unique: 42
├── Duplicates: 3
└── Code Duplication: 165 lines

Maintenance Burden: HIGH
API Clarity: LOW
Documentation: CONFUSING
```

### After Cleanup
```
Total Endpoints: 42
├── Unique: 42
├── Duplicates: 0
└── Code Saved: 165 lines

Maintenance Burden: LOW
API Clarity: HIGH
Documentation: CLEAR
```

---

## 🚀 Future-Proof Structure

### Version Management
```
/api/v1/*    - Current stable API
/api/v2/*    - Future API (when needed)
/api/admin/* - Admin API (no versioning needed)
/api/health  - Infrastructure (no versioning needed)
```

### Adding New Features
```
✅ DO: Add to /api/v1/* for public features
✅ DO: Add to /api/admin/* for admin features
❌ DON'T: Add to root /api/* (use versioned routes)
```

---

**Last Updated:** December 23, 2024  
**Status:** Proposal - Ready for Implementation
