# XTFetch Security Audit Proposal (Deep)

**Date:** December 21, 2025  
**Priority:** High  
**Estimated Time:** 4-6 hours  

---

## Executive Summary

Comprehensive security audit untuk XTFetch covering:
- Authentication & Authorization
- Input Validation & Sanitization
- Rate Limiting & DDoS Protection
- Data Encryption & Storage
- API Security
- Client-Side Security
- Infrastructure Security

---

## 1. Authentication & Authorization

### Current Implementation ✅
- Supabase JWT authentication
- Admin session verification via `verifyAdminSession()`
- Login brute-force protection (5 attempts, 5 min block)
- API key authentication with SHA-256 hashing

### Issues Found 🔴

#### 1.1 Session Token in LocalStorage
**File:** `src/lib/utils/admin-fetch.ts`
```typescript
const ADMIN_KEY = 'xtf_admin_key';
localStorage.setItem(ADMIN_KEY, token);
```
**Risk:** XSS can steal admin tokens from localStorage  
**Severity:** HIGH  
**Fix:** Use httpOnly cookies instead

#### 1.2 No Token Expiration Check Client-Side
**Risk:** Expired tokens may be used until server rejects  
**Severity:** MEDIUM  
**Fix:** Add JWT decode and expiry check before requests

#### 1.3 Missing CSRF Protection
**Risk:** Cross-site request forgery on state-changing endpoints  
**Severity:** MEDIUM  
**Fix:** Implement CSRF tokens for POST/PUT/DELETE

### Recommendations
```typescript
// 1. Move to httpOnly cookies
// In API route:
response.cookies.set('admin_session', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 60 * 60 * 24, // 24 hours
});

// 2. Add CSRF token
// Generate on login, validate on mutations
const csrfToken = crypto.randomBytes(32).toString('hex');
```

---

## 2. Input Validation & Sanitization

### Current Implementation ✅
- URL validation with domain whitelist (`isValidSocialUrl`)
- Cookie validation (`isValidCookie`)
- XSS pattern detection (`detectAttackPatterns`)
- HTML escaping (`escapeHtml`)
- Request body size limit

### Issues Found 🔴

#### 2.1 Incomplete URL Validation
**File:** `src/lib/utils/security.ts`
```typescript
const BLOCKED_PATTERNS = [
  /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.)/,
  /localhost/i,
  // Missing: IPv6, DNS rebinding, URL encoding bypass
];
```
**Risk:** SSRF via IPv6 (::1), DNS rebinding, or encoded URLs  
**Severity:** HIGH  
**Fix:** Add comprehensive SSRF protection

#### 2.2 JSON Parsing Without Validation
**Multiple API routes:**
```typescript
const { url, cookie } = await request.json();
// No schema validation
```
**Risk:** Unexpected data types, prototype pollution  
**Severity:** MEDIUM  
**Fix:** Use Zod or similar for schema validation

#### 2.3 Cookie Injection Risk
**File:** `src/lib/cookies/parser.ts`
```typescript
// Cookie string directly used in headers
headers: { 'Cookie': cookie }
```
**Risk:** Header injection via CRLF in cookie value  
**Severity:** HIGH  
**Fix:** Sanitize cookie values, remove newlines

### Recommendations
```typescript
// 1. Enhanced SSRF protection
const BLOCKED_PATTERNS = [
  /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.)/,
  /localhost/i,
  /\[::1\]/,           // IPv6 localhost
  /\[::\]/,            // IPv6 any
  /%[0-9a-f]{2}/i,     // URL encoded
  /0x[0-9a-f]+/i,      // Hex IP
  /\d+\.\d+\.\d+\.\d+\.xip\.io/i, // DNS rebinding
];

// 2. Schema validation with Zod
import { z } from 'zod';
const DownloadSchema = z.object({
  url: z.string().url().max(2000),
  cookie: z.string().max(10000).optional(),
  skipCache: z.boolean().optional(),
});

// 3. Cookie sanitization
function sanitizeCookie(cookie: string): string {
  return cookie.replace(/[\r\n]/g, '').trim();
}
```

---

## 3. Rate Limiting & DDoS Protection

### Current Implementation ✅
- Global rate limit: 60 req/min per IP
- Auth endpoints: 10 req/min
- Playground: 5 req/2min (3 for demo key)
- Legacy APIs: 5 req/5min
- Redis-backed with memory fallback
- Suspicious pattern blocking

### Issues Found 🔴

#### 3.1 Rate Limit Bypass via X-Forwarded-For
**File:** `src/middleware.ts`
```typescript
function getClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}
```
**Risk:** Attacker can spoof IP via X-Forwarded-For header  
**Severity:** HIGH  
**Fix:** Trust only from known proxies (Vercel)

