# DownAria Backend (api-xtfetch)

**Version:** 2.0.0  
**Last Updated:** December 28, 2025

## Architecture

This is the **backend API** for DownAria social media downloader.

```
Backend (Port 3002): api-xtfetch/
├── Next.js API routes
├── Uses Supabase SERVICE ROLE KEY
├── Uses Redis for rate limiting + sessions
├── All scraping logic lives here
├── Telegram Bot (@downariaxt_bot)
└── BullMQ Queue for async downloads
```

Frontend counterpart: `DownAria/` (Port 3001) - Version 1.9.0

---

## Recent Major Changes (v2.0.0)

### Critical Bug Fixes
- ✅ **"Processing Stuck" Bug** - Fixed with 60s timeout wrapper
- ✅ **Memory Session Leak** - Redis-backed sessions (no more OOM)
- ✅ **Rate Limit Race Condition** - Atomic Redis lock
- ✅ **Request Deduplication** - 30s TTL prevents duplicate downloads

### Queue & Worker
- ✅ **Circular Dependency** - Fixed with dependency injection
- ✅ **Backpressure Handling** - Rejects when queue > 100 jobs
- ✅ **Graceful Shutdown** - Waits for active jobs on deploy

### Monitoring
- ✅ **Error Tracking** - `errorsByType` metrics
- ✅ **Queue Depth History** - Rolling 100 samples
- ✅ **Proper Logging** - No more silent failures

---

## API Endpoints

### Public (`/api/v1/*`)
- `POST /api/v1/publicservices` - Download media (free tier, rate limited)
- `GET /api/v1?key={API_KEY}&url={URL}` - Premium API (requires API key)
- `GET /api/v1/status` - Platform status
- `GET /api/v1/proxy` - Media proxy
- `POST /api/v1/youtube/merge` - YouTube HD merge
- `POST /api/v1/playground` - Playground testing (admin only)

### Bot (`/api/bot/*`)
- `POST /api/bot/webhook` - Telegram webhook (receives updates)
- `GET /api/bot/webhook` - Health check
- `GET /api/bot/setup` - Setup webhook with Telegram (admin only)

### Admin (`/api/admin/*`) - Requires Bearer token
- `/api/admin/cookies/*` - Cookie management
- `/api/admin/services` - Platform config
- `/api/admin/stats` - Statistics
- `/api/admin/users` - User management
- `/api/admin/apikeys` - API key management

---

## Telegram Bot (@downariaxt_bot)

### User Commands
- `/start` - Start the bot
- `/help` - Usage guide  
- `/mystatus` - Check download stats & VIP status
- `/history` - View recent downloads
- `/donate` - Donation/VIP info (NO /premium!)

### Admin Commands
- `/stats` - Bot statistics
- `/broadcast <message>` - Send to all users
- `/ban <user_id>` / `/unban <user_id>` - User management
- `/givevip <user_id>` / `/revokevip <user_id>` - VIP management (NO givepremium!)
- `/maintenance on/off` - Broadcast maintenance notifications

### Rate Limits
- **Free**: 8 downloads/day, 4s cooldown
- **VIP (Donator)**: Unlimited, no cooldown

### Bot Structure
```
src/bot/
├── index.ts           # Bot instance & webhook handler
├── config.ts          # Bot configuration
├── types.ts           # Type definitions
├── i18n/              # Translations (en, id)
├── commands/          # Command handlers
│   ├── admin/         # Admin commands (stats, broadcast, ban, givevip, maintenance)
│   └── *.ts           # User commands (start, help, mystatus, history, donate)
├── handlers/          # URL & callback handlers
├── middleware/        # Auth, rate limit, maintenance
│   ├── auth.ts        # User authentication
│   ├── rateLimit.ts   # Download limits & cooldown
│   └── maintenance.ts # Maintenance mode check (synced with admin console)
├── services/          # User & download services
└── utils/             # Helper functions
```

### Bot Environment Variables
```env
TELEGRAM_BOT_TOKEN=           # From @BotFather
TELEGRAM_ADMIN_IDS=           # Comma-separated admin user IDs
TELEGRAM_WEBHOOK_SECRET=      # Random string for webhook verification
TELEGRAM_BOT_USERNAME=        # Bot username without @
TELEGRAM_ADMIN_USERNAME=      # Admin contact username
```

---

## IMPORTANT: Naming Conventions

### Branding (CRITICAL!)
- ❌ **NEVER** use "Premium" - use "VIP" or "Donator" instead
- ❌ **NEVER** use `/premium` command - use `/donate`
- ❌ **NEVER** use `/givepremium` - use `/givevip`
- ✅ VIP = user with linked API key (donator)

### Function Naming (domain-prefixed)

| Domain | Prefix | Examples |
|--------|--------|----------|
| **Auth** | `auth*` | `authVerifySession`, `authVerifyAdminSession` |
| **Platform** | `platform*` | `platformDetect`, `platformMatches` |
| **Service Config** | `serviceConfig*` | `serviceConfigGet`, `serviceConfigLoad` |
| **System Config** | `sysConfig*` | `sysConfigScraperTimeout` |
| **HTTP** | `http*` | `httpGet`, `httpPost`, `httpResolveUrl` |
| **Cookies** | `cookie*` | `cookieParse`, `cookieValidate` |
| **Cookie Pool** | `cookiePool*` | `cookiePoolGetRotating`, `cookiePoolMarkError` |
| **Bot** | `bot*` | `botUserGetOrCreate`, `botRateLimitCheck` |

