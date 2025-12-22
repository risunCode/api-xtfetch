# API Documentation Page - Proposal

**Date:** December 22, 2025  
**Status:** PROPOSAL  
**Priority:** High

---

## 🎯 Objective

Buat halaman dokumentasi API di backend (`/`) dengan:
1. Landing page yang informatif
2. Interactive API tester (console)
3. Security hardening untuk path scanning

---

## 🎨 Design Concept

### Homepage Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  🚀 XTFetch API                                    [GitHub]     │
│  Social Media Video Downloader API                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ 📥 Download │  │ 🎬 Platforms│  │ ⚡ Fast     │             │
│  │ Videos      │  │ 6 Supported │  │ Response    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ═══════════════════════════════════════════════════════════   │
│                                                                 │
│  📡 API Console                                    [Traffic 🟢] │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ GET  /api/v1/playground?url=                            │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ https://youtube.com/watch?v=...                     │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  │                                          [▶ Send Request] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Response:                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ {                                                       │   │
│  │   "success": true,                                      │   │
│  │   "data": { ... }                                       │   │
│  │ }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ═══════════════════════════════════════════════════════════   │
│                                                                 │
│  📚 Public Endpoints                                            │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ GET /api/v1/     │  │ GET /api/v1/     │                    │
│  │ playground       │  │ status           │                    │
│  │ Free testing     │  │ Service status   │                    │
│  └──────────────────┘  └──────────────────┘                    │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ GET /api/v1/     │  │ GET /api/health  │                    │
│  │ cookies          │  │ Health check     │                    │
│  │ Cookie status    │  │                  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  ═══════════════════════════════════════════════════════════   │
│                                                                 │
│  🎬 Supported Platforms                                         │
│  [YouTube] [Facebook] [Instagram] [Twitter] [TikTok] [Weibo]   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  © 2025 XTFetch API • v1.0.0                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Technical Implementation

### File Structure

```
api-xtfetch/src/app/
├── page.tsx                    # Homepage with API docs
├── layout.tsx                  # Root layout (add Tailwind)
├── globals.css                 # Global styles
└── api/
    └── v1/
        └── ... (existing routes)
```

### Dependencies (Already Available)
- Tailwind CSS (via Next.js)
- FontAwesome (free icons via CDN)
- No additional packages needed

### Features

1. **Hero Section**
   - Logo & title
   - Brief description
   - Feature cards (3 columns)

2. **API Console**
   - Traffic light indicator (🟢 Online / 🟡 Slow / 🔴 Offline)
   - URL input field
   - Send button
   - JSON response viewer with syntax highlighting

3. **Endpoint Cards**
   - Only FREE/PUBLIC endpoints
   - Method badge (GET/POST)
   - Description
   - Example usage

4. **Platform Icons**
   - FontAwesome brand icons
   - Status indicator per platform

---

## 🔒 Security Hardening

### Current Vulnerabilities

1. **Path Scanning** - Attackers can probe `/api/admin/*` endpoints
2. **Error Leakage** - Stack traces might expose internal info
3. **Rate Limit Bypass** - Need to ensure rate limiting on all routes

### Security Measures

#### 1. Middleware Protection

```typescript
// middleware.ts additions

// Block suspicious paths
const BLOCKED_PATHS = [
  '/.env',
  '/.git',
  '/wp-admin',
  '/phpinfo',
  '/config',
  '/.well-known/security.txt', // Optional: create this
];

// Block path scanning patterns
const SUSPICIOUS_PATTERNS = [
  /\.\./,           // Directory traversal
  /\/\./,           // Hidden files
  /%2e%2e/i,        // Encoded traversal
  /\x00/,           // Null bytes
  /<script/i,       // XSS attempts
  /union.*select/i, // SQL injection
];
```

#### 2. Admin Route Protection

```typescript
// All /api/admin/* routes MUST:
// 1. Verify Bearer token
// 2. Check user role = 'admin'
// 3. Return generic 401 for ANY failure (don't leak info)

// WRONG:
return { error: 'Invalid token format' }; // Leaks info

// CORRECT:
return { error: 'Unauthorized' }; // Generic
```

