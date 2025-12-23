# 📋 Detailed Breakdown - File by File Analysis

## 🗂️ CURRENT FILE INVENTORY

### `/src/lib/services/` - Platform Scrapers

#### 1. `facebook.ts` (500+ lines)
**Exported Functions:**
```typescript
export async function scrapeFacebook(inputUrl: string, options?: ScraperOptions): Promise<ScraperResult>
```

**Internal Functions (Private):**
| Function | Lines | Purpose | Rename To |
|----------|-------|---------|-----------|
| `isValidMedia` | 1 | Validate media URL | `_isValidFbMedia` |
| `isSkipImage` | 1 | Check skip patterns | `_shouldSkipFbImage` |
| `clean` | 1 | Clean URL string | `_cleanFbUrl` |
| `getQuality` | 1 | Get quality label | `_getFbQualityLabel` |
| `getResValue` | 1 | Parse resolution | `_parseFbResolution` |
| `detectContentIssue` | 10 | Detect content issues | `_detectFbContentIssue` |
| `detectType` | 6 | Detect content type | `_detectFbContentType` |
| `extractVideoId` | 1 | Extract video ID | `_extractFbVideoId` |
| `extractPostId` | 8 | Extract post ID | `_extractFbPostId` |
| `findTargetBlock` | 50 | Find HTML block | `_findFbTargetBlock` |
| `extractVideos` | 60 | Extract video URLs | `_extractFbVideos` |
| `extractStories` | 40 | Extract story media | `_extractFbStories` |
| `extractImages` | 80 | Extract image URLs | `_extractFbImages` |
| `extractAuthor` | 10 | Extract author name | `_extractFbAuthor` |
| `extractDescription` | 8 | Extract description | `_extractFbDescription` |
| `extractPostDate` | 3 | Extract post date | `_extractFbPostDate` |
| `extractEngagement` | 15 | Extract engagement | `_extractFbEngagement` |

**Constants:**
| Constant | Purpose | Keep/Remove |
|----------|---------|-------------|
| `SKIP_SIDS` | Skip image SIDs | Keep |
| `AGE_RESTRICTED_PATTERNS` | Age check patterns | Keep |
| `PRIVATE_CONTENT_PATTERNS` | Private check patterns | Keep |

---

#### 2. `instagram.ts` (300+ lines)
**Exported Functions:**
```typescript
export async function scrapeInstagram(url: string, options?: ScraperOptions): Promise<ScraperResult>
```

**Internal Functions:**
| Function | Lines | Purpose | Rename To |
|----------|-------|---------|-----------|
| `detectContentType` | 5 | Detect content type | `_detectIgContentType` |
| `extractShortcode` | 3 | Extract shortcode | `_extractIgShortcode` |
| `extractStoryInfo` | 3 | Extract story info | `_extractIgStoryInfo` |
| `fetchGraphQL` | 15 | Fetch GraphQL API | `_fetchIgGraphQL` |
| `parseGraphQLMedia` | 40 | Parse GraphQL response | `_parseIgGraphQLMedia` |
| `fetchEmbed` | 25 | Fetch embed page | `_fetchIgEmbed` |
| `getUserId` | 10 | Get user ID | `_getIgUserId` |
| `scrapeStory` | 50 | Scrape story | `_scrapeIgStory` |

**Constants:**
| Constant | Purpose |
|----------|---------|
| `GRAPHQL_DOC_ID` | GraphQL document ID |

---

#### 3. `twitter.ts` (250+ lines)
**Exported Functions:**
```typescript
export async function scrapeTwitter(url: string, options?: ScraperOptions): Promise<ScraperResult>
```

**Internal Functions:**
| Function | Lines | Purpose | Rename To |
|----------|-------|---------|-----------|
| `fetchSyndication` | 15 | Fetch syndication API | `_fetchTwSyndication` |
| `fetchWithGraphQL` | 50 | Fetch GraphQL API | `_fetchTwGraphQL` |
| `getCt0` | 3 | Get ct0 token | `_getTwCt0Token` |
| `parseMedia` | 40 | Parse media data | `_parseTwMedia` |

**Constants:**
| Constant | Purpose |
|----------|---------|
| `BEARER_TOKEN` | Twitter bearer token |

