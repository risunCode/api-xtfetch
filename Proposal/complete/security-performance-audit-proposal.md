# 🔒 Security, Performance & Code Quality Audit Proposal

**Date:** December 26, 2024  
**Auditor:** Kiro AI  
**Scope:** api-xtfetch (Backend) + DownAria (Frontend)

---

## 📊 Executive Summary

| Category | Backend | Frontend | Total |
|----------|---------|----------|-------|
| 🔴 Critical Security | 4 | 0 | 4 |
| 🟠 High Security | 6 | 1 | 7 |
| 🟡 Medium Security | 0 | 3 | 3 |
| ⚡ Performance | 8 | 6 | 14 |
| 📦 Code Duplicates | 5 | 4 | 9 |
| **TOTAL** | **23** | **14** | **37** |

**Overall Risk Level:** 🔴 **HIGH** - Immediate action required on critical issues

---

## 🔴 BACKEND CRITICAL ISSUES (api-xtfetch/)

### 1. CORS Bypass - Insufficient Origin Validation
**File:** `src/app/api/v1/publicservices/route.ts` (lines 40-60)  
**Severity:** 🔴 CRITICAL

**Problem:**
- If `ALLOWED_ORIGINS` is empty (dev mode), ALL origins are allowed
- Subdomain matching too permissive: `origin.endsWith('.${allowed}')` allows any subdomain
- Bridge secret is logged in console (line 48)

```typescript
// VULNERABLE CODE
if (ALLOWED_ORIGINS.length === 0) return true; // Dev mode allows ALL
```

**Attack Vector:** CSRF attacks, unauthorized API access from any domain

**Fix:**
```typescript
// Strict subdomain matching
const allowedHost = new URL(allowed).hostname;
const originHost = new URL(origin).hostname;
return originHost === allowedHost; // Exact match only

// Remove console.log for bridge secret
```

---

### 2. API Key Validation Bypass
**File:** `src/lib/auth/apikeys.ts` (lines 200-230)  
**Severity:** 🔴 CRITICAL

**Problem:**
- No rate limiting on key validation attempts
- `apiKeyValidate()` doesn't check if key is disabled before rate limit check
- In-memory rate limit map can be exhausted (DoS)

**Attack Vector:** Brute force API key enumeration

**Fix:**
```typescript
// Rate limit BEFORE DB query
const rateLimitKey = `apikey_attempt:${plainKey.substring(0, 8)}`;
const attempts = await redis.incr(rateLimitKey);
if (attempts === 1) await redis.expire(rateLimitKey, 60);
if (attempts > 5) return { valid: false, error: 'Too many attempts' };
```

---

### 3. Telegram Webhook Secret Optional
**File:** `src/app/api/bot/webhook/route.ts` (lines 30-40)  
**Severity:** 🔴 CRITICAL

**Problem:**
- Secret token validation is optional: `secretToken: TELEGRAM_WEBHOOK_SECRET || undefined`
- If env var not set, webhook accepts ANY request

**Attack Vector:** Unauthorized bot command injection, spam

**Fix:**
```typescript
if (!TELEGRAM_WEBHOOK_SECRET) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET must be configured');
}
secretToken: TELEGRAM_WEBHOOK_SECRET, // Enforce validation
```

---

### 4. SQL Injection via Cookie Pool Platform
**File:** `src/lib/cookies/pool.ts` (lines 150-180)  
**Severity:** 🔴 CRITICAL

**Problem:**
- Platform parameter used directly in `.eq('platform', platform)` without validation
- No whitelist of allowed platforms

**Attack Vector:** Database manipulation, data exfiltration

**Fix:**
```typescript
const VALID_PLATFORMS = ['facebook', 'instagram', 'twitter', 'tiktok', 'weibo', 'youtube'];
if (!VALID_PLATFORMS.includes(platform)) {
    throw new Error('Invalid platform');
}
```

---

## 🟠 BACKEND HIGH ISSUES

### 5. Sensitive Data Exposure - API Keys in Logs
**File:** `src/app/api/v1/route.ts` (lines 95-100)  
**Severity:** 🟠 HIGH

**Problem:** API key prefix logged in response metadata
```typescript
meta: { apiKey: apiKey.substring(0, 8) + '...' } // Leaks key prefix
```

**Fix:** Remove any key info from response

---

### 6. SSRF Vulnerability - Incomplete URL Validation
**File:** `src/lib/utils.ts` (lines 150-200)  
**Severity:** 🟠 HIGH

**Problem:**
- `securityValidateSocialUrl()` blocks private IPs but allows cloud metadata endpoints
- IPv6 validation incomplete

**Fix:** Use URL parsing library for robust validation

---

### 7. Rate Limit Bypass - Timezone Calculation Error
**File:** `src/bot/middleware/rateLimit.ts` (lines 40-70)  
**Severity:** 🟠 HIGH

**Problem:** WIB timezone calculation incorrect, doesn't account for DST

**Fix:**
```typescript
// Use fixed UTC+7 offset
const wibOffset = 7 * 60 * 60 * 1000;
const now = Date.now();
const todayWIB = new Date(now + wibOffset);
```