#### 3. Error Response Sanitization

```typescript
// Never expose:
// - Stack traces
// - File paths
// - Database errors
// - Internal IPs

// Production error handler
if (process.env.NODE_ENV === 'production') {
  return { success: false, error: 'Internal error' };
}
```

#### 4. Rate Limiting Enhancement

```typescript
// Different limits per route type
const RATE_LIMITS = {
  '/api/v1/playground': { requests: 5, window: '2m' },
  '/api/v1/*': { requests: 60, window: '1m' },
  '/api/admin/*': { requests: 30, window: '1m' },
  '/': { requests: 100, window: '1m' }, // Homepage
};
```

#### 5. Security Headers

```typescript
// Already in middleware, verify these exist:
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; ...",
};
```

---

## 📋 Endpoints to Display (FREE ONLY)

### Public Endpoints

| Endpoint | Method | Description | Rate Limit |
|----------|--------|-------------|------------|
| `/api/v1/playground` | GET/POST | Free API testing | 5/2min |
| `/api/v1/status` | GET | Service status | 60/min |
| `/api/v1/cookies` | GET | Cookie availability | 60/min |
| `/api/v1/announcements` | GET | Public announcements | 60/min |
| `/api/health` | GET | Health check | 100/min |

### Hidden from Docs (Admin Only)

| Endpoint | Reason |
|----------|--------|
| `/api/admin/*` | Requires authentication |
| `/api/v1/proxy` | Internal use only |
| `/api/v1/push/*` | Internal use only |
| `/api/v1/chat` | Internal use only |

---

## 🎨 UI Components

### Traffic Light Component

```tsx
function TrafficLight({ status }: { status: 'online' | 'slow' | 'offline' }) {
  const colors = {
    online: 'bg-green-500',
    slow: 'bg-yellow-500',
    offline: 'bg-red-500',
  };
  
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${colors[status]} animate-pulse`} />
      <span className="text-sm capitalize">{status}</span>
    </div>
  );
}
```

### Endpoint Card Component

```tsx
function EndpointCard({ method, path, description }: Props) {
  const methodColors = {
    GET: 'bg-green-500',
    POST: 'bg-blue-500',
  };
  
  return (
    <div className="p-4 rounded-lg bg-gray-800 border border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${methodColors[method]}`}>
          {method}
        </span>
        <code className="text-sm text-gray-300">{path}</code>
      </div>
      <p className="text-sm text-gray-400">{description}</p>
    </div>
  );
}
```

### API Console Component

```tsx
function ApiConsole() {
  const [url, setUrl] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'online' | 'slow' | 'offline'>('online');
  
  const sendRequest = async () => {
    setLoading(true);
    const start = Date.now();
    try {
      const res = await fetch(`/api/v1/playground?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      const time = Date.now() - start;
      setResponse(data);
      setStatus(time < 2000 ? 'online' : time < 5000 ? 'slow' : 'offline');
    } catch {
      setStatus('offline');
    }
    setLoading(false);
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">📡 API Console</h2>
        <TrafficLight status={status} />
      </div>
      {/* Input & Response */}
    </div>
  );
}
```

---

## 📝 Action Items

### Phase 1: Security Hardening ✅ DONE
1. [x] Add path blocking in middleware
2. [x] Block suspicious patterns (traversal, XSS, SQLi)
3. [x] Generic error responses
4. [x] Security headers verified

### Phase 2: Homepage ✅ DONE
1. [x] Create `app/page.tsx` with landing page
2. [x] Add API console component with traffic light
3. [x] Add endpoint cards (free only)
4. [x] Add platform icons (FontAwesome)
5. [x] Setup Tailwind CSS v4

### Phase 3: Testing
1. [ ] Test path scanning protection
2. [ ] Test rate limiting
3. [ ] Test API console functionality
4. [ ] Mobile responsiveness

---

## 🚀 Estimated Timeline

| Phase | Duration |
|-------|----------|
| Security Hardening | 30 min |
| Homepage UI | 45 min |
| Testing | 15 min |
| **Total** | **~1.5 hours** |

---

*Proposal by Kiro AI Assistant*
