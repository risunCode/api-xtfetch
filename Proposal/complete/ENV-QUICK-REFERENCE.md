# 🔐 Environment Variables - Quick Reference

## 📊 Visual Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (.env)                              │
│                 XTFetch-SocmedDownloader/                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NEXT_PUBLIC_BASE_URL          → http://localhost:3001         │
│  NEXT_PUBLIC_API_URL           → http://localhost:3002  ◄──┐   │
│  NEXT_PUBLIC_SUPABASE_URL      → https://xxx.supabase.co    │   │
│  NEXT_PUBLIC_SUPABASE_ANON_KEY → eyJhbGci...                │   │
│  NEXT_PUBLIC_VAPID_PUBLIC_KEY  → BPxxx...                   │   │
│                                                              │   │
│  Total: 5 variables (all public/safe)                       │   │
└──────────────────────────────────────────────────────────────┼───┘
                                                               │
                                                               │
                                                               │
┌──────────────────────────────────────────────────────────────▼───┐
│                    BACKEND (.env)                               │
│                     api-xtfetch/                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NEXT_PUBLIC_SUPABASE_URL      → https://xxx.supabase.co       │
│  NEXT_PUBLIC_SUPABASE_ANON_KEY → eyJhbGci...                   │
│  SUPABASE_SERVICE_ROLE_KEY     → eyJhbGci... 🔒 SECRET         │
│                                                                 │
│  UPSTASH_REDIS_REST_URL        → https://xxx.upstash.io 🔒     │
│  UPSTASH_REDIS_REST_TOKEN      → AXxxxx... 🔒 SECRET           │
│                                                                 │
│  ENCRYPTION_KEY                → 32-char-hex 🔒 SECRET         │
│  JWT_SECRET                    → 64-char-hex 🔒 SECRET         │
│                                                                 │
│  ALLOWED_ORIGINS               → http://localhost:3001         │
│                                                                 │
│  VAPID_PUBLIC_KEY              → BPxxx...                      │
│  VAPID_PRIVATE_KEY             → xxx... 🔒 SECRET              │
│  VAPID_SUBJECT                 → mailto:your@email.com         │
│                                                                 │
│  DISCORD_WEBHOOK_URL           → https://discord.com/... 🔒    │
│                                                                 │
│  Total: 12 variables (7 secret, 5 public)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Quick Answer: "Yang Konek ke Supabase & Redis?"

### Supabase Connection

**Frontend** (Browser):
```javascript
// Uses: NEXT_PUBLIC_SUPABASE_ANON_KEY
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  // ← Safe for browser
)

// Can do: Login, Signup, Read public data
// Cannot do: Admin operations, bypass RLS
```

**Backend** (Server):
```javascript
// Uses: SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // ← Full admin access
)

// Can do: Everything (bypass RLS, admin operations)
```

### Redis Connection

**Frontend**: ❌ TIDAK KONEK KE REDIS
- Frontend tidak butuh Redis
- Semua rate limiting di backend

**Backend**: ✅ KONEK KE REDIS
```javascript
// Uses: UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

// Used for: Rate limiting, API response caching
```

---

## 📋 Checklist Setup

### Step 1: Backend Setup (WAJIB DULUAN!)

```bash
cd api-xtfetch
cp .env.example .env
```

Edit `.env`:
```bash
# Supabase (copy from Supabase dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Redis (copy from Upstash dashboard)
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxx...

# Security (generate new)
ENCRYPTION_KEY=$(openssl rand -hex 16)

# CORS (frontend URL)
ALLOWED_ORIGINS=http://localhost:3001
```

Test backend:
```bash
npm run dev  # Should start on port 3002
```

### Step 2: Frontend Setup

```bash
cd ../XTFetch-SocmedDownloader
cp .env.example .env
```

Edit `.env`:
```bash
# URLs
NEXT_PUBLIC_BASE_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3002  # ← Backend URL

# Supabase (same as backend, but ONLY anon key)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

Test frontend:
```bash
npm run dev  # Should start on port 3001
```

### Step 3: Verify Connection

Open browser: `http://localhost:3001`

Check browser console:
```
✅ Frontend loaded
✅ Calling backend: http://localhost:3002/api/v1/...
✅ Backend responding with data
```

---

## 🔍 Troubleshooting

### Problem: "CORS Error"
```
Access to fetch at 'http://localhost:3002/api/v1/...' from origin 
'http://localhost:3001' has been blocked by CORS policy
```

**Solution**:
```bash
# Backend .env
ALLOWED_ORIGINS=http://localhost:3001  # ← Add frontend URL
```

### Problem: "Supabase: Invalid API key"
```
Error: Invalid API key
```

**Solution**:
- Frontend: Make sure using `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Backend: Make sure using `SUPABASE_SERVICE_ROLE_KEY` for admin ops

### Problem: "Redis connection failed"
```
Error: Failed to connect to Redis
```

**Solution**:
```bash
# Backend .env (check credentials)
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxx...
```

### Problem: "Backend API not responding"
```
Error: Failed to fetch
```

**Solution**:
```bash
# Frontend .env (check backend URL)
NEXT_PUBLIC_API_URL=http://localhost:3002  # ← Must match backend port
```

---

## 🚀 Production Deployment

### Vercel Deployment

**Frontend Project** (xt-fetch.vercel.app):
```
Environment Variables:
├── NEXT_PUBLIC_BASE_URL=https://xt-fetch.vercel.app
├── NEXT_PUBLIC_API_URL=https://api-xtfetch.vercel.app
├── NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
├── NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
└── NEXT_PUBLIC_VAPID_PUBLIC_KEY=BPxxx...
```

**Backend Project** (api-xtfetch.vercel.app):
```
Environment Variables:
├── NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
├── NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
├── SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
├── UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
├── UPSTASH_REDIS_REST_TOKEN=AXxxxx...
├── ENCRYPTION_KEY=your-32-char-hex-key
├── ALLOWED_ORIGINS=https://xt-fetch.vercel.app
├── VAPID_PUBLIC_KEY=BPxxx...
├── VAPID_PRIVATE_KEY=xxx...
└── DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

---

## 💡 Key Takeaways

1. **Frontend = Minimal & Public**
   - Only 5 variables
   - All safe for browser
   - No secrets

2. **Backend = Full & Private**
   - 12 variables
   - Contains all secrets
   - Handles Supabase admin ops
   - Handles Redis rate limiting

3. **Supabase Connection**
   - Frontend: Anon key (limited access)
   - Backend: Service Role key (full access)

4. **Redis Connection**
   - Frontend: No connection
   - Backend: Full connection (rate limiting)

5. **Security Rule**
   - If it's secret → Backend only
   - If it's public → Can be in Frontend

---

*Quick Reference created on December 21, 2025*