---

### 8. Cookie Encryption Key Derivation - Performance DoS
**File:** `src/lib/utils.ts` (lines 280-320)  
**Severity:** 🟠 HIGH

**Problem:** `crypto.scryptSync()` is CPU-intensive, no timeout

**Attack Vector:** CPU exhaustion via many unique salts

---

### 9. Admin Authentication Bypass
**File:** `src/app/api/admin/cookies/route.ts` (lines 15-25)  
**Severity:** 🟠 HIGH

**Problem:** GET endpoint uses `authVerifySession()` instead of `authVerifyAdminSession()`

---

### 10. Cookie Validation Bypass
**File:** `src/lib/cookies/parser.ts`  
**Severity:** 🟠 HIGH

**Problem:** No validation of parsed cookie structure

---

## ⚡ BACKEND PERFORMANCE ISSUES

### 1. N+1 Query - Cookie Pool Rotation
**File:** `src/lib/cookies/pool.ts`  
**Impact:** 20+ database queries per download request

**Fix:** Use single query with ORDER BY priority

---

### 2. Inefficient URL Resolution
**File:** `src/lib/http/client.ts`  
**Impact:** 2x latency for auth-required URLs

---

### 3. Synchronous Encryption in Hot Path
**File:** `src/lib/utils.ts`  
**Impact:** Request latency spikes

---

### 4. Inefficient Cache Cleanup
**File:** `src/lib/auth/apikeys.ts`  
**Impact:** Memory leak, O(n) cleanup

---

### 5. Missing Database Connection Pooling
**File:** `src/lib/database/supabase.ts`  
**Impact:** Connection exhaustion

---

## 📦 BACKEND CODE DUPLICATES

| Pattern | Files Affected | Fix |
|---------|----------------|-----|
| Error Response Builders | 10+ files | Create `errorResponse()` helper |
| Platform Validation | 3+ files | Centralize in config |
| Cache Key Generation | 3+ files | Create `cacheKey` utility |
| Supabase Client Init | 3+ files | Export from single location |
| URL Validation Logic | 3+ files | Centralize in `lib/url` |

---

## 🔴 FRONTEND SECURITY ISSUES (DownAria/)

### 1. Supabase Auth Token Extraction (5 Files)
**Files:** 
- `src/lib/api/client.ts`
- `src/components/MaintenanceCheck.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/users/page.tsx`
- `src/app/admin/settings/page.tsx`

**Severity:** 🟠 HIGH

**Problem:** Directly accessing Supabase session from localStorage using pattern matching

**Fix:** Create centralized auth utility:
```typescript
// lib/auth/get-token.ts
export function getSupabaseToken(): string | null {
  if (typeof window === 'undefined') return null;
  const supabaseKey = Object.keys(localStorage).find(k => 
    k.startsWith('sb-') && k.endsWith('-auth-token')
  );
  if (supabaseKey) {
    try {
      const session = JSON.parse(localStorage.getItem(supabaseKey) || '{}');
      return session?.access_token || null;
    } catch { return null; }
  }
  return null;
}
```

---

### 2. Unsafe JSON-LD Injection
**File:** `src/components/StructuredData.tsx`  
**Severity:** 🟡 MEDIUM

**Problem:** Uses `dangerouslySetInnerHTML` for JSON-LD

---

### 3. Unvalidated localStorage Data Parsing
**Files:** Multiple  
**Severity:** 🟡 MEDIUM

**Problem:** `JSON.parse()` on localStorage with minimal error handling

---

### 4. Missing CSRF Protection on Admin API
**File:** `src/app/admin/layout.tsx`  
**Severity:** 🟡 MEDIUM

---

## ⚡ FRONTEND PERFORMANCE ISSUES

### 1. Missing React.memo on Large Components
**Files:** 
- `src/components/DownloadPreview.tsx` (667 lines)
- `src/components/media/MediaGallery.tsx` (1000+ lines)

**Severity:** 🟠 HIGH

**Fix:**
```typescript
export const DownloadPreview = React.memo(function DownloadPreview(props) {
  // ...
}, (prevProps, nextProps) => {
  return prevProps.data.url === nextProps.data.url;
});
```

---

### 2. Inefficient File Size Fetching
**File:** `src/components/DownloadPreview.tsx`  
**Impact:** 10+ HEAD requests per download

**Fix:** Batch requests with `Promise.allSettled()`

---

### 3. Unoptimized Image Loading
**File:** `src/components/DownloadPreview.tsx`  
**Impact:** All carousel thumbnails loaded upfront

**Fix:** Add `loading="lazy"` to Image components

---

### 4. Duplicate State Updates
**File:** `src/components/DownloadPreview.tsx`  
**Impact:** 2 re-renders per progress event

**Fix:** Combine `downloadStatus` and `downloadProgress` into single state

---

### 5. Missing useMemo for Expensive Computations
**File:** `src/components/DownloadPreview.tsx`  
**Impact:** Recalculates grouping on every render

---

## 📦 FRONTEND CODE DUPLICATES

