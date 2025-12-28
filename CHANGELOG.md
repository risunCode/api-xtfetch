# Changelog - DownAria Backend API

All notable changes to the DownAria Backend API will be documented in this file.

## [2.0.0] - December 28, 2025 - Major Bot Reliability & Multi-User Fixes

### 🚨 CRITICAL BUG FIXES

#### FATAL: "Processing Stuck" Bug Fixed
- **Problem**: Bot sent "⏳ Processing TikTok..." but media NEVER arrived, making bot unusable
- **Root Cause**: Silent failures in `sendVideoDirectly()` catch blocks, no timeout wrapper
- **Fix**: Added 60-second timeout wrapper with `Promise.race()` around `sendMediaByType()`
- **Fix**: Proper error cleanup in all catch blocks - processingMsgId always cleaned up

#### Memory Session Storage Leak Fixed
- **Problem**: `MemorySessionStorage` caused OOM with 1000+ concurrent users
- **Fix**: Replaced with Redis-backed session storage using existing Upstash Redis
- **Fallback**: Gracefully falls back to memory storage if Redis unavailable

#### Rate Limit Race Condition Fixed
- **Problem**: Non-atomic check-then-update allowed users to bypass daily limits at midnight
- **Fix**: Atomic Redis lock using `SET NX` with 5-second expiry
- **Fix**: Proper lock release in `finally` block

#### Request Deduplication Added
- **Problem**: User spam same URL → processed multiple times, wasted resources
- **Fix**: Redis-based deduplication with 30-second TTL
- **Functions**: `isDuplicateRequest()`, `clearDuplicateRequest()`

### 🔧 QUEUE & WORKER IMPROVEMENTS

#### Circular Dependency Fixed
- **Problem**: Dynamic imports in worker caused race conditions during startup
- **Fix**: Dependency injection pattern with `setBotApi()` function

#### Backpressure Handling Added
- **Problem**: Queue accepted unlimited jobs, could overflow on traffic spikes
- **Fix**: `addJobWithBackpressure()` rejects jobs when queue depth > 100
- **Config**: `MAX_QUEUE_DEPTH: 100` in queue config

#### Graceful Shutdown Added
- **Problem**: In-flight jobs lost on deploy, stuck in "active" state
- **Fix**: `gracefulShutdown()` pauses worker, waits 30s for active jobs, then closes

### 📊 MONITORING & ERROR HANDLING

#### Silent Error Handling Fixed
- **Problem**: Empty `.catch(() => {})` blocks swallowed errors silently
- **Fix**: All catch blocks now log with `console.warn('[Media] Operation failed:', ...)`

#### Enhanced Metrics Added
- `errorsByType: Record<string, number>` - Track errors by category
- `queueDepthHistory: number[]` - Rolling history (100 samples)
- `peakQueueDepth: number` - Maximum observed queue depth
- New functions: `recordErrorByType()`, `recordQueueDepth()`

### 📁 FILES CHANGED
- `src/bot/index.ts` - Redis session storage, StorageAdapter
- `src/bot/handlers/url.ts` - Timeout wrapper, SEND_TIMEOUT_MS constant
- `src/bot/middleware/rateLimit.ts` - Atomic reset, deduplication functions
- `src/bot/queue/worker.ts` - DI pattern, gracefulShutdown()
- `src/bot/queue/downloadQueue.ts` - addJobWithBackpressure(), MAX_QUEUE_DEPTH
- `src/bot/queue/config.ts` - MAX_QUEUE_DEPTH constant
- `src/bot/utils/media.ts` - Proper error logging, cleanup on all paths
- `src/bot/utils/monitoring.ts` - New metrics fields and functions

### ⚠️ BREAKING CHANGES
- None - all changes are backward compatible

---

## [1.9.0] - December 28, 2025 - Bot Refactor Phase 1-3: Complete Implementation

