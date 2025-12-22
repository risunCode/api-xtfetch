# XTFetch - Hardcoded Values Audit & Proposal

> **Objective**: Identify hardcoded values that should be configurable from database/admin panel.
> **Status**: ✅ IMPLEMENTED - December 20, 2025

---

## 🔴 HIGH PRIORITY - Rate Limiting & Security

### 1. Middleware Rate Limits (`src/middleware.ts`)
```typescript
// Line 102-106
const RATE_LIMIT_CONFIG = {
    global: { maxRequests: 60, windowMs: 60000 },  // 60 req/min
    auth: { maxRequests: 10, windowMs: 60000 },    // 10 req/min for auth
};
const LOGIN_LIMIT = { maxAttempts: 5, blockDuration: 300000 }; // 5 attempts, 5 min block
```
**Status**: ⚠️ KEPT HARDCODED (Edge runtime limitation)
**Reason**: Middleware runs in edge runtime, can't access database

---

### 2. Core Security Rate Limits (`src/core/security/index.ts`)
```typescript
// Line 28-34
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
    public: { maxRequests: 15, windowMs: 60_000 },
    apiKey: { maxRequests: 100, windowMs: 60_000 },
    auth: { maxRequests: 10, windowMs: 60_000 },
    admin: { maxRequests: 60, windowMs: 60_000 },
    global: { maxRequests: 60, windowMs: 60_000 },
    playground: { maxRequests: 5, windowMs: 120_000 },
};
```
**Status**: ✅ DONE - Fallback values in `system_config` table

---

## 🟡 MEDIUM PRIORITY - Cache & Timeouts

### 3. Service Config Cache (`src/lib/services/helper/service-config.ts`)
**Status**: ✅ DONE - Uses `getCacheTtlConfig()` from system_config

---

### 4. API Keys Cache (`src/lib/services/helper/api-keys.ts`)
**Status**: ✅ DONE - Uses `getCacheTtlApikeys()` from system_config

---

### 5. Admin Cookie Cache (`src/lib/utils/admin-cookie.ts`)
**Status**: ✅ DONE - Uses `getCacheTtlCookies()` from system_config

---

### 6. User-Agent Pool Cache (`src/lib/http/client.ts`)
**Status**: ✅ DONE - Uses `getCacheTtlUseragents()` from system_config

---

### 7. Maintenance Check Cache (`src/middleware.ts`)
**Status**: ⚠️ KEPT HARDCODED (Edge runtime limitation)

---

### 8. Playground URL Cache (`src/app/api/playground/route.ts`)
**Status**: ✅ DONE - Uses `getCacheTtlPlaygroundUrl()` from system_config

---

## 🟢 LOW PRIORITY - Client-Side Storage

### 9. LocalStorage Limits (`src/lib/storage/local-storage-db.ts`)
**Status**: ⚠️ KEPT HARDCODED (Client-side, no DB access)

---

### 10. IndexedDB Cache (`src/lib/storage/indexed-db.ts`)
**Status**: ⚠️ KEPT HARDCODED (Client-side, no DB access)

---

## 🟠 SCRAPER TIMEOUTS

### 11. HTTP Client Default Timeout (`src/lib/http/client.ts`)
**Status**: ✅ DONE - Uses `getHttpTimeout()` from system_config

---

### 12. Platform-Specific Timeouts
| Platform | File | Status |
|----------|------|--------|
| Facebook | `src/lib/services/facebook.ts` | ✅ DONE |
| Instagram | `src/lib/services/instagram.ts` | ✅ DONE |
| Twitter | `src/lib/services/twitter.ts` | ✅ DONE |
| TikTok | `src/lib/services/tiktok.ts` | ✅ DONE |
| Weibo | `src/lib/services/weibo.ts` | ✅ DONE |

All scrapers now use `getScraperTimeout(platform)` from system_config

---

## 🔵 COOKIE POOL SETTINGS

### 13. Cookie Cooldown Duration (`src/lib/utils/cookie-pool.ts`)
**Status**: ✅ DONE - Uses `getCookieCooldownMinutes()` from system_config

