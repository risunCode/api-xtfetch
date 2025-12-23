# 🔀 File Merge Plan - Detailed Implementation

## 📦 MERGE #1: HTTP Module

### Target: `src/lib/http.ts` (Single File)

**Files to Merge:**
- `src/lib/http/client.ts` (350 lines)
- `src/lib/http/anti-ban.ts` (300 lines)
- `src/lib/http/index.ts` (50 lines - DELETE after merge)

**Resulting Structure:**
```typescript
// src/lib/http.ts (~600 lines)

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & TYPES
// ═══════════════════════════════════════════════════════════════
export const USER_AGENT = '...';
export const DESKTOP_USER_AGENT = '...';
export const MOBILE_USER_AGENT = '...';
export const BROWSER_HEADERS = {...};
export const API_HEADERS = {...};
export const DESKTOP_HEADERS = {...};
export const FACEBOOK_HEADERS = {...};
export const INSTAGRAM_HEADERS = {...};
export const TIKTOK_HEADERS = {...};
export const FALLBACK_PROFILES: BrowserProfile[] = [...];

export interface HttpOptions {...}
export interface HttpResponse<T = string> {...}
export interface ResolveResult {...}
export interface BrowserProfile {...}

// ═══════════════════════════════════════════════════════════════
// CORE HTTP METHODS
// ═══════════════════════════════════════════════════════════════
export async function httpGet(url: string, options?: HttpOptions): Promise<HttpResponse>
export async function httpPost<T>(url: string, body?: unknown, options?: HttpOptions): Promise<HttpResponse<T>>
export async function httpHead(url: string, options?: HttpOptions): Promise<HttpResponse<null>>
export async function httpResolveUrl(shortUrl: string, options?: {...}): Promise<ResolveResult>

// ═══════════════════════════════════════════════════════════════
// USER AGENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════
export function httpGetUserAgent(platform?: PlatformId): string
export async function httpGetUserAgentAsync(platform?: PlatformId, deviceType?: 'desktop' | 'mobile'): Promise<string>

// ═══════════════════════════════════════════════════════════════
// HEADER BUILDERS
// ═══════════════════════════════════════════════════════════════
export function httpGetApiHeaders(platform?: PlatformId, extra?: Record<string, string>): Record<string, string>
export async function httpGetApiHeadersAsync(platform?: PlatformId, extra?: Record<string, string>): Promise<Record<string, string>>
export function httpGetBrowserHeaders(platform?: PlatformId, extra?: Record<string, string>): Record<string, string>
export async function httpGetBrowserHeadersAsync(platform?: PlatformId, extra?: Record<string, string>): Promise<Record<string, string>>
export function httpGetSecureHeaders(platform?: PlatformId, cookie?: string): Record<string, string>
export async function httpGetSecureHeadersAsync(platform?: PlatformId, cookie?: string): Promise<Record<string, string>>

// ═══════════════════════════════════════════════════════════════
// ANTI-BAN / ROTATION
// ═══════════════════════════════════════════════════════════════
export function httpGetRotatingHeaders(options?: RotatingHeadersOptions): Record<string, string>
export async function httpGetRotatingHeadersAsync(options?: RotatingHeadersOptions): Promise<Record<string, string>>
export function httpGetRandomProfile(chromiumOnly?: boolean): BrowserProfile
export async function httpGetRandomProfileAsync(options?: {...}): Promise<BrowserProfile>

// ═══════════════════════════════════════════════════════════════
// RATE LIMITING & THROTTLING
// ═══════════════════════════════════════════════════════════════
export function httpShouldThrottle(platform: string): boolean
export function httpTrackRequest(platform: string): void
export function httpMarkRateLimited(platform: string): void

// ═══════════════════════════════════════════════════════════════
// PROFILE TRACKING
// ═══════════════════════════════════════════════════════════════
export async function httpMarkProfileUsed(profileId: string): Promise<void>
export async function httpMarkProfileSuccess(profileId: string): Promise<void>
export async function httpMarkProfileError(profileId: string, error: string): Promise<void>
export function httpClearProfileCache(): void
export async function httpPreloadProfiles(): Promise<void>

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
export function httpGetRandomDelay(min?: number, max?: number): number
export async function httpRandomSleep(min?: number, max?: number): Promise<void>

// ═══════════════════════════════════════════════════════════════
// AXIOS CLIENT (Internal)
// ═══════════════════════════════════════════════════════════════
export { client as axiosClient };

// ═══════════════════════════════════════════════════════════════
// DEPRECATED ALIASES (Remove in v2.0)
// ═══════════════════════════════════════════════════════════════
/** @deprecated Use httpGetUserAgent */ export const getUserAgent = httpGetUserAgent;
/** @deprecated Use httpGetUserAgentAsync */ export const getUserAgentAsync = httpGetUserAgentAsync;
/** @deprecated Use httpResolveUrl */ export const resolveUrl = httpResolveUrl;
/** @deprecated Use httpGetRotatingHeaders */ export const getRotatingHeaders = httpGetRotatingHeaders;
/** @deprecated Use httpGetRandomProfile */ export const getRandomProfile = httpGetRandomProfile;
/** @deprecated Use httpGetRandomDelay */ export const getRandomDelay = httpGetRandomDelay;
/** @deprecated Use httpRandomSleep */ export const randomSleep = httpRandomSleep;
/** @deprecated Use httpShouldThrottle */ export const shouldThrottle = httpShouldThrottle;
/** @deprecated Use httpTrackRequest */ export const trackRequest = httpTrackRequest;
/** @deprecated Use httpMarkRateLimited */ export const markRateLimited = httpMarkRateLimited;
```

---

## 📦 MERGE #2: Cookie Module

### Target: `src/lib/cookies.ts` (Single File)

**Files to Merge:**
- `src/lib/utils/cookie-parser.ts` (120 lines)
- `src/lib/utils/cookie-pool.ts` (300 lines)
- `src/lib/utils/admin-cookie.ts` (150 lines)
- `src/lib/cookies/index.ts` (30 lines - DELETE after merge)

**Resulting Structure:**
```typescript
// src/lib/cookies.ts (~550 lines)

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
export type CookiePlatform = 'facebook' | 'instagram' | 'weibo' | 'twitter';
export type CookieStatus = 'healthy' | 'cooldown' | 'expired' | 'disabled';
export interface PooledCookie {...}
export interface CookiePoolStats {...}
export interface ValidationResult {...}

// ═══════════════════════════════════════════════════════════════
// PARSING
// ═══════════════════════════════════════════════════════════════
export function cookieParse(input: unknown, platform?: CookiePlatform): string | null
export function cookieValidate(cookie: string | null, platform: CookiePlatform): ValidationResult
export function cookieIsLike(input: unknown): boolean
export function cookieGetFormat(input: unknown): 'json' | 'string' | 'array' | 'unknown'

// ═══════════════════════════════════════════════════════════════
// POOL MANAGEMENT
// ═══════════════════════════════════════════════════════════════
export async function cookiePoolGetRotating(platform: string): Promise<string | null>
export async function cookiePoolMarkSuccess(): Promise<void>
export async function cookiePoolMarkError(error?: string): Promise<void>
export async function cookiePoolMarkCooldown(minutes?: number, error?: string): Promise<void>
export async function cookiePoolMarkExpired(error?: string): Promise<void>
export async function cookiePoolGetByPlatform(platform: string): Promise<PooledCookie[]>
export async function cookiePoolGetStats(): Promise<CookiePoolStats[]>
export async function cookiePoolAdd(platform: string, cookie: string, options?: {...}): Promise<PooledCookie | null>
export async function cookiePoolUpdate(id: string, updates: Partial<...>): Promise<PooledCookie | null>
export async function cookiePoolDelete(id: string): Promise<boolean>
export async function cookiePoolTestHealth(id: string): Promise<{healthy: boolean; error?: string}>
export function cookiePoolGetDecrypted(encryptedCookie: string): string
export async function cookiePoolMigrateUnencrypted(): Promise<{migrated: number; errors: number}>

// ═══════════════════════════════════════════════════════════════
// ADMIN COOKIES (Legacy Single Cookie)
// ═══════════════════════════════════════════════════════════════
export async function adminCookieGet(platform: CookiePlatform): Promise<string | null>
export async function adminCookieHas(platform: CookiePlatform): Promise<boolean>
export async function adminCookieGetAll(): Promise<AdminCookie[]>
export async function adminCookieSet(platform: CookiePlatform, cookie: string, note?: string): Promise<boolean>
export async function adminCookieToggle(platform: CookiePlatform, enabled: boolean): Promise<boolean>
export async function adminCookieDelete(platform: CookiePlatform): Promise<boolean>
export async function adminCookieClearCache(): Promise<void>

// ═══════════════════════════════════════════════════════════════
// DEPRECATED ALIASES
// ═══════════════════════════════════════════════════════════════
/** @deprecated Use cookieParse */ export const parseCookie = cookieParse;
/** @deprecated Use cookieValidate */ export const validateCookie = cookieValidate;
/** @deprecated Use cookiePoolGetRotating */ export const getRotatingCookie = cookiePoolGetRotating;
/** @deprecated Use cookiePoolMarkSuccess */ export const markCookieSuccess = cookiePoolMarkSuccess;
/** @deprecated Use adminCookieGet */ export const getAdminCookie = adminCookieGet;
// ... etc
```

---

## 📦 MERGE #3: Config Module

### Target: `src/lib/config.ts` (Single File)

**Files to Merge:**
- `src/lib/services/helper/api-config.ts` (100 lines)
- `src/lib/services/helper/service-config.ts` (300 lines)
- `src/lib/services/helper/system-config.ts` (200 lines)

**Resulting Structure:**
```typescript
// src/lib/config.ts (~550 lines)

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
export type PlatformId = 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo' | 'youtube';
export type MaintenanceType = 'off' | 'api' | 'full';
export interface PlatformDomainConfig {...}
export interface PlatformConfig {...}
export interface ServiceConfig {...}
export interface SystemConfig {...}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
export const PLATFORM_CONFIGS: Record<PlatformId, PlatformDomainConfig> = {...};
export const SYSTEM_CONFIG_DEFAULTS: SystemConfig = {...};

// ═══════════════════════════════════════════════════════════════
// PLATFORM CONFIG
// ═══════════════════════════════════════════════════════════════
export function platformGetBaseUrl(platform: PlatformId): string
export function platformGetReferer(platform: PlatformId): string
export function platformGetOrigin(platform: PlatformId): string
export function platformDetect(url: string): PlatformId | null
export function platformIsUrl(url: string, platform: PlatformId): boolean
export function platformMatches(url: string, platform: PlatformId): boolean
export function platformGetRegex(platform: PlatformId): RegExp
export function platformGetAliases(platform: PlatformId): string[]
export function platformGetDomainConfig(platform: PlatformId): PlatformDomainConfig
export function platformGetApiEndpoint(platform: PlatformId, endpoint: string): string

// ═══════════════════════════════════════════════════════════════
// SERVICE CONFIG
// ═══════════════════════════════════════════════════════════════
export async function serviceConfigLoad(): Promise<boolean>
export async function serviceConfigSaveGlobal(): Promise<boolean>
export async function serviceConfigSavePlatform(platformId: PlatformId): Promise<boolean>
export function serviceConfigGet(): ServiceConfig
export async function serviceConfigGetAsync(): Promise<ServiceConfig>
export function serviceConfigGetPlatform(platformId: PlatformId): PlatformConfig | null
export function serviceConfigIsPlatformEnabled(platformId: PlatformId): boolean
export function serviceConfigIsMaintenanceMode(): boolean
export function serviceConfigGetMaintenanceType(): MaintenanceType
export function serviceConfigGetMaintenanceMessage(): string
export function serviceConfigIsApiKeyRequired(): boolean
export function serviceConfigIsPlaygroundEnabled(): boolean
export function serviceConfigGetPlaygroundRateLimit(): number
export function serviceConfigGetGlobalRateLimit(): number
export function serviceConfigGetGeminiRateLimit(): number
export function serviceConfigGetGeminiRateWindow(): number
export function serviceConfigGetPlatformDisabledMessage(platformId: PlatformId): string
export function serviceConfigGetAllPlatforms(): PlatformConfig[]
export async function serviceConfigSetPlatformEnabled(platformId: PlatformId, enabled: boolean): Promise<boolean>
export async function serviceConfigSetMaintenanceMode(enabled: boolean, type?: MaintenanceType, message?: string): Promise<boolean>
export async function serviceConfigSetGlobalRateLimit(limit: number): Promise<boolean>
export async function serviceConfigSetPlaygroundEnabled(enabled: boolean): Promise<boolean>
export async function serviceConfigSetPlaygroundRateLimit(limit: number): Promise<boolean>
export async function serviceConfigSetGeminiRateLimit(limit: number, window?: number): Promise<boolean>
export function serviceConfigRecordRequest(platformId: PlatformId, success: boolean, responseTime: number): void
export async function serviceConfigUpdatePlatform(platformId: PlatformId, updates: Partial<PlatformConfig>): Promise<boolean>

// ═══════════════════════════════════════════════════════════════
// SYSTEM CONFIG
// ═══════════════════════════════════════════════════════════════
export async function sysConfigLoad(): Promise<boolean>
export function sysConfigGet(): SystemConfig
export function sysConfigCacheTtlConfig(): number
export function sysConfigCacheTtlApikeys(): number
export function sysConfigCacheTtlCookies(): number
export function sysConfigCacheTtlUseragents(): number
export function sysConfigCacheTtlPlaygroundUrl(): number
export function sysConfigHttpTimeout(): number
export function sysConfigHttpMaxRedirects(): number
export function sysConfigScraperTimeout(platform: string): number
export function sysConfigScraperMaxRetries(): number
export function sysConfigScraperRetryDelay(): number
export function sysConfigCookieCooldownMinutes(): number
export function sysConfigCookieMaxUsesDefault(): number
export function sysConfigRateLimitPublic(): number
export function sysConfigRateLimitApiKey(): number
export function sysConfigRateLimitAuth(): number
export function sysConfigRateLimitAdmin(): number
export async function sysConfigUpdate(updates: Partial<Record<string, number>>): Promise<boolean>
export async function sysConfigReset(): Promise<boolean>

// ═══════════════════════════════════════════════════════════════
// DEPRECATED ALIASES
// ═══════════════════════════════════════════════════════════════
/** @deprecated Use platformGetBaseUrl */ export const getBaseUrl = platformGetBaseUrl;
/** @deprecated Use platformDetect */ export const detectPlatform = platformDetect;
/** @deprecated Use serviceConfigGet */ export const getServiceConfig = serviceConfigGet;
/** @deprecated Use sysConfigGet */ export const getSystemConfig = sysConfigGet;
// ... etc
```

---

## 📦 MERGE #4: Auth Module

### Target: `src/lib/auth.ts` (Single File)

**Files to Merge:**
- `src/lib/utils/admin-auth.ts` (100 lines)
- `src/lib/services/helper/api-keys.ts` (200 lines)

**Resulting Structure:**
```typescript
// src/lib/auth.ts (~280 lines)

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
export type UserRole = 'user' | 'admin';
export interface AuthResult {...}
export interface ApiKey {...}
export interface ValidateResult {...}

// ═══════════════════════════════════════════════════════════════
// SESSION AUTH
// ═══════════════════════════════════════════════════════════════
export async function authVerifySession(request: NextRequest): Promise<AuthResult>
export async function authVerifyAdminSession(request: NextRequest): Promise<AuthResult>
export async function authVerifyAdminToken(request: NextRequest): Promise<{valid: boolean; username?: string; error?: string}>
export async function authVerifyApiKey(apiKey: string): Promise<ApiKeyValidation>

// ═══════════════════════════════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════
export async function apiKeyCreate(name: string, options?: {...}): Promise<{key: ApiKey; plainKey: string}>
export async function apiKeyGet(id: string): Promise<ApiKey | null>
export async function apiKeyGetAll(): Promise<ApiKey[]>
export async function apiKeyUpdate(id: string, updates: Partial<...>): Promise<boolean>
export async function apiKeyDelete(id: string): Promise<boolean>
export async function apiKeyValidate(plainKey: string): Promise<ValidateResult>
export async function apiKeyRecordUsage(keyId: string, success: boolean): Promise<void>
export function apiKeyExtract(request: Request): string | null

// ═══════════════════════════════════════════════════════════════
// DEPRECATED ALIASES
// ═══════════════════════════════════════════════════════════════
/** @deprecated Use authVerifySession */ export const verifySession = authVerifySession;
/** @deprecated Use authVerifyAdminSession */ export const verifyAdminSession = authVerifyAdminSession;
/** @deprecated Use apiKeyCreate */ export const createApiKey = apiKeyCreate;
// ... etc
```

---

## 📦 MERGE #5: Utils Module

### Target: `src/lib/utils.ts` (Single File)

**Files to Merge:**
- `src/lib/utils/security.ts` (200 lines)
- `src/lib/utils/http.ts` (200 lines)
- `src/lib/utils/format-utils.ts` (30 lines)
- `src/lib/utils/retry.ts` (80 lines)
- `src/lib/utils/error-ui.ts` (100 lines)
- `src/lib/utils/index.ts` (20 lines - DELETE after merge)

**Resulting Structure:**
```typescript
// src/lib/utils.ts (~580 lines)

// ═══════════════════════════════════════════════════════════════
// SECURITY
// ═══════════════════════════════════════════════════════════════
export function securityEscapeHtml(str: string): string
export function securitySanitizeObject<T>(obj: T): T
export function securityIsValidSocialUrl(url: string): {valid: boolean; error?: string}
export function securityIsValidCookie(cookie: string): {valid: boolean; error?: string}
export function securitySanitizeCookie(cookie: string): string
export function securityEncrypt(text: string): string
export function securityDecrypt(encryptedText: string): string
export function securityHashApiKey(key: string): string
export function securityGenerateToken(length?: number): string
export function securityMaskData(data: string, visibleChars?: number): string
export function securityMaskCookie(cookie: string): string
export function securityValidateRequestBody(body: unknown, maxSize?: number): {valid: boolean; error?: string}
export function securityDetectAttackPatterns(input: string): boolean
export function securityGetClientIP(request: Request): string

// ═══════════════════════════════════════════════════════════════
// HTTP UTILITIES
// ═══════════════════════════════════════════════════════════════
export async function httpUtilValidateMediaUrl(url: string, platform: PlatformId, timeout?: number): Promise<boolean>
export async function httpUtilFilterValidUrls(urls: string[], platform: PlatformId): Promise<string[]>
export function httpUtilDecodeUrl(s: string): string
export function httpUtilDecodeHtml(s: string): string
export function httpUtilIsValidMediaUrl(url: string, domains?: string[]): boolean
export function httpUtilIsSmallImage(url: string): boolean
export function httpUtilNormalizeUrl(url: string, platform: PlatformId): string
export function httpUtilCleanTrackingParams(url: string): string
export function httpUtilSuccessResponse(platform: PlatformId, data: MediaData): NextResponse
export function httpUtilErrorResponse(platform: PlatformId, error: string, status?: number): NextResponse
export function httpUtilMissingUrlResponse(p: PlatformId): NextResponse
export function httpUtilInvalidUrlResponse(p: PlatformId): NextResponse
export function httpUtilDedupeFormats(f: MediaFormat[]): MediaFormat[]
export function httpUtilDedupeByQuality(f: MediaFormat[]): MediaFormat[]
export function httpUtilGetQualityLabel(h: number): string
export function httpUtilGetQualityFromBitrate(b: number): string
export function httpUtilExtractByPatterns(html: string, patterns: RegExp[], decode?: boolean): string[]
export function httpUtilExtractVideos(html: string, patterns: {...}[]): Map<string, string>
export function httpUtilExtractMeta(html: string, $?: CheerioAPI): {title: string; thumbnail: string; description: string}
export function httpUtilCreateFormat(quality: string, type: 'video' | 'image' | 'audio', url: string, opts?: {...}): MediaFormat
export function httpUtilAddFormat(formats: MediaFormat[], quality: string, type: 'video' | 'image' | 'audio', url: string, opts?: {...}): void

// ═══════════════════════════════════════════════════════════════
// FORMATTING
// ═══════════════════════════════════════════════════════════════
export function formatBytes(bytes: number): string
export function formatSpeed(bytesPerSec: number): {mb: string; mbit: string}
export function parseFileSizeToBytes(sizeStr: string): number | undefined

// ═══════════════════════════════════════════════════════════════
// RETRY
// ═══════════════════════════════════════════════════════════════
export async function retryWith<T extends ScraperResult>(fn: (useCookie?: boolean) => Promise<T>, options?: RetryOptions): Promise<T>
export async function retryAsync<T>(fn: () => Promise<T>, maxRetries?: number, delay?: number): Promise<T>

// ═══════════════════════════════════════════════════════════════
// ERROR UI
// ═══════════════════════════════════════════════════════════════
export function errorUiGetDisplay(code: ScraperErrorCode, customMessage?: string): ErrorDisplay
export function errorUiGetDisplayFromString(codeStr: string, customMessage?: string): ErrorDisplay
export function errorUiNeedsCookie(code: ScraperErrorCode): boolean
export function errorUiShouldRetryWithCookie(code: ScraperErrorCode): boolean

// ═══════════════════════════════════════════════════════════════
// DEPRECATED ALIASES
// ═══════════════════════════════════════════════════════════════
/** @deprecated Use securityEscapeHtml */ export const escapeHtml = securityEscapeHtml;
/** @deprecated Use httpUtilDecodeUrl */ export const decodeUrl = httpUtilDecodeUrl;
/** @deprecated Use retryWith */ export const withRetry = retryWith;
/** @deprecated Use errorUiGetDisplay */ export const getErrorDisplay = errorUiGetDisplay;
// ... etc
```

