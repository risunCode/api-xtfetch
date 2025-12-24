# Changelog - XTFetch Backend API

All notable changes to the XTFetch Backend API will be documented in this file.

## [December 25, 2025] - API Bridge & Security

### Added
- **Bridge Secret Key Validation** - `x-bridge-secret` header for server-to-server auth
- **Origin Whitelist** - `ALLOWED_ORIGINS` env for blocking unauthorized access
- **YouTube Merge Queue** - Concurrency control with semaphore (max 2 concurrent)
  - Per-IP rate limiting (5 requests per 10 minutes)
  - Queue system (max 20 pending requests)
  - Disk space check (min 100MB free)
  - Request timeout (5 minutes)

### Changed
- **URL Resolution** - Stories/Groups URLs now use cookie from first try
- **YouTube Filesize** - Uses accurate `filesize` from yt-dlp instead of estimation
- **Error Codes** - Proper `errorCode` field in responses for frontend handling

### Fixed
- Facebook Stories redirect to login even with valid cookie in pool
- URL resolver not passing cookie for auth-required content types

---

## [December 23, 2025] - AI Chat Multi-Model Support

### Added
- **Magma API Integration** - Support for external AI models
  - GPT-5 via `https://magma-api.biz.id/ai/gpt5`
  - Copilot Smart via `https://magma-api.biz.id/ai/copilot-think`
- **chatWithMagma()** function in `/api/v1/chat/route.ts`
- Model routing: Gemini models use existing flow, Magma models use external API

### Changed
- `/api/v1/chat` now accepts 4 models: `gemini-2.5-flash`, `gemini-flash-latest`, `gpt5`, `copilot-smart`
- Updated valid models list from deprecated `gemini-2.5-pro`, `gemini-2.0-flash-lite`

---

## [December 2024] - Code Cleanup & API Routing

### Added
- Type sync documentation (TYPES-CONTRACT.md)
- Consolidated changelog system with archives
- Improved function naming conventions documentation

### Changed
- Migrated all endpoints to v1 API structure
- Updated console logging to use centralized logger
- Improved type consistency with frontend
- Enhanced middleware rate limiting configuration
- Consolidated library files (http, cookies, config, auth, utils)

### Removed
- Legacy API routes (`/api/status`, `/api/announcements`, `/api/push`)
- Duplicate code (~300 lines)
- Outdated console.log statements in production code
- Legacy function names (deprecated naming conventions)

### Fixed
- API key validation implementation (removed TODO)
- Type mismatches between projects
- Documentation outdated references
- Rate limit configuration for deleted endpoints

### Documentation
- See `Proposal/archives/CHANGELOG-legacy-routes-cleanup.md` for detailed migration logs
- Updated README with current API structure
- Documented function naming conventions
- Updated API endpoint references

### API Structure (After Cleanup)
```
api-xtfetch/src/app/api/
├── admin/              # Admin endpoints (auth required)
├── health/             # Health check
└── v1/                 # Public v1 endpoints
    ├── announcements/  # Announcements
    ├── push/           # Push notifications
    ├── status/         # Platform status
    └── ...
```

### Function Naming Convention
All functions now use domain-prefixed naming:
- `auth*` - Authentication functions
- `platform*` - Platform detection/config
- `serviceConfig*` / `sysConfig*` - Configuration
- `http*` - HTTP client functions
- `cookie*` / `cookiePool*` / `adminCookie*` - Cookie management
- `util*` / `security*` - Utilities
- `apiKey*` - API key management

---

## [1.0.0] - November 2024 (Initial Release)

### Features
- **Multi-Platform Scraping** - Facebook, Instagram, Twitter/X, TikTok, Weibo, YouTube
- **Cookie Pool System** - Multi-cookie rotation with health tracking
- **Rate Limiting** - Per-IP and per-API-key limits
- **Admin APIs** - Platform management, cookie pool, analytics
- **Security** - JWT auth, encryption, SSRF protection
- **Caching** - Redis-based response caching
- **Push Notifications** - VAPID-based web push

### Tech Stack
- Next.js 15 (App Router)
- TypeScript 5
- Supabase (PostgreSQL)
- Redis (Upstash)
- Axios + Cheerio

### API Endpoints
- Public: `/api/v1/*` (download, status, proxy, etc.)
- Admin: `/api/admin/*` (services, cookies, users, stats, etc.)

### Security Features
- AES-256-GCM encryption
- Row Level Security (RLS)
- Input validation (XSS/SQLi protection)
- SSRF protection
- Audit logging