### Phase 1: Memory Management
- **Session TTL** - Added 1 hour TTL using MemorySessionStorage (prevents memory accumulation)
- **Session Cleanup** - Auto-cleanup stale pendingDownload data older than 5 minutes
- **Buffer Management** - New `buffer.ts` utility with ManagedBuffer class and cleanup patterns
- **Graceful Shutdown** - Added SIGTERM/SIGINT handlers to properly close workers

### Phase 2: Queue Integration
- **Feature Flag** - `BOT_USE_QUEUE=true` enables async queue processing
- **BullMQ Integration** - Downloads added to queue instead of processed synchronously
- **Priority Queue** - VIP users get higher priority (1 vs 10)
- **Fallback** - If queue fails, falls back to synchronous processing

### Phase 3: Monitoring
- **Memory Monitoring** - `monitoring.ts` tracks heap usage with warning (400MB) and critical (700MB) thresholds
- **Metrics Tracking** - Downloads processed/failed, average processing time, success rate
- **Health Check** - `checkHealth()` function for memory, queue, and Redis status
- **Periodic Logging** - Logs memory warnings and metrics summary every minute

### Code Consolidation
- **Unified Media Sending** - New `media.ts` consolidates video/photo sending from url.ts, callback.ts, worker.ts
- **Shared Utilities** - fetchWithRetry, buildSimpleCaption, deduplicateImages now in single location
- **Worker Simplified** - Queue worker now uses unified sendMedia() with metrics tracking

### Middleware Optimization
- **Reordered Middleware** - Stale message filter moved to first position (early exit, no DB)

### Technical Details
- `src/bot/utils/media.ts` - Unified media sending with ctx/api support
- `src/bot/utils/buffer.ts` - Buffer management with cleanup patterns
- `src/bot/utils/monitoring.ts` - Memory monitoring, metrics, health checks
- `src/bot/index.ts` - Session TTL, middleware reorder, graceful shutdown, monitoring start
- `src/bot/handlers/url.ts` - Queue integration with feature flag, metrics recording
- `src/bot/queue/worker.ts` - Simplified with unified sendMedia(), metrics tracking

### Environment Variables
- `BOT_USE_QUEUE=true` - Enable async queue processing (default: false/sync)

---

## [December 27, 2025] - Facebook CDN Retry Logic

### Network Reliability
- **Bot Video Download** - Added retry logic with exponential backoff (3 attempts, 25s timeout each)
- **Facebook Scraper Timeout** - Increased default from 10s to 20s for US CDN latency
- **Logging** - Added attempt tracking for CDN downloads

### Technical Details
- `sendVideoDirectly()` now retries failed downloads with 2s, 4s backoff delays
- Handles transient ETIMEDOUT errors from Facebook US CDN (bos5-1)
- Total max wait time: ~75s (3 attempts x 25s + backoff delays)

---

## [December 27, 2025] - Documentation & Branding Fixes

### 📝 Documentation Updates
- **API Key Instructions** - Fixed "downaria.com/api" → "Contact @{ADMIN_CONTACT_USERNAME}"
- **Bot Messages** - Updated all "Premium" references to "VIP" or "Donator"
- **Help Command** - Updated to use `/donate` instead of `/premium`
- **API Key Format** - Updated example from `xtf_*` to `dwa_live_*`

### 🤖 Bot Message Improvements
- All bot messages now in Indonesian for consistency
- VIP status messages updated with correct branding
- Rate limit messages now mention VIP instead of Premium

---

## [December 26, 2025] - Security Hardening & Bot Improvements

### 🔒 Security Fixes (Critical)
- **CORS Bypass Fix** - `ALLOWED_ORIGINS` now REQUIRED, blocks all requests if empty (was allowing `*`)
- **Telegram Webhook Secret** - `TELEGRAM_WEBHOOK_SECRET` now MANDATORY (was optional)
- **SQL Injection Prevention** - Platform validation in cookie pool queries
- **API Key Brute Force Protection** - Rate limiting: 10 attempts/minute per IP
- **Log Sanitization** - Removed API key from response logs in premium endpoint