---

#### 4. `tiktok.ts` (100+ lines)
**Exported Functions:**
```typescript
export async function scrapeTikTok(url: string, options?: ScraperOptions): Promise<ScraperResult>
export const fetchTikWM = scrapeTikTok; // REMOVE - duplicate alias
```

**Action:** Remove `fetchTikWM` alias, rename to `scrapeTiktok`

---

#### 5. `weibo.ts` (250+ lines)
**Exported Functions:**
```typescript
export async function scrapeWeibo(url: string, options?: ScraperOptions): Promise<ScraperResult>
```

**No internal functions to rename** - all logic inline

---

#### 6. `youtube.ts` (150+ lines)
**Exported Functions:**
```typescript
export async function scrapeYouTube(url: string, options?: ScraperOptions): Promise<ScraperResult>
export function isYouTubeUrl(url: string): boolean
export function extractYouTubeId(url: string): string | null
```

**Rename:**
- `scrapeYouTube` → `scrapeYoutube`
- `isYouTubeUrl` → `isYoutubeUrl`
- `extractYouTubeId` → `extractYoutubeId`

---

### `/src/lib/services/helper/` - Helper Modules

#### 7. `api-config.ts` (100 lines)
**Exported Functions:**
| Current | New Name | Notes |
|---------|----------|-------|
| `getBaseUrl` | `platformGetBaseUrl` | |
| `getReferer` | `platformGetReferer` | |
| `getOrigin` | `platformGetOrigin` | |
| `detectPlatform` | `platformDetect` | |
| `isPlatformUrl` | `platformIsUrl` | |
| `matchesPlatform` | `platformMatches` | |
| `getPlatformRegex` | `platformGetRegex` | |
| `getPlatformAliases` | `platformGetAliases` | |
| `getPlatformDomainConfig` | `platformGetDomainConfig` | |
| `getApiEndpoint` | `platformGetApiEndpoint` | |

**Constants:**
| Constant | Keep |
|----------|------|
| `PLATFORM_CONFIGS` | ✅ |

---

#### 8. `api-keys.ts` (200 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `createApiKey` | `apiKeyCreate` |
| `getApiKey` | `apiKeyGet` |
| `getAllApiKeys` | `apiKeyGetAll` |
| `updateApiKey` | `apiKeyUpdate` |
| `deleteApiKey` | `apiKeyDelete` |
| `validateApiKey` | `apiKeyValidate` |
| `recordKeyUsage` | `apiKeyRecordUsage` |
| `extractApiKey` | `apiKeyExtract` |

**Internal Functions:**
| Function | Rename To |
|----------|-----------|
| `generateKeyId` | `_generateApiKeyId` |
| `generateApiKeyString` | `_generateApiKeyString` |
| `hashKey` | `_hashApiKey` |
| `loadKeysFromDB` | `_loadApiKeysFromDB` |
| `ensureFreshCache` | `_ensureApiKeyCache` |
| `checkKeyRateLimit` | `_checkApiKeyRateLimit` |
| `cleanupRateLimits` | `_cleanupApiKeyRateLimits` |

---

#### 9. `cache.ts` (60 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
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

#### 10. `logger.ts` (80 lines)
**Keep as-is** - Already well-structured with `logger.*` pattern

---