#### 3.2 Memory Store Unbounded Growth
**File:** `src/middleware.ts`
```typescript
const rateLimitStore = new Map<string, RateLimitEntry>();
// MAX_STORE_SIZE = 5000 but cleanup only on interval
```
**Risk:** Memory exhaustion if cleanup fails  
**Severity:** MEDIUM  
**Fix:** Add size check before insert

#### 3.3 No Slowloris Protection
**Risk:** Slow HTTP attacks can exhaust connections  
**Severity:** LOW (Vercel handles this)  
**Fix:** Rely on Vercel's edge protection

### Recommendations
```typescript
// 1. Validate X-Forwarded-For source
function getClientIP(request: NextRequest): string {
  // In Vercel, x-forwarded-for is trustworthy
  // For self-hosted, validate against known proxy IPs
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    // Take the rightmost non-private IP (closest to client)
    return ips[0]; // Vercel puts real IP first
  }
  return 'unknown';
}

// 2. Bounded rate limit store
if (rateLimitStore.size >= MAX_STORE_SIZE) {
  // Evict oldest entries
  const entries = [...rateLimitStore.entries()];
  entries.sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (let i = 0; i < 1000; i++) {
    rateLimitStore.delete(entries[i][0]);
  }
}
```

---

## 4. Data Encryption & Storage

### Current Implementation ✅
- AES-256-GCM for cookie encryption
- Random salt per encryption
- API keys hashed with SHA-256
- Sensitive data masking in logs

### Issues Found 🔴

#### 4.1 Encryption Key in Environment
**File:** `src/lib/utils/security.ts`
```typescript
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key && process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY required');
  }
  return key || 'default-key-for-development-only';
}
```
**Risk:** Default key used if env not set properly  
**Severity:** CRITICAL (if deployed without key)  
**Fix:** Fail hard, no default

#### 4.2 No Key Rotation Mechanism
**Risk:** Compromised key affects all data  
**Severity:** MEDIUM  
**Fix:** Implement key versioning

#### 4.3 Decrypted Cookies in Memory
**Risk:** Memory dump can expose cookies  
**Severity:** LOW  
**Fix:** Clear sensitive vars after use

### Recommendations
```typescript
// 1. Strict key requirement
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  return key;
}

// 2. Key versioning
// Format: v1:salt:iv:authTag:encrypted
const KEY_VERSION = 'v1';
export function encrypt(text: string): string {
  // ... encryption logic
  return `${KEY_VERSION}:${salt}:${iv}:${authTag}:${encrypted}`;
}
```

---

## 5. API Security

### Current Implementation ✅
- Origin whitelist for main API
- API key validation
- Security headers (CSP, HSTS, X-Frame-Options)
- CORS configuration

### Issues Found 🔴

#### 5.1 Verbose Error Messages
**Multiple API routes:**
```typescript
return NextResponse.json({ 
  success: false, 
  error: error.message // Exposes internal details
});
```
**Risk:** Information disclosure  
**Severity:** MEDIUM  
**Fix:** Generic error messages, log details server-side

#### 5.2 Missing Request ID for Tracing
**Risk:** Hard to correlate logs for incident response  
**Severity:** LOW  
**Fix:** Add request ID header

#### 5.3 No Request Timeout
**Risk:** Slow responses can tie up resources  
**Severity:** MEDIUM  
**Fix:** Add timeout to external requests

### Recommendations
```typescript
// 1. Safe error responses
function safeError(error: unknown, requestId: string): NextResponse {
  const message = error instanceof Error ? error.message : 'Unknown error';
  
  // Log full error server-side
  console.error(`[${requestId}] Error:`, error);
  
  // Return generic message to client
  return NextResponse.json({
    success: false,
    error: 'An error occurred. Please try again.',
    requestId, // For support reference
  }, { status: 500 });
}

// 2. Request timeout
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
try {
  const response = await fetch(url, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

---

## 6. Client-Side Security

### Current Implementation ✅
- CSP headers
- XSS protection headers
- No inline event handlers

### Issues Found 🔴

#### 6.1 Sensitive Data in Console Logs
**Multiple files:**
```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[Debug]', sensitiveData);
}
```
**Risk:** Logs visible in browser DevTools  
**Severity:** LOW  
**Fix:** Remove or obfuscate sensitive logs

#### 6.2 LocalStorage for Sensitive Settings
**File:** `src/lib/storage/settings.ts`
```typescript
localStorage.setItem('xtf_discord', webhookUrl);
```
**Risk:** XSS can read webhook URLs  
**Severity:** MEDIUM  
**Fix:** Encrypt or move to server

#### 6.3 Service Worker Cache Poisoning
**Risk:** Malicious content cached by SW  
**Severity:** LOW  
**Fix:** Validate responses before caching

### Recommendations
```typescript
// 1. Safe logging
function debugLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'development') return;
  console.log('[Debug]', ...args.map(arg => 
    typeof arg === 'string' && arg.length > 50 
      ? arg.slice(0, 20) + '...' 
      : arg
  ));
}