### 🤖 Bot Enhancements
- **Command Rename** - `/givepremium` → `/givevip`, `/revokepremium` → `/revokevip`
- **Admin Panel Button** - `/menu` now shows "🔧 Admin Panel" for admins only
- **Donate Flow Improved** - Deletes "Enter API Key" prompt after user sends key
- **Rate Limit Error Handling** - User-friendly messages for API key rate limits

### 📝 Documentation
- Created `Proposal/complete/security-performance-audit-proposal.md`
- Created `Proposal/complete/bot-command-reference.md`
- Updated `.env.example` with security warnings

### ⚠️ Breaking Changes
- `ALLOWED_ORIGINS` env var is now REQUIRED (set to your frontend domain)
- `TELEGRAM_WEBHOOK_SECRET` env var is now MANDATORY for bot webhook

---

## [December 26, 2025] - Security Fixes & Bot Enhancement (Earlier)

### Security Fixes (Penetration Test Mitigation)
- **RCE Prevention** - YouTube scraper now validates format strings, blocks shell metacharacters
- **SSRF Hardening** - Proxy endpoint validates URLs against private IP ranges (10.x, 172.16-31.x, 192.168.x, localhost, metadata endpoints)
- **Admin Auth Hardening** - Playground endpoint now requires proper admin session verification
- **Log Sanitization** - All user inputs sanitized before logging (prevents log injection)

### Key Rotation
- Rotated all compromised secrets (ENCRYPTION_KEY, JWT_SECRET, TELEGRAM_WEBHOOK_SECRET)
- New Supabase project created with fresh credentials
- Created `KEY-ROTATION-GUIDE.md` for future reference

### Bot Enhancements
- **Maintenance Mode Sync** - Bot now checks Redis `global:maintenance` flag (syncs with frontend)
- **Smart Quality Logic** - Non-YouTube videos: HD auto-sent if ≤40MB, fallback to SD if >40MB with HD link
- **YouTube Flow Fix** - Preview message deleted after quality selection, video sent with only `[🔗 Original]` button
- **Keyboard Simplification** - Reorganized into grouped exports: `NAV`, `MENU`, `DOWNLOAD`, `PREMIUM`, `STATUS`, `ADMIN`
- **Legacy Compatibility** - Old keyboard functions moved to `keyboards/legacy.ts` with deprecation notices

### Files Changed
- `src/lib/services/youtube/scraper.ts` - Format validation
- `src/app/api/v1/youtube/merge/route.ts` - Input sanitization
- `src/app/api/v1/proxy/route.ts` - SSRF protection
- `src/app/api/v1/playground/route.ts` - Admin auth fix
- `src/bot/keyboards/index.ts` - Grouped keyboard system
- `src/bot/keyboards/legacy.ts` - Legacy functions (new file)
- `src/bot/handlers/url.ts` - Smart quality + maintenance check
- `src/bot/handlers/callback.ts` - YouTube flow fix
- `src/bot/middleware/maintenance.ts` - Global maintenance check

---

## [December 25, 2025] - Telegram Bot Integration

### Added
- **Telegram Bot** - @downariaxt_bot for video downloads via Telegram
  - grammY framework with webhook support
  - User commands: `/start`, `/help`, `/mystatus`, `/history`, `/premium`
  - Admin commands: `/stats`, `/broadcast`, `/ban`, `/unban`, `/givepremium`, `/maintenance`
- **Bot Webhook API** - `/api/bot/webhook` with secret token verification
- **Bot Setup API** - `/api/bot/setup` for webhook configuration
- **Bot Tables** - `bot_users`, `bot_downloads` in Supabase
- **Maintenance Middleware** - Auto-blocks bot during full maintenance
- **Rate Limiting** - Free: 10/day + 30s cooldown, Premium: unlimited

### Technical
- `serverExternalPackages: ['grammy']` in next.config.ts
- `webhookCallback` with 25s timeout and `onTimeout: 'return'`
- `bot.init()` called before webhook handling
- Global error handler with `bot.catch()`

---

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