---

## Cookie Pool Error Handling (Dec 2024)

```
Normal error → increment error_count
5 errors → cooldown 1 minute
10 errors → expired
Checkpoint → immediately expired
Login redirect → track separately, 2x = expired (avoid false positive)
```

Key functions:
- `cookiePoolMarkSuccess()` - Reset errors on success
- `cookiePoolMarkError(error)` - Increment error, auto-cooldown/expire
- `cookiePoolMarkLoginRedirect(error)` - Special handling for login redirects
- `cookiePoolMarkExpired(error)` - Force expire (checkpoint, etc.)

---

## Maintenance Mode

Maintenance is controlled via admin console and stored in `system_config.service_global`:
- `maintenanceMode: boolean`
- `maintenanceType: 'off' | 'api' | 'full' | 'all'`

Bot checks maintenance on every request via `serviceConfigLoad(true)` to force DB refresh.

---

## Project Structure

```
src/
├── app/api/
│   ├── v1/                    # Public endpoints
│   ├── bot/                   # Telegram bot endpoints
│   └── admin/                 # Admin endpoints (auth required)
├── bot/                       # Telegram bot module
├── core/
│   ├── scrapers/              # Platform scrapers
│   ├── security/              # Auth & rate limiting
│   └── config/                # Platform config
├── lib/
│   ├── http/                  # HTTP client
│   ├── cookies/               # Cookie management
│   ├── config/                # Service & system config
│   ├── url/                   # URL pipeline & resolution
│   └── services/              # Platform scrapers (facebook, instagram, etc.)
└── services/                  # Business logic
```

---

## Database Tables

### Cookie Pool (`admin_cookie_pool`)
- `tier` - 'public' or 'private' (for bot vs API)
- `status` - 'healthy', 'cooldown', 'expired', 'disabled'
- `error_count` - Tracks consecutive errors

### Bot Tables
- `bot_users` - Telegram user records
- `bot_downloads` - Download history

---

## Bot Architecture (v2.0.0)

### Session Storage
```typescript
// Redis-backed (production) with memory fallback
storage: redis 
  ? createRedisSessionStorage<SessionData>() 
  : new MemorySessionStorage<SessionData>(3600)
```

### Request Flow with Timeout
```
User sends URL
    │
    ▼
┌─────────────────────────────────────────┐
│ sendProcessingMessage() → "⏳ Processing..." │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ Promise.race([                          │
│   sendMediaByType(),                    │
│   timeout(60000)  ← NEW: 60s timeout    │
│ ])                                      │
└─────────────────────────────────────────┘
    │
    ├── Success → Delete processing msg, send media
    ├── Timeout → Edit to "⏱️ Timeout" error
    └── Error → Edit to error message with retry button
```

### Rate Limiting (Atomic)
```typescript
// Atomic daily reset with Redis lock
const lockKey = `bot:reset_lock:${telegramId}`;
const acquired = await redis.set(lockKey, '1', { nx: true, ex: 5 });
```

### Request Deduplication
```typescript
// Prevents duplicate downloads (30s TTL)
isDuplicateRequest(userId, url)  // Check before processing
clearDuplicateRequest(userId, url)  // Clear on failure for retry
```

---

## Queue System (BullMQ)

### Configuration
```typescript
QUEUE_CONFIG = {
  QUEUE_NAME: 'bot-downloads',
  CONCURRENCY: 10,
  MAX_QUEUE_DEPTH: 100,  // Backpressure threshold
  RATE_LIMIT: { MAX_JOBS: 30, DURATION_MS: 60000 },
  PRIORITY: { PREMIUM: 1, FREE: 10 }
}
```

### Backpressure Handling
```typescript
// Rejects new jobs when queue is full
addJobWithBackpressure(data, { priority })
// Returns: { success: false, error: 'Server sibuk...' }
```

### Graceful Shutdown
```typescript
// On SIGTERM: pause → wait 30s → close
gracefulShutdown()
```

---

## Monitoring Metrics

```typescript
interface BotMetrics {
  downloadsProcessed: number;
  downloadsFailed: number;
  averageProcessingTimeMs: number;
  queuedJobs: number;
  activeWorkers: number;
  // NEW in v2.0.0
  errorsByType: Record<string, number>;
  queueDepthHistory: number[];
  peakQueueDepth: number;
}
```

---


## Known Issues / TODO

### Facebook Scraper (needs refactor)
- [ ] Detect content type from **resolved URL**, not input URL
- [ ] Share links (`/share/p/`) may resolve to stories
- [ ] Story extraction needs cookie + different logic
- [ ] False positives on "no media" for some content types

### URL Resolution
- [x] Pass cookie to `prepareUrl` for proper resolution
- [x] Retry with cookie if guest mode redirects to login

### Bot Improvements (v2.0.0 - COMPLETED)
- [x] Fix "Processing Stuck" bug with timeout wrapper
- [x] Replace MemorySessionStorage with Redis
- [x] Fix rate limit race condition with atomic lock
- [x] Add request deduplication
- [x] Fix queue worker circular dependency
- [x] Add backpressure handling
- [x] Add graceful shutdown
- [x] Fix silent error handling
- [x] Add enhanced monitoring metrics

### Future Improvements
- [ ] Stream-based downloads (reduce memory usage for large files)
- [ ] Grammy Runner for long polling mode (if needed)
- [ ] Per-user queue priority based on history
- [ ] Webhook retry deduplication at Telegram leve