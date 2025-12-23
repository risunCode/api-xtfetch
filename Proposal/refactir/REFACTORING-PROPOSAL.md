# 🔧 XTFetch API - Proposal Refactoring & Renaming

**Tanggal:** 23 Desember 2024  
**Versi:** 1.0  
**Author:** Kiro AI Assistant

---

## 📋 Executive Summary

Proposal ini berisi rencana lengkap untuk:
1. **Renaming** semua fungsi dengan naming convention yang konsisten
2. **Merging** file-file yang bisa digabung untuk mengurangi fragmentasi
3. **Restructuring** folder untuk organisasi yang lebih baik

---

## 🎯 Tujuan Refactoring

| Goal | Deskripsi |
|------|-----------|
| **Konsistensi** | Semua fungsi mengikuti naming convention yang sama |
| **Simplifikasi** | Mengurangi jumlah file dengan merge yang logis |
| **Maintainability** | Struktur yang lebih mudah di-maintain |
| **Discoverability** | Fungsi mudah ditemukan berdasarkan nama |

---

## 📁 STRUKTUR SAAT INI vs BARU

### Current Structure (Fragmentasi Tinggi)
```
src/
├── app/api/           # 30+ route files
├── core/              # 4 files
├── lib/
│   ├── cookies/       # 1 file (barrel)
│   ├── http/          # 3 files
│   ├── integrations/  # 2 files
│   ├── services/      # 7 files + helper/
│   │   └── helper/    # 7 files
│   ├── types/         # 1 file
│   ├── url/           # 2 files
│   └── utils/         # 10 files
```

### Proposed Structure (Merged & Clean)
```
src/
├── app/api/           # Tetap (Next.js convention)
├── core/              # Domain logic
│   ├── index.ts
│   ├── config.ts      # MERGE: config/index.ts
│   ├── scrapers.ts    # MERGE: scrapers/index.ts + types.ts
│   ├── security.ts    # Tetap
│   └── database.ts    # Tetap
├── lib/
│   ├── http.ts        # MERGE: http/client.ts + anti-ban.ts + index.ts
│   ├── cookies.ts     # MERGE: utils/cookie-*.ts + admin-cookie.ts
│   ├── cache.ts       # MERGE: services/helper/cache.ts
│   ├── config.ts      # MERGE: services/helper/*-config.ts
│   ├── auth.ts        # MERGE: utils/admin-auth.ts + api-keys.ts
│   ├── utils.ts       # MERGE: utils/*.ts (remaining)
│   ├── redis.ts       # Tetap
│   ├── supabase.ts    # Tetap
│   └── services/      # Platform scrapers
│       ├── index.ts
│       ├── facebook.ts
│       ├── instagram.ts
│       ├── twitter.ts
│       ├── tiktok.ts
│       ├── weibo.ts
│       └── youtube.ts
```

---

## 🔤 NAMING CONVENTION

### Rules
1. **camelCase** untuk semua fungsi
2. **Prefix berdasarkan domain:**
   - `scrape*` - Scraping functions
   - `http*` - HTTP operations
   - `cookie*` - Cookie management
   - `cache*` - Caching operations
   - `auth*` - Authentication
   - `config*` - Configuration
   - `format*` - Formatting utilities
   - `validate*` - Validation functions
   - `parse*` - Parsing functions

3. **Suffix berdasarkan behavior:**
   - `*Async` - Async version of sync function
   - `*ByKey` - Operation by specific key
   - `*All` - Bulk operation

---

## 📝 DETAIL RENAMING PER MODULE

### 1. SCRAPERS (`lib/services/*.ts`)

| File | Old Name | New Name | Notes |
|------|----------|----------|-------|
| facebook.ts | `scrapeFacebook` | `scrapeFacebook` | ✅ Keep |
| instagram.ts | `scrapeInstagram` | `scrapeInstagram` | ✅ Keep |
| twitter.ts | `scrapeTwitter` | `scrapeTwitter` | ✅ Keep |
| tiktok.ts | `scrapeTikTok` | `scrapeTiktok` | Fix casing |
| tiktok.ts | `fetchTikWM` | ❌ DELETE | Duplicate alias |
| weibo.ts | `scrapeWeibo` | `scrapeWeibo` | ✅ Keep |
| youtube.ts | `scrapeYouTube` | `scrapeYoutube` | Fix casing |
| youtube.ts | `isYouTubeUrl` | `isYoutubeUrl` | Fix casing |
| youtube.ts | `extractYouTubeId` | `extractYoutubeId` | Fix casing |

**Internal Functions (facebook.ts):**
| Old Name | New Name |
|----------|----------|
| `detectType` | `detectFacebookContentType` |
| `extractVideoId` | `extractFacebookVideoId` |
| `extractPostId` | `extractFacebookPostId` |
| `findTargetBlock` | `findFacebookTargetBlock` |
| `extractVideos` | `extractFacebookVideos` |
| `extractStories` | `extractFacebookStories` |
| `extractImages` | `extractFacebookImages` |
| `extractAuthor` | `extractFacebookAuthor` |
| `extractDescription` | `extractFacebookDescription` |
| `extractPostDate` | `extractFacebookPostDate` |
| `extractEngagement` | `extractFacebookEngagement` |
| `detectContentIssue` | `detectFacebookContentIssue` |

**Internal Functions (instagram.ts):**
| Old Name | New Name |
|----------|----------|
| `detectContentType` | `detectInstagramContentType` |
| `extractShortcode` | `extractInstagramShortcode` |
| `extractStoryInfo` | `extractInstagramStoryInfo` |
| `fetchGraphQL` | `fetchInstagramGraphQL` |
| `parseGraphQLMedia` | `parseInstagramGraphQLMedia` |
| `fetchEmbed` | `fetchInstagramEmbed` |
| `getUserId` | `getInstagramUserId` |
| `scrapeStory` | `scrapeInstagramStory` |

**Internal Functions (twitter.ts):**
| Old Name | New Name |
|----------|----------|
| `fetchSyndication` | `fetchTwitterSyndication` |
| `fetchWithGraphQL` | `fetchTwitterGraphQL` |
| `getCt0` | `getTwitterCt0Token` |
| `parseMedia` | `parseTwitterMedia` |

---

### 2. HTTP MODULE (`lib/http/`)

**MERGE INTO: `lib/http.ts`**

| Source File | Old Name | New Name |
|-------------|----------|----------|
| client.ts | `httpGet` | `httpGet` | ✅ Keep |
| client.ts | `httpPost` | `httpPost` | ✅ Keep |
| client.ts | `httpHead` | `httpHead` | ✅ Keep |
| client.ts | `resolveUrl` | `httpResolveUrl` | Add prefix |
| client.ts | `getUserAgent` | `httpGetUserAgent` | Add prefix |
| client.ts | `getUserAgentAsync` | `httpGetUserAgentAsync` | Add prefix |
| client.ts | `getApiHeaders` | `httpGetApiHeaders` | Add prefix |
| client.ts | `getApiHeadersAsync` | `httpGetApiHeadersAsync` | Add prefix |
| client.ts | `getBrowserHeaders` | `httpGetBrowserHeaders` | Add prefix |
| client.ts | `getBrowserHeadersAsync` | `httpGetBrowserHeadersAsync` | Add prefix |
| client.ts | `getSecureHeaders` | `httpGetSecureHeaders` | Add prefix |
| client.ts | `getSecureHeadersAsync` | `httpGetSecureHeadersAsync` | Add prefix |
| anti-ban.ts | `getRotatingHeaders` | `httpGetRotatingHeaders` | Add prefix |
| anti-ban.ts | `getRotatingHeadersAsync` | `httpGetRotatingHeadersAsync` | Add prefix |
| anti-ban.ts | `getRandomProfile` | `httpGetRandomProfile` | Add prefix |
| anti-ban.ts | `getRandomProfileAsync` | `httpGetRandomProfileAsync` | Add prefix |
| anti-ban.ts | `getRandomDelay` | `httpGetRandomDelay` | Add prefix |
| anti-ban.ts | `randomSleep` | `httpRandomSleep` | Add prefix |
| anti-ban.ts | `shouldThrottle` | `httpShouldThrottle` | Add prefix |
| anti-ban.ts | `trackRequest` | `httpTrackRequest` | Add prefix |
| anti-ban.ts | `markRateLimited` | `httpMarkRateLimited` | Add prefix |
| anti-ban.ts | `markProfileUsed` | `httpMarkProfileUsed` | Add prefix |
| anti-ban.ts | `markProfileSuccess` | `httpMarkProfileSuccess` | Add prefix |
| anti-ban.ts | `markProfileError` | `httpMarkProfileError` | Add prefix |
| anti-ban.ts | `clearProfileCache` | `httpClearProfileCache` | Add prefix |
| anti-ban.ts | `preloadProfiles` | `httpPreloadProfiles` | Add prefix |

---

### 3. COOKIE MODULE (`lib/utils/cookie-*.ts` + `admin-cookie.ts`)

**MERGE INTO: `lib/cookies.ts`**

| Source File | Old Name | New Name |
|-------------|----------|----------|
| cookie-parser.ts | `parseCookie` | `cookieParse` | Verb first |
| cookie-parser.ts | `validateCookie` | `cookieValidate` | Verb first |
| cookie-parser.ts | `isCookieLike` | `cookieIsLike` | Verb first |
| cookie-parser.ts | `getCookieFormat` | `cookieGetFormat` | Verb first |
| cookie-pool.ts | `getRotatingCookie` | `cookieGetRotating` | Verb first |
| cookie-pool.ts | `markCookieSuccess` | `cookieMarkSuccess` | Verb first |
| cookie-pool.ts | `markCookieError` | `cookieMarkError` | Verb first |
| cookie-pool.ts | `markCookieCooldown` | `cookieMarkCooldown` | Verb first |
| cookie-pool.ts | `markCookieExpired` | `cookieMarkExpired` | Verb first |
| cookie-pool.ts | `getCookiesByPlatform` | `cookieGetByPlatform` | Verb first |
| cookie-pool.ts | `getCookiePoolStats` | `cookieGetPoolStats` | Verb first |
| cookie-pool.ts | `addCookieToPool` | `cookieAddToPool` | Verb first |
| cookie-pool.ts | `updatePooledCookie` | `cookieUpdatePooled` | Verb first |
| cookie-pool.ts | `deleteCookieFromPool` | `cookieDeleteFromPool` | Verb first |
| cookie-pool.ts | `testCookieHealth` | `cookieTestHealth` | Verb first |
| cookie-pool.ts | `getDecryptedCookie` | `cookieGetDecrypted` | Verb first |
| cookie-pool.ts | `migrateUnencryptedCookies` | `cookieMigrateUnencrypted` | Verb first |
| admin-cookie.ts | `getAdminCookie` | `cookieGetAdmin` | Verb first |
| admin-cookie.ts | `hasAdminCookie` | `cookieHasAdmin` | Verb first |
| admin-cookie.ts | `getAllAdminCookies` | `cookieGetAllAdmin` | Verb first |
| admin-cookie.ts | `setAdminCookie` | `cookieSetAdmin` | Verb first |
| admin-cookie.ts | `toggleAdminCookie` | `cookieToggleAdmin` | Verb first |
| admin-cookie.ts | `deleteAdminCookie` | `cookieDeleteAdmin` | Verb first |
| admin-cookie.ts | `clearAdminCookieCache` | `cookieClearAdminCache` | Verb first |

---

### 4. CACHE MODULE (`lib/services/helper/cache.ts`)

**MERGE INTO: `lib/cache.ts`**

| Old Name | New Name |
|----------|----------|
| `getCache` | `cacheGet` |
| `getCacheByKey` | `cacheGetByKey` |
| `setCache` | `cacheSet` |
| `setCacheByKey` | `cacheSetByKey` |
| `hasCache` | `cacheHas` |
| `clearCache` | `cacheClear` |
| `getCacheStats` | `cacheGetStats` |
| `cleanupCache` | `cacheCleanup` |
| `getCacheKey` | `cacheGetKey` |
| `getResultCacheKeyLegacy` | `cacheGetKeyLegacy` |

---

### 5. CONFIG MODULE (`lib/services/helper/*-config.ts`)

**MERGE INTO: `lib/config.ts`**

#### From api-config.ts:
| Old Name | New Name |
|----------|----------|
| `getBaseUrl` | `configGetBaseUrl` |
| `getReferer` | `configGetReferer` |
| `getOrigin` | `configGetOrigin` |
| `detectPlatform` | `configDetectPlatform` |
| `isPlatformUrl` | `configIsPlatformUrl` |
| `matchesPlatform` | `configMatchesPlatform` |
| `getPlatformRegex` | `configGetPlatformRegex` |
| `getPlatformAliases` | `configGetPlatformAliases` |
| `getPlatformDomainConfig` | `configGetPlatformDomain` |
| `getApiEndpoint` | `configGetApiEndpoint` |

#### From service-config.ts:
| Old Name | New Name |
|----------|----------|
| `loadConfigFromDB` | `configLoadFromDB` |
| `saveGlobalConfig` | `configSaveGlobal` |
| `savePlatformConfig` | `configSavePlatform` |
| `getServiceConfig` | `configGetService` |
| `getServiceConfigAsync` | `configGetServiceAsync` |
| `getPlatformConfig` | `configGetPlatform` |
| `isPlatformEnabled` | `configIsPlatformEnabled` |
| `isMaintenanceMode` | `configIsMaintenanceMode` |
| `getMaintenanceType` | `configGetMaintenanceType` |
| `getMaintenanceMessage` | `configGetMaintenanceMessage` |
| `isApiKeyRequired` | `configIsApiKeyRequired` |
| `isPlaygroundEnabled` | `configIsPlaygroundEnabled` |
| `getPlaygroundRateLimit` | `configGetPlaygroundRateLimit` |
| `getGlobalRateLimit` | `configGetGlobalRateLimit` |
| `getGeminiRateLimit` | `configGetGeminiRateLimit` |
| `getGeminiRateWindow` | `configGetGeminiRateWindow` |
| `getPlatformDisabledMessage` | `configGetPlatformDisabledMessage` |
| `getAllPlatforms` | `configGetAllPlatforms` |
| `setPlatformEnabled` | `configSetPlatformEnabled` |
| `setMaintenanceMode` | `configSetMaintenanceMode` |
| `setGlobalRateLimit` | `configSetGlobalRateLimit` |
| `setPlaygroundEnabled` | `configSetPlaygroundEnabled` |
| `setPlaygroundRateLimit` | `configSetPlaygroundRateLimit` |
| `setGeminiRateLimit` | `configSetGeminiRateLimit` |
| `recordRequest` | `configRecordRequest` |
| `updatePlatformConfig` | `configUpdatePlatform` |

#### From system-config.ts:
| Old Name | New Name |
|----------|----------|
| `loadSystemConfig` | `sysConfigLoad` |
| `getSystemConfig` | `sysConfigGet` |
| `getCacheTtlConfig` | `sysConfigGetCacheTtlConfig` |
| `getCacheTtlApikeys` | `sysConfigGetCacheTtlApikeys` |
| `getCacheTtlCookies` | `sysConfigGetCacheTtlCookies` |
| `getCacheTtlUseragents` | `sysConfigGetCacheTtlUseragents` |
| `getCacheTtlPlaygroundUrl` | `sysConfigGetCacheTtlPlaygroundUrl` |
| `getHttpTimeout` | `sysConfigGetHttpTimeout` |
| `getHttpMaxRedirects` | `sysConfigGetHttpMaxRedirects` |
| `getScraperTimeout` | `sysConfigGetScraperTimeout` |
| `getScraperMaxRetries` | `sysConfigGetScraperMaxRetries` |
| `getScraperRetryDelay` | `sysConfigGetScraperRetryDelay` |
| `getCookieCooldownMinutes` | `sysConfigGetCookieCooldownMinutes` |
| `getCookieMaxUsesDefault` | `sysConfigGetCookieMaxUsesDefault` |
| `getRateLimitPublic` | `sysConfigGetRateLimitPublic` |
| `getRateLimitApiKey` | `sysConfigGetRateLimitApiKey` |
| `getRateLimitAuth` | `sysConfigGetRateLimitAuth` |
| `getRateLimitAdmin` | `sysConfigGetRateLimitAdmin` |
| `updateSystemConfig` | `sysConfigUpdate` |
| `resetSystemConfig` | `sysConfigReset` |

---

### 6. AUTH MODULE (`lib/utils/admin-auth.ts` + `api-keys.ts`)

**MERGE INTO: `lib/auth.ts`**

#### From admin-auth.ts:
| Old Name | New Name |
|----------|----------|
| `verifySession` | `authVerifySession` |
| `verifyAdminSession` | `authVerifyAdminSession` |
| `verifyAdminToken` | `authVerifyAdminToken` |
| `verifyApiKey` | `authVerifyApiKey` |

#### From api-keys.ts:
| Old Name | New Name |
|----------|----------|
| `createApiKey` | `apiKeyCreate` |
| `getApiKey` | `apiKeyGet` |
| `getAllApiKeys` | `apiKeyGetAll` |
| `updateApiKey` | `apiKeyUpdate` |
| `deleteApiKey` | `apiKeyDelete` |
| `validateApiKey` | `apiKeyValidate` |
| `recordKeyUsage` | `apiKeyRecordUsage` |
| `extractApiKey` | `apiKeyExtract` |

---

### 7. UTILS MODULE (`lib/utils/*.ts`)

**MERGE INTO: `lib/utils.ts`**

#### From security.ts:
| Old Name | New Name |
|----------|----------|
| `escapeHtml` | `securityEscapeHtml` |
| `sanitizeObject` | `securitySanitizeObject` |
| `isValidSocialUrl` | `securityIsValidSocialUrl` |
| `isValidCookie` | `securityIsValidCookie` |
| `sanitizeCookie` | `securitySanitizeCookie` |
| `encrypt` | `securityEncrypt` |
| `decrypt` | `securityDecrypt` |
| `hashApiKey` | `securityHashApiKey` |
| `generateSecureToken` | `securityGenerateToken` |
| `maskSensitiveData` | `securityMaskData` |
| `maskCookie` | `securityMaskCookie` |
| `validateRequestBody` | `securityValidateRequestBody` |
| `detectAttackPatterns` | `securityDetectAttackPatterns` |
| `getClientIP` | `securityGetClientIP` |

#### From http.ts (utils):
| Old Name | New Name |
|----------|----------|
| `validateMediaUrl` | `utilValidateMediaUrl` |
| `filterValidUrls` | `utilFilterValidUrls` |
| `decodeUrl` | `utilDecodeUrl` |
| `decodeHtml` | `utilDecodeHtml` |
| `isValidMediaUrl` | `utilIsValidMediaUrl` |
| `isSmallImage` | `utilIsSmallImage` |
| `normalizeUrl` | `utilNormalizeUrl` |
| `cleanTrackingParams` | `utilCleanTrackingParams` |
| `successResponse` | `utilSuccessResponse` |
| `errorResponse` | `utilErrorResponse` |
| `missingUrlResponse` | `utilMissingUrlResponse` |
| `invalidUrlResponse` | `utilInvalidUrlResponse` |
| `dedupeFormats` | `utilDedupeFormats` |
| `dedupeByQuality` | `utilDedupeByQuality` |
| `getQualityLabel` | `utilGetQualityLabel` |
| `getQualityFromBitrate` | `utilGetQualityFromBitrate` |
| `extractByPatterns` | `utilExtractByPatterns` |
| `extractVideos` | `utilExtractVideos` |
| `extractMeta` | `utilExtractMeta` |
| `createFormat` | `utilCreateFormat` |
| `addFormat` | `utilAddFormat` |

#### From format-utils.ts:
| Old Name | New Name |
|----------|----------|
| `formatBytes` | `formatBytes` | ✅ Keep |
| `formatSpeed` | `formatSpeed` | ✅ Keep |
| `parseFileSizeToBytes` | `parseFileSizeToBytes` | ✅ Keep |

#### From retry.ts:
| Old Name | New Name |
|----------|----------|
| `withRetry` | `utilWithRetry` |
| `retryAsync` | `utilRetryAsync` |

#### From error-ui.ts:
| Old Name | New Name |
|----------|----------|
| `getErrorDisplay` | `errorGetDisplay` |
| `getErrorDisplayFromString` | `errorGetDisplayFromString` |
| `needsCookie` | `errorNeedsCookie` |
| `shouldRetryWithCookie` | `errorShouldRetryWithCookie` |

---

### 8. LOGGER (`lib/services/helper/logger.ts`)

**KEEP AS IS** - Already well-structured

| Method | Status |
|--------|--------|
| `logger.url` | ✅ Keep |
| `logger.resolve` | ✅ Keep |
| `logger.type` | ✅ Keep |
| `logger.media` | ✅ Keep |
| `logger.complete` | ✅ Keep |
| `logger.cache` | ✅ Keep |
| `logger.redis` | ✅ Keep |
| `logger.meta` | ✅ Keep |
| `logger.success` | ✅ Keep |
| `logger.error` | ✅ Keep |
| `logger.warn` | ✅ Keep |
| `logger.debug` | ✅ Keep |

---

## 📦 FILE MERGING PLAN

### Phase 1: Core Merges
| Files to Merge | Target File | Lines Saved |
|----------------|-------------|-------------|
| `core/config/index.ts` | `core/config.ts` | ~50 |
| `core/scrapers/index.ts` + `types.ts` | `core/scrapers.ts` | ~30 |

### Phase 2: HTTP Merge
| Files to Merge | Target File | Lines Saved |
|----------------|-------------|-------------|
| `lib/http/client.ts` + `anti-ban.ts` + `index.ts` | `lib/http.ts` | ~100 |

### Phase 3: Utils Merge
| Files to Merge | Target File | Lines Saved |
|----------------|-------------|-------------|
| `lib/utils/cookie-parser.ts` + `cookie-pool.ts` + `admin-cookie.ts` | `lib/cookies.ts` | ~150 |
| `lib/utils/admin-auth.ts` + `services/helper/api-keys.ts` | `lib/auth.ts` | ~100 |
| `lib/utils/security.ts` + `http.ts` + `format-utils.ts` + `retry.ts` + `error-ui.ts` | `lib/utils.ts` | ~200 |

### Phase 4: Config Merge
| Files to Merge | Target File | Lines Saved |
|----------------|-------------|-------------|
| `services/helper/api-config.ts` + `service-config.ts` + `system-config.ts` | `lib/config.ts` | ~300 |

### Phase 5: Cleanup
| Action | Files |
|--------|-------|
| DELETE | `lib/utils/index.ts` (barrel) |
| DELETE | `lib/http/index.ts` (barrel) |
| DELETE | `lib/cookies/index.ts` (barrel) |
| DELETE | `lib/services/helper/index.ts` (barrel) |

**Total Estimated Lines Saved: ~930 lines**
**Total Files Reduced: 25 → 12 files**

---

## 🔄 MIGRATION STRATEGY

### Step 1: Create New Files (Non-Breaking)
1. Create merged files dengan nama baru
2. Export semua fungsi dengan nama baru DAN lama (alias)
3. Test semua functionality

### Step 2: Update Imports (Gradual)
1. Update imports di API routes satu per satu
2. Update imports di services
3. Run tests after each batch

### Step 3: Deprecate Old Names
1. Add `@deprecated` JSDoc ke fungsi lama
2. Log warning saat fungsi lama dipanggil
3. Set deadline untuk removal

### Step 4: Remove Old Files
1. Remove barrel exports
2. Remove deprecated aliases
3. Delete old files

---

## ⚠️ BREAKING CHANGES

### External API (No Changes)
- All `/api/v1/*` endpoints tetap sama
- All `/api/admin/*` endpoints tetap sama
- Response format tidak berubah

### Internal Changes
- Import paths berubah
- Function names berubah (dengan alias period)
- File structure berubah

---

## 📊 IMPACT ANALYSIS

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total Files | 45 | 32 | -29% |
| Total Lines | ~4500 | ~3600 | -20% |
| Import Statements | ~200 | ~120 | -40% |
| Barrel Files | 6 | 0 | -100% |
| Naming Inconsistencies | 50+ | 0 | -100% |

---

## 🗓️ TIMELINE

| Phase | Duration | Tasks |
|-------|----------|-------|
| Week 1 | 3 days | Create merged files, add aliases |
| Week 2 | 4 days | Update all imports |
| Week 3 | 2 days | Testing & bug fixes |
| Week 4 | 2 days | Remove deprecated code |

**Total: ~11 working days**

---

## ✅ CHECKLIST

- [ ] Backup current codebase
- [ ] Create feature branch `refactor/naming-convention`
- [ ] Phase 1: Core merges
- [ ] Phase 2: HTTP merge
- [ ] Phase 3: Utils merge
- [ ] Phase 4: Config merge
- [ ] Phase 5: Cleanup
- [ ] Update all imports
- [ ] Run full test suite
- [ ] Update documentation
- [ ] Code review
- [ ] Merge to main

---

## 📝 NOTES

1. **Backward Compatibility**: Semua fungsi lama akan tetap work selama transition period (2 minggu)
2. **TypeScript**: Semua rename akan di-handle oleh TypeScript compiler
3. **Testing**: Setiap phase harus di-test sebelum lanjut
4. **Rollback Plan**: Jika ada issue major, revert ke commit sebelum refactor

---

*Proposal ini dibuat berdasarkan analisis struktur kode saat ini. Implementasi actual mungkin memerlukan adjustment berdasarkan feedback dan testing.*