// 2. Encrypt sensitive localStorage
import { encrypt, decrypt } from '@/lib/crypto-browser';
function saveWebhook(url: string) {
  localStorage.setItem('xtf_discord', encrypt(url));
}
```

---

## 7. Infrastructure Security

### Current Implementation ✅
- Vercel deployment (DDoS protection)
- Supabase RLS policies
- Environment variables for secrets
- HTTPS enforced

### Issues Found 🔴

#### 7.1 No Audit Logging
**Risk:** Cannot trace security incidents  
**Severity:** MEDIUM  
**Fix:** Log auth events, admin actions

#### 7.2 Missing Security Monitoring
**Risk:** Attacks go unnoticed  
**Severity:** MEDIUM  
**Fix:** Add alerting for suspicious patterns

#### 7.3 No Backup Verification
**Risk:** Backups may be corrupted  
**Severity:** LOW  
**Fix:** Periodic backup restore tests

### Recommendations
```typescript
// 1. Audit logging
async function auditLog(event: {
  action: string;
  userId?: string;
  ip: string;
  details?: Record<string, unknown>;
}) {
  await supabase.from('audit_logs').insert({
    ...event,
    timestamp: new Date().toISOString(),
  });
}

// Usage
await auditLog({
  action: 'admin_login',
  userId: user.id,
  ip: getClientIP(request),
  details: { success: true },
});
```

---

## 8. Priority Action Items

### Critical (Fix Immediately) 🔴 ✅ PATCHED
1. **SSRF Enhancement** - ✅ Added IPv6, DNS rebinding, cloud metadata protection
2. **Cookie Header Injection** - ✅ Added CRLF sanitization + sanitizeCookie function
3. **Encryption Key Validation** - ✅ Strict validation, min 32 chars in production

### High Priority (This Week) 🟠 ⏳ PARTIAL
1. **Admin Token Storage** - ⏳ TODO: Move from localStorage to httpOnly cookie
2. **Rate Limit IP Spoofing** - ✅ Added IP validation in middleware
3. **Schema Validation** - ⏳ TODO: Add Zod for API inputs
4. **Error Message Sanitization** - ✅ Sanitized in POST handler

### Medium Priority (This Month) 🟡
1. **CSRF Protection** - Add tokens for mutations
2. **Audit Logging** - Track security events
3. **Request Timeouts** - Add to all external calls
4. **Key Rotation** - Implement versioned encryption

### Low Priority (Backlog) 🟢
1. **Client-Side Encryption** - For sensitive localStorage
2. **Security Monitoring** - Alerting dashboard
3. **Penetration Testing** - External audit

---

## 9. Implementation Checklist

### Phase 1: Critical Fixes (Day 1)
- [ ] Update SSRF blocked patterns
- [ ] Add cookie sanitization
- [ ] Validate encryption key strictly

### Phase 2: High Priority (Days 2-3)
- [ ] Migrate admin auth to httpOnly cookies
- [ ] Add Zod schema validation
- [ ] Sanitize error messages
- [ ] Fix rate limit IP handling

### Phase 3: Medium Priority (Week 2)
- [ ] Implement CSRF tokens
- [ ] Add audit logging table
- [ ] Add request timeouts
- [ ] Document key rotation process

### Phase 4: Hardening (Ongoing)
- [ ] Security monitoring setup
- [ ] Regular dependency updates
- [ ] Periodic security reviews

---

## 10. Testing Plan

### Automated Tests
```bash
# SSRF tests
curl -X POST /api -d '{"url":"http://127.0.0.1:8080"}'
curl -X POST /api -d '{"url":"http://[::1]:8080"}'
curl -X POST /api -d '{"url":"http://169.254.169.254"}'

# Rate limit tests
for i in {1..100}; do curl /api/playground; done

# XSS tests
curl -X POST /api -d '{"url":"<script>alert(1)</script>"}'

# Header injection
curl -X POST /api -d '{"cookie":"test\r\nX-Injected: true"}'
```

### Manual Tests
1. Try accessing admin routes without auth
2. Test expired tokens
3. Verify CSP blocks inline scripts
4. Check error messages don't leak info

---

## Appendix: Security Headers Checklist

| Header | Current | Recommended |
|--------|---------|-------------|
| Content-Security-Policy | ✅ Set | Review script-src |
| X-Frame-Options | ✅ DENY | OK |
| X-Content-Type-Options | ✅ nosniff | OK |
| X-XSS-Protection | ✅ 1; mode=block | OK |
| Strict-Transport-Security | ✅ Production only | OK |
| Referrer-Policy | ✅ strict-origin | OK |
| Permissions-Policy | ✅ Restrictive | OK |

---

**Prepared by:** Kiro Security Audit  
**Review Date:** December 21, 2025  
**Next Audit:** January 2026