---

## 📁 FILES TO DELETE AFTER MERGE

| File | Reason |
|------|--------|
| `src/lib/http/index.ts` | Barrel export, merged |
| `src/lib/cookies/index.ts` | Barrel export, merged |
| `src/lib/utils/index.ts` | Barrel export, merged |
| `src/lib/services/helper/index.ts` | Barrel export, merged |
| `src/lib/http/client.ts` | Merged into `http.ts` |
| `src/lib/http/anti-ban.ts` | Merged into `http.ts` |
| `src/lib/utils/cookie-parser.ts` | Merged into `cookies.ts` |
| `src/lib/utils/cookie-pool.ts` | Merged into `cookies.ts` |
| `src/lib/utils/admin-cookie.ts` | Merged into `cookies.ts` |
| `src/lib/utils/admin-auth.ts` | Merged into `auth.ts` |
| `src/lib/utils/security.ts` | Merged into `utils.ts` |
| `src/lib/utils/http.ts` | Merged into `utils.ts` |
| `src/lib/utils/format-utils.ts` | Merged into `utils.ts` |
| `src/lib/utils/retry.ts` | Merged into `utils.ts` |
| `src/lib/utils/error-ui.ts` | Merged into `utils.ts` |
| `src/lib/services/helper/api-config.ts` | Merged into `config.ts` |
| `src/lib/services/helper/service-config.ts` | Merged into `config.ts` |
| `src/lib/services/helper/system-config.ts` | Merged into `config.ts` |
| `src/lib/services/helper/api-keys.ts` | Merged into `auth.ts` |

**Total Files Deleted: 19**

---

## 📁 FINAL STRUCTURE

```
src/lib/
├── http.ts          # HTTP client + anti-ban + headers (NEW - merged)
├── cookies.ts       # Cookie parsing + pool + admin (NEW - merged)
├── config.ts        # Platform + service + system config (NEW - merged)
├── auth.ts          # Session auth + API keys (NEW - merged)
├── utils.ts         # Security + HTTP utils + format + retry + error (NEW - merged)
├── redis.ts         # Redis client (KEEP)
├── supabase.ts      # Supabase client (KEEP)
├── types/
│   └── index.ts     # Type definitions (KEEP)
├── url/
│   ├── index.ts     # URL utilities (KEEP)
│   └── pipeline.ts  # URL pipeline (KEEP)
├── integrations/
│   ├── admin-alerts.ts  # Admin alerts (KEEP)
│   └── gemini.ts        # Gemini AI (KEEP)
└── services/
    ├── index.ts         # Barrel export (KEEP)
    ├── facebook.ts      # Facebook scraper (KEEP)
    ├── instagram.ts     # Instagram scraper (KEEP)
    ├── twitter.ts       # Twitter scraper (KEEP)
    ├── tiktok.ts        # TikTok scraper (KEEP)
    ├── weibo.ts         # Weibo scraper (KEEP)
    ├── youtube.ts       # YouTube scraper (KEEP)
    └── helper/
        ├── cache.ts     # Cache utilities (KEEP - uses redis)
        └── logger.ts    # Logger (KEEP)
```

**Before: 35 files**
**After: 18 files**
**Reduction: 49%**