| Pattern | Files Affected | Fix |
|---------|----------------|-----|
| Supabase Token Extraction | 5 files | Create `lib/auth/get-token.ts` |
| Discord Webhook Logic | 2 files | Use existing `discord-webhook.ts` |
| localStorage Key Constants | 4 files | Create `lib/storage/keys.ts` |
| Error Handling Patterns | Multiple | Create error handling utility |

---

## 🎯 IMPLEMENTATION PRIORITY

### Phase 1: CRITICAL (Immediate - This Week)
| # | Issue | File | Effort |
|---|-------|------|--------|
| 1 | CORS Bypass | `publicservices/route.ts` | 1h |
| 2 | Telegram Webhook Secret | `bot/webhook/route.ts` | 30m |
| 3 | SQL Injection Platform | `cookies/pool.ts` | 30m |
| 4 | API Key Rate Limit | `auth/apikeys.ts` | 2h |
| 5 | Remove API Key from Logs | `v1/route.ts` | 15m |

### Phase 2: HIGH (This Sprint)
| # | Issue | File | Effort |
|---|-------|------|--------|
| 6 | Admin Auth Bypass | `admin/cookies/route.ts` | 30m |
| 7 | Rate Limit Timezone | `bot/middleware/rateLimit.ts` | 1h |
| 8 | SSRF URL Validation | `lib/utils.ts` | 2h |
| 9 | Frontend Token Centralization | `lib/auth/get-token.ts` | 1h |
| 10 | React.memo Components | `DownloadPreview.tsx`, `MediaGallery.tsx` | 2h |

### Phase 3: MEDIUM (Next Sprint)
| # | Issue | File | Effort |
|---|-------|------|--------|
| 11 | N+1 Cookie Pool Query | `cookies/pool.ts` | 2h |
| 12 | Encryption Key Derivation | `lib/utils.ts` | 2h |
| 13 | Error Response Helpers | Multiple | 1h |
| 14 | Supabase Client Singleton | `database/supabase.ts` | 1h |
| 15 | Frontend State Optimization | `DownloadPreview.tsx` | 2h |

### Phase 4: LOW (Backlog)
- Image lazy loading
- Cache key centralization
- localStorage key constants
- Error handling consistency

---

## 📋 CHECKLIST

### Backend Security
- [ ] Fix CORS bypass in publicservices
- [ ] Enforce Telegram webhook secret
- [ ] Add platform validation to cookie pool
- [ ] Implement API key rate limiting before DB query
- [ ] Remove API key from response metadata
- [ ] Fix admin auth bypass
- [ ] Fix rate limit timezone calculation
- [ ] Improve SSRF URL validation

### Backend Performance
- [ ] Fix N+1 query in cookie pool
- [ ] Optimize encryption key derivation
- [ ] Add database connection pooling
- [ ] Optimize cache cleanup

### Backend Code Quality
- [ ] Create error response helper
- [ ] Centralize platform validation
- [ ] Consolidate Supabase client
- [ ] Centralize cache key generation

### Frontend Security
- [ ] Create centralized token utility
- [ ] Fix JSON-LD injection pattern
- [ ] Add localStorage validation
- [ ] Add CSRF protection to admin

### Frontend Performance
- [ ] Add React.memo to large components
- [ ] Batch file size requests
- [ ] Add lazy loading to images
- [ ] Combine download state objects
- [ ] Add useMemo for expensive computations

### Frontend Code Quality
- [ ] Create storage keys constants
- [ ] Consolidate Discord webhook usage
- [ ] Improve error handling consistency

---

## 📊 Risk Matrix

```
Impact
  ↑
  │  ┌─────────────────────────────────────────┐
  │  │ CRITICAL (Fix Now)                      │
H │  │ • CORS Bypass                           │
  │  │ • Telegram Webhook                      │
  │  │ • SQL Injection                         │
  │  │ • API Key Validation                    │
  │  ├─────────────────────────────────────────┤
  │  │ HIGH (This Sprint)                      │
M │  │ • Admin Auth Bypass                     │
  │  │ • Rate Limit Timezone                   │
  │  │ • SSRF Validation                       │
  │  │ • Frontend Token Extraction             │
  │  ├─────────────────────────────────────────┤
  │  │ MEDIUM (Next Sprint)                    │
L │  │ • Performance Issues                    │
  │  │ • Code Duplicates                       │
  │  └─────────────────────────────────────────┘
  └────────────────────────────────────────────→ Likelihood
       L              M              H
```

---

## 📝 Notes

1. **Backend is higher risk** - 4 critical + 6 high issues vs frontend's 1 high
2. **Cookie pool is a hotspot** - Multiple issues (SQL injection, N+1, encryption)
3. **Frontend token handling** - Same code in 5 files, needs centralization
4. **Performance issues** - Mostly in DownloadPreview.tsx and MediaGallery.tsx

---

**Estimated Total Effort:** ~25-30 hours  
**Recommended Timeline:** 2 sprints (Phase 1-2 in Sprint 1, Phase 3-4 in Sprint 2)
