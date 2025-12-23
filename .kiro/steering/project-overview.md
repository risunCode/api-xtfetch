# XTFetch Backend (api-xtfetch)

## Architecture

This is the **backend API** for XTFetch social media downloader.

```
Backend (Port 3002): api-xtfetch/
├── Next.js API routes
├── Uses Supabase SERVICE ROLE KEY
├── Uses Redis for rate limiting
└── All scraping logic lives here
```

Frontend counterpart: `XTFetch-SocmedDownloader/` (Port 3001)

---

## API Endpoints

### Public (`/api/v1/*`)
- `POST /api/v1/publicservices` - Download media (free tier, rate limited)
- `GET /api/v1?key={API_KEY}&url={URL}` - Premium API (requires API key)
- `GET /api/v1/status` - Platform status
- `GET /api/v1/proxy` - Media proxy
- `POST /api/v1/youtube/merge` - YouTube HD merge
- `POST /api/v1/playground` - Playground testing (admin only)

### Admin (`/api/admin/*`) - Requires Bearer token
- `/api/admin/cookies/*` - Cookie management
- `/api/admin/services` - Platform config
- `/api/admin/stats` - Statistics
- `/api/admin/users` - User management
- `/api/admin/apikeys` - API key management

---

## Function Naming Convention (IMPORTANT!)

All functions use **domain-prefixed naming**:

| Domain | Prefix | Examples |
|--------|--------|----------|
| **Auth** | `auth*` | `authVerifySession`, `authVerifyAdminSession`, `authVerifyAdminToken` |
| **Platform** | `platform*` | `platformDetect`, `platformMatches`, `platformGetBaseUrl`, `platformGetReferer` |
| **Service Config** | `serviceConfig*` | `serviceConfigGet`, `serviceConfigLoad`, `serviceConfigUpdatePlatform` |
| **System Config** | `sysConfig*` | `sysConfigScraperTimeout`, `sysConfigScraperMaxRetries` |
| **HTTP** | `http*` | `httpGet`, `httpPost`, `httpGetUserAgent`, `httpRandomSleep`, `httpResolveUrl` |
| **Cookies** | `cookie*` | `cookieParse`, `cookieValidate`, `cookieGetValue` |
| **Cookie Pool** | `cookiePool*` | `cookiePoolGetRotating`, `cookiePoolAdd`, `cookiePoolUpdate` |
| **Admin Cookie** | `adminCookie*` | `adminCookieGet`, `adminCookieSet`, `adminCookieToggle` |
| **Utils** | `util*` | `utilAddFormat`, `utilDecodeUrl`, `utilExtractMeta` |
| **Security** | `security*` | `securityEncrypt`, `securityDecrypt`, `securityValidateSocialUrl` |
| **API Keys** | `apiKey*` | `apiKeyCreate`, `apiKeyValidate`, `apiKeyGetAll` |

### DO NOT USE (Deprecated - Removed Dec 2024)
```typescript
// ❌ OLD NAMES - DO NOT USE
verifySession, verifyAdminSession  // → authVerifySession, authVerifyAdminSession
detectPlatform, matchesPlatform    // → platformDetect, platformMatches
parseCookie, getCookieValue        // → cookieParse, cookieGetValue
getScraperTimeout                  // → sysConfigScraperTimeout
getUserAgent                       // → httpGetUserAgent
```

---

## Project Structure

```
src/
├── app/api/
│   ├── v1/                    # Public endpoints
│   │   ├── route.ts           # Premium API (GET with API key)
│   │   ├── publicservices/    # Free download endpoint
│   │   ├── playground/        # Admin playground
│   │   ├── status/
│   │   ├── proxy/
│   │   └── youtube/
│   └── admin/                 # Admin endpoints (auth required)
│       ├── cookies/
│       ├── services/
│       ├── stats/
│       └── ...
├── core/
│   ├── scrapers/              # Platform scrapers
│   │   ├── facebook.ts
│   │   ├── instagram.ts
│   │   └── ...
│   ├── security/              # Auth & rate limiting exports
│   ├── config/                # Platform config exports
│   └── database/              # Supabase client
├── lib/
│   ├── http.ts                # HTTP client (merged from 4 files)
│   ├── cookies.ts             # Cookie management (merged from 5 files)
│   ├── config.ts              # All configs (merged from 3 files)
│   ├── auth.ts                # Auth functions (merged from 2 files)
│   ├── utils.ts               # Utilities (merged from 5 files)
│   ├── redis.ts               # Redis client
│   └── supabase.ts            # Supabase client
└── services/                  # Business logic
```

---

## Key Files

### Merged Library Files (Dec 2024 Refactor)
| File | Contains | Lines |
|------|----------|-------|
| `lib/http.ts` | HTTP client, anti-ban, user agents | ~880 |
| `lib/cookies.ts` | Parser, pool, admin cookies | ~1000 |
| `lib/config.ts` | Platform, service, system config | ~800 |
| `lib/auth.ts` | Session auth, API keys | ~300 |
| `lib/utils.ts` | Security, URL helpers, retry, errors | ~1000 |

### Core Exports
- `core/security/index.ts` - Re-exports auth functions + rate limiting
- `core/config/index.ts` - Re-exports platform config functions
- `core/index.ts` - Main barrel export

---

## Types

### Platform ID
```typescript
type PlatformId = 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo' | 'youtube';
```

### Scraper Result
```typescript
interface ScraperResult {
  success: boolean;
  data?: MediaData;
  error?: ScraperErrorCode;
}
```

---

## Environment Variables

```env
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Security
ENCRYPTION_KEY=

# Optional
GEMINI_API_KEY=
```

---

## Cross-Project Sync

When modifying shared concepts, ensure frontend (`XTFetch-SocmedDownloader`) stays in sync:

1. **API Response Types** - Frontend must match backend response
2. **Platform IDs** - Both use `PlatformId` type
3. **Engagement Stats** - Both use `EngagementStats` interface
4. **Error Codes** - Frontend should handle all backend error codes