---

### 14. Cookie Max Uses Per Hour
**Status**: ✅ Already in DB (`admin_cookie_pool.max_uses_per_hour`)

---

## 📊 DISCORD WEBHOOK

### 15. Discord Settings (`src/lib/utils/discord-webhook.ts`)
**Status**: ⚠️ KEPT HARDCODED (Discord API limits, not our config)

---

## 🔒 SECURITY CONSTANTS

### 16. Encryption Settings (`src/lib/utils/security.ts`)
**Status**: ⚠️ KEPT HARDCODED (Security best practice)

---

## 📋 RETRY LOGIC

### 17. Retry Defaults (`src/lib/utils/retry.ts`)
**Status**: ✅ DONE - Uses `getScraperMaxRetries()` and `getScraperRetryDelay()`

---

## 🗄️ Database Schema (IMPLEMENTED)

### New Table: `system_config`
```sql
CREATE TABLE system_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    
    -- Cache TTLs (milliseconds)
    cache_ttl_config INT DEFAULT 30000,
    cache_ttl_apikeys INT DEFAULT 10000,
    cache_ttl_cookies INT DEFAULT 300000,
    cache_ttl_useragents INT DEFAULT 300000,
    cache_ttl_playground_url INT DEFAULT 120000,
    
    -- HTTP Settings
    http_timeout INT DEFAULT 15000,
    http_max_redirects INT DEFAULT 10,
    
    -- Scraper Settings
    scraper_timeout_facebook INT DEFAULT 10000,
    scraper_timeout_instagram INT DEFAULT 15000,
    scraper_timeout_twitter INT DEFAULT 15000,
    scraper_timeout_tiktok INT DEFAULT 10000,
    scraper_timeout_weibo INT DEFAULT 15000,
    scraper_max_retries INT DEFAULT 2,
    scraper_retry_delay INT DEFAULT 1000,
    
    -- Cookie Pool
    cookie_cooldown_minutes INT DEFAULT 30,
    cookie_max_uses_default INT DEFAULT 100,
    
    -- Rate Limits (fallback)
    rate_limit_public INT DEFAULT 15,
    rate_limit_api_key INT DEFAULT 100,
    rate_limit_auth INT DEFAULT 10,
    rate_limit_admin INT DEFAULT 60,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Migration file: `migration/sql-6-add-system-config.sql`

---

## 📁 Files Modified

| File | Changes |
|------|---------|
| `src/lib/services/helper/system-config.ts` | NEW - Centralized config loader |
| `src/lib/services/helper/index.ts` | Added system-config exports |
| `src/lib/services/helper/service-config.ts` | Uses dynamic cache TTL |
| `src/lib/services/helper/api-keys.ts` | Uses dynamic cache TTL |
| `src/lib/http/client.ts` | Uses dynamic UA cache TTL |
| `src/lib/utils/cookie-pool.ts` | Uses dynamic cooldown minutes |
| `src/app/api/playground/route.ts` | Uses dynamic URL cache TTL |
| `src/lib/services/facebook.ts` | Uses `getScraperTimeout('facebook')` |
| `src/lib/services/twitter.ts` | Uses `getScraperTimeout('twitter')` |
| `src/lib/services/tiktok.ts` | Uses `getScraperTimeout('tiktok')` |
| `src/lib/services/weibo.ts` | Uses `getScraperTimeout('weibo')` |
| `src/lib/utils/retry.ts` | Uses dynamic retry settings |
| `src/core/database/index.ts` | Added system-config exports |

---

## ⚠️ Kept Hardcoded (By Design)

| Setting | Reason |
|---------|--------|
| Middleware rate limits | Edge runtime can't access DB |
| Client-side storage limits | No DB access from browser |
| Encryption salt length | Security best practice |
| Discord thresholds | External API limits |
| Maintenance cache TTL | Performance critical |

---

*Document created: December 20, 2025*
*Status: ✅ IMPLEMENTED*