#### 11. `service-config.ts` (300 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `loadConfigFromDB` | `serviceConfigLoad` |
| `saveGlobalConfig` | `serviceConfigSaveGlobal` |
| `savePlatformConfig` | `serviceConfigSavePlatform` |
| `getServiceConfig` | `serviceConfigGet` |
| `getServiceConfigAsync` | `serviceConfigGetAsync` |
| `getPlatformConfig` | `serviceConfigGetPlatform` |
| `isPlatformEnabled` | `serviceConfigIsPlatformEnabled` |
| `isMaintenanceMode` | `serviceConfigIsMaintenanceMode` |
| `getMaintenanceType` | `serviceConfigGetMaintenanceType` |
| `getMaintenanceMessage` | `serviceConfigGetMaintenanceMessage` |
| `isApiKeyRequired` | `serviceConfigIsApiKeyRequired` |
| `isPlaygroundEnabled` | `serviceConfigIsPlaygroundEnabled` |
| `getPlaygroundRateLimit` | `serviceConfigGetPlaygroundRateLimit` |
| `getGlobalRateLimit` | `serviceConfigGetGlobalRateLimit` |
| `getGeminiRateLimit` | `serviceConfigGetGeminiRateLimit` |
| `getGeminiRateWindow` | `serviceConfigGetGeminiRateWindow` |
| `getPlatformDisabledMessage` | `serviceConfigGetPlatformDisabledMessage` |
| `getAllPlatforms` | `serviceConfigGetAllPlatforms` |
| `setPlatformEnabled` | `serviceConfigSetPlatformEnabled` |
| `setMaintenanceMode` | `serviceConfigSetMaintenanceMode` |
| `setGlobalRateLimit` | `serviceConfigSetGlobalRateLimit` |
| `setPlaygroundEnabled` | `serviceConfigSetPlaygroundEnabled` |
| `setPlaygroundRateLimit` | `serviceConfigSetPlaygroundRateLimit` |
| `setGeminiRateLimit` | `serviceConfigSetGeminiRateLimit` |
| `recordRequest` | `serviceConfigRecordRequest` |
| `updatePlatformConfig` | `serviceConfigUpdatePlatform` |

---

#### 12. `system-config.ts` (200 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `loadSystemConfig` | `sysConfigLoad` |
| `getSystemConfig` | `sysConfigGet` |
| `getCacheTtlConfig` | `sysConfigCacheTtlConfig` |
| `getCacheTtlApikeys` | `sysConfigCacheTtlApikeys` |
| `getCacheTtlCookies` | `sysConfigCacheTtlCookies` |
| `getCacheTtlUseragents` | `sysConfigCacheTtlUseragents` |
| `getCacheTtlPlaygroundUrl` | `sysConfigCacheTtlPlaygroundUrl` |
| `getHttpTimeout` | `sysConfigHttpTimeout` |
| `getHttpMaxRedirects` | `sysConfigHttpMaxRedirects` |
| `getScraperTimeout` | `sysConfigScraperTimeout` |
| `getScraperMaxRetries` | `sysConfigScraperMaxRetries` |
| `getScraperRetryDelay` | `sysConfigScraperRetryDelay` |
| `getCookieCooldownMinutes` | `sysConfigCookieCooldownMinutes` |
| `getCookieMaxUsesDefault` | `sysConfigCookieMaxUsesDefault` |
| `getRateLimitPublic` | `sysConfigRateLimitPublic` |
| `getRateLimitApiKey` | `sysConfigRateLimitApiKey` |
| `getRateLimitAuth` | `sysConfigRateLimitAuth` |
| `getRateLimitAdmin` | `sysConfigRateLimitAdmin` |
| `updateSystemConfig` | `sysConfigUpdate` |
| `resetSystemConfig` | `sysConfigReset` |

---

### `/src/lib/utils/` - Utility Modules

#### 13. `admin-auth.ts` (100 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `verifySession` | `authVerifySession` |
| `verifyAdminSession` | `authVerifyAdminSession` |
| `verifyAdminToken` | `authVerifyAdminToken` |
| `verifyApiKey` | `authVerifyApiKey` |

---

#### 14. `admin-cookie.ts` (150 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `getAdminCookie` | `adminCookieGet` |
| `hasAdminCookie` | `adminCookieHas` |
| `getAllAdminCookies` | `adminCookieGetAll` |
| `setAdminCookie` | `adminCookieSet` |
| `toggleAdminCookie` | `adminCookieToggle` |
| `deleteAdminCookie` | `adminCookieDelete` |
| `clearAdminCookieCache` | `adminCookieClearCache` |

**Internal Functions:**
| Function | Rename To |
|----------|-----------|
| `getSupabase` | `_getSupabase` |
| `cleanupMemCache` | `_cleanupMemCache` |
| `getCached` | `_getCached` |
| `setCached` | `_setCached` |
| `delCached` | `_delCached` |

---

#### 15. `cookie-parser.ts` (120 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `parseCookie` | `cookieParse` |
| `validateCookie` | `cookieValidate` |
| `isCookieLike` | `cookieIsLike` |
| `getCookieFormat` | `cookieGetFormat` |

**Internal Functions:**
| Function | Rename To |
|----------|-----------|
| `filterAndExtract` | `_filterAndExtractCookies` |
| `parseCookiePairs` | `_parseCookiePairs` |
| `extractCookieInfo` | `_extractCookieInfo` |

---

#### 16. `cookie-pool.ts` (300 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `getRotatingCookie` | `cookiePoolGetRotating` |
| `markCookieSuccess` | `cookiePoolMarkSuccess` |
| `markCookieError` | `cookiePoolMarkError` |
| `markCookieCooldown` | `cookiePoolMarkCooldown` |
| `markCookieExpired` | `cookiePoolMarkExpired` |
| `getCookiesByPlatform` | `cookiePoolGetByPlatform` |
| `getCookiePoolStats` | `cookiePoolGetStats` |
| `addCookieToPool` | `cookiePoolAdd` |
| `updatePooledCookie` | `cookiePoolUpdate` |
| `deleteCookieFromPool` | `cookiePoolDelete` |
| `testCookieHealth` | `cookiePoolTestHealth` |
| `getDecryptedCookie` | `cookiePoolGetDecrypted` |
| `migrateUnencryptedCookies` | `cookiePoolMigrateUnencrypted` |

**Internal Functions:**
| Function | Rename To |
|----------|-----------|
| `getSupabase` | `_getSupabase` |
| `encryptCookie` | `_encryptCookie` |
| `decryptCookie` | `_decryptCookie` |
| `isEncrypted` | `_isEncrypted` |
| `getCookiePreview` | `_getCookiePreview` |
| `extractUserId` | `_extractUserId` |

---

#### 17. `error-ui.ts` (100 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `getErrorDisplay` | `errorUiGetDisplay` |
| `getErrorDisplayFromString` | `errorUiGetDisplayFromString` |
| `needsCookie` | `errorUiNeedsCookie` |
| `shouldRetryWithCookie` | `errorUiShouldRetryWithCookie` |

---

#### 18. `format-utils.ts` (30 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `formatBytes` | `formatBytes` | ✅ Keep |
| `formatSpeed` | `formatSpeed` | ✅ Keep |
| `parseFileSizeToBytes` | `parseFileSizeToBytes` | ✅ Keep |

---

#### 19. `http.ts` (utils) (200 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `validateMediaUrl` | `httpUtilValidateMediaUrl` |
| `filterValidUrls` | `httpUtilFilterValidUrls` |
| `decodeUrl` | `httpUtilDecodeUrl` |
| `decodeHtml` | `httpUtilDecodeHtml` |
| `isValidMediaUrl` | `httpUtilIsValidMediaUrl` |
| `isSmallImage` | `httpUtilIsSmallImage` |
| `normalizeUrl` | `httpUtilNormalizeUrl` |
| `cleanTrackingParams` | `httpUtilCleanTrackingParams` |
| `successResponse` | `httpUtilSuccessResponse` |
| `errorResponse` | `httpUtilErrorResponse` |
| `missingUrlResponse` | `httpUtilMissingUrlResponse` |
| `invalidUrlResponse` | `httpUtilInvalidUrlResponse` |
| `dedupeFormats` | `httpUtilDedupeFormats` |
| `dedupeByQuality` | `httpUtilDedupeByQuality` |
| `getQualityLabel` | `httpUtilGetQualityLabel` |
| `getQualityFromBitrate` | `httpUtilGetQualityFromBitrate` |
| `extractByPatterns` | `httpUtilExtractByPatterns` |
| `extractVideos` | `httpUtilExtractVideos` |
| `extractMeta` | `httpUtilExtractMeta` |
| `createFormat` | `httpUtilCreateFormat` |
| `addFormat` | `httpUtilAddFormat` |

---

#### 20. `retry.ts` (80 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `withRetry` | `retryWith` |
| `retryAsync` | `retryAsync` | ✅ Keep |

**Internal Functions:**
| Function | Rename To |
|----------|-----------|
| `calculateDelay` | `_calculateRetryDelay` |

---

#### 21. `security.ts` (200 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
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

---

### `/src/lib/http/` - HTTP Module

#### 22. `client.ts` (350 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `httpGet` | `httpGet` | ✅ Keep |
| `httpPost` | `httpPost` | ✅ Keep |
| `httpHead` | `httpHead` | ✅ Keep |
| `resolveUrl` | `httpResolveUrl` |
| `getUserAgent` | `httpGetUserAgent` |
| `getUserAgentAsync` | `httpGetUserAgentAsync` |
| `getApiHeaders` | `httpGetApiHeaders` |
| `getApiHeadersAsync` | `httpGetApiHeadersAsync` |
| `getBrowserHeaders` | `httpGetBrowserHeaders` |
| `getBrowserHeadersAsync` | `httpGetBrowserHeadersAsync` |
| `getSecureHeaders` | `httpGetSecureHeaders` |
| `getSecureHeadersAsync` | `httpGetSecureHeadersAsync` |

**Internal Functions:**
| Function | Rename To |
|----------|-----------|
| `getUaCacheTTL` | `_getUaCacheTTL` |
| `loadUserAgentPool` | `_loadUserAgentPool` |
| `markUserAgentUsed` | `_markUserAgentUsed` |

---

#### 23. `anti-ban.ts` (300 lines)
**Exported Functions:**
| Current | New Name |
|---------|----------|
| `getRotatingHeaders` | `httpGetRotatingHeaders` |
| `getRotatingHeadersAsync` | `httpGetRotatingHeadersAsync` |
| `getRandomProfile` | `httpGetRandomProfile` |
| `getRandomProfileAsync` | `httpGetRandomProfileAsync` |
| `getRandomDelay` | `httpGetRandomDelay` |
| `randomSleep` | `httpRandomSleep` |
| `shouldThrottle` | `httpShouldThrottle` |
| `trackRequest` | `httpTrackRequest` |
| `markRateLimited` | `httpMarkRateLimited` |
| `markProfileUsed` | `httpMarkProfileUsed` |
| `markProfileSuccess` | `httpMarkProfileSuccess` |
| `markProfileError` | `httpMarkProfileError` |
| `clearProfileCache` | `httpClearProfileCache` |
| `preloadProfiles` | `httpPreloadProfiles` |

**Internal Functions:**
| Function | Rename To |
|----------|-----------|
| `loadProfilesFromDB` | `_loadProfilesFromDB` |
| `getProfiles` | `_getProfiles` |
| `filterByPlatform` | `_filterByPlatform` |
| `selectWeightedRandom` | `_selectWeightedRandom` |

---

## 📊 SUMMARY STATISTICS

| Category | Files | Functions | To Rename |
|----------|-------|-----------|-----------|
| Scrapers | 6 | 12 exported | 4 |
| Scraper Internals | - | 50+ private | All (prefix `_`) |
| HTTP | 3 | 25 exported | 20 |
| Cookies | 3 | 25 exported | 25 |
| Config | 3 | 45 exported | 45 |
| Utils | 6 | 35 exported | 30 |
| Auth | 2 | 12 exported | 12 |
| **TOTAL** | **23** | **~200** | **~140** |

---

## 🔧 IMPLEMENTATION NOTES

### Alias Pattern for Backward Compatibility
```typescript
// New name
export function cookieParse(input: unknown, platform?: CookiePlatform): string | null {
    // implementation
}

// Old name (deprecated alias)
/** @deprecated Use cookieParse instead */
export const parseCookie = cookieParse;
```

### Private Function Convention
```typescript
// Prefix with underscore for internal functions
function _extractFbVideoId(url: string): string | null {
    // implementation
}
```

### Export Organization
```typescript
// Group exports by category
// === PARSING ===
export { cookieParse, cookieValidate, cookieIsLike, cookieGetFormat };

// === POOL MANAGEMENT ===
export { cookiePoolGetRotating, cookiePoolMarkSuccess, ... };

// === ADMIN COOKIES ===
export { adminCookieGet, adminCookieSet, ... };

// === DEPRECATED (remove in v2.0) ===
/** @deprecated */ export const parseCookie = cookieParse;
/** @deprecated */ export const validateCookie = cookieValidate;
```
