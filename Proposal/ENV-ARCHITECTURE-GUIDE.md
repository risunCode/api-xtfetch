# 🔐 Environment Variables Architecture Guide

> **Frontend vs Backend Environment Setup**

---

## 📋 Overview

Karena kita sudah split menjadi 2 project terpisah (Frontend + Backend), masing-masing punya `.env` sendiri dengan tujuan berbeda:

```
XTFetch-SocmedDownloader/  (Frontend)
├── .env                   → Client-side + Server-side (Next.js)
└── .env.example

api-xtfetch/              (Backend API)
├── .env                  → Server-side only (API)
└── .env.example
```

---

## 🎯 Pembagian Tanggung Jawab

### Frontend (.env)
**Tujuan**: Render UI, handle user interactions, call backend API

**Yang Dibutuhkan**:
- ✅ Supabase (untuk auth user di browser)
- ✅ Backend API URL
- ✅ Public keys (VAPID, dll)
- ❌ TIDAK butuh Redis
- ❌ TIDAK butuh Service Role Key (security risk!)
- ❌ TIDAK butuh Encryption Key

### Backend (.env)
**Tujuan**: Process scraping, database operations, rate limiting

**Yang Dibutuhkan**:
- ✅ Supabase (untuk validate API keys, store data)
- ✅ Redis (untuk rate limiting & caching)
- ✅ Service Role Key (untuk admin operations)
- ✅ Encryption Key (untuk encrypt cookies)
- ❌ TIDAK butuh Frontend URL (kecuali untuk CORS)

---

## 📁 File Structure

### Frontend: `XTFetch-SocmedDownloader/.env`

```bash
# ═══════════════════════════════════════════════════════════════
# FRONTEND Environment Configuration
# ═══════════════════════════════════════════════════════════════

# ┌─────────────────────────────────────────────────────────────┐
# │ APP URLs                                                    │
# └─────────────────────────────────────────────────────────────┘
NEXT_PUBLIC_BASE_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3002          # ← Backend API URL

# ┌─────────────────────────────────────────────────────────────┐
# │ SUPABASE (Client-side Auth)                                 │
# │ ONLY use ANON KEY - NEVER use Service Role Key!            │
# └─────────────────────────────────────────────────────────────┘
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...          # ← Safe for browser

# ┌─────────────────────────────────────────────────────────────┐
# │ PUSH NOTIFICATIONS (Public Key Only)                        │
# └─────────────────────────────────────────────────────────────┘
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BPxxx...              # ← Safe for browser

# ┌─────────────────────────────────────────────────────────────┐
# │ OPTIONAL: Server-side only (for SSR/API routes)            │
# └─────────────────────────────────────────────────────────────┘
# Jika frontend punya API routes sendiri (jarang dipakai sekarang)
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...            # ← Hanya jika perlu
```

**Total Variables**: ~5 (minimal)

---

### Backend: `api-xtfetch/.env`

```bash
# ═══════════════════════════════════════════════════════════════
# BACKEND API Environment Configuration
# ═══════════════════════════════════════════════════════════════

# ┌─────────────────────────────────────────────────────────────┐
# │ SUPABASE (Full Access)                                      │
# │ Backend needs Service Role Key for admin operations         │
# └─────────────────────────────────────────────────────────────┘
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...          # ← For client SDK
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...              # ← For admin operations

# ┌─────────────────────────────────────────────────────────────┐
# │ REDIS (Rate Limiting & Caching)                             │
# │ Backend handles all rate limiting logic                     │
# └─────────────────────────────────────────────────────────────┘
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxx...

# ┌─────────────────────────────────────────────────────────────┐
# │ SECURITY (Server-side Only)                                 │
# └─────────────────────────────────────────────────────────────┘
ENCRYPTION_KEY=your-32-char-hex-key                # ← For cookie encryption
JWT_SECRET=your-64-char-hex-key                    # ← For token signing

# ┌─────────────────────────────────────────────────────────────┐
# │ CORS (Frontend URLs)                                        │
# └─────────────────────────────────────────────────────────────┘
ALLOWED_ORIGINS=http://localhost:3001,https://xt-fetch.vercel.app

# ┌─────────────────────────────────────────────────────────────┐
# │ PUSH NOTIFICATIONS (Private Key)                            │
# └─────────────────────────────────────────────────────────────┘
VAPID_PUBLIC_KEY=BPxxx...
VAPID_PRIVATE_KEY=xxx...                           # ← NEVER expose to frontend
VAPID_SUBJECT=mailto:your@email.com

# ┌─────────────────────────────────────────────────────────────┐
# │ OPTIONAL: Integrations                                      │
# └─────────────────────────────────────────────────────────────┘
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

**Total Variables**: ~12 (full featured)

---

## 🔄 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (localhost:3001)                                      │
│  ├── Uses: NEXT_PUBLIC_SUPABASE_URL                            │
│  ├── Uses: NEXT_PUBLIC_SUPABASE_ANON_KEY                       │
│  ├── Uses: NEXT_PUBLIC_API_URL                                 │
│  └── Calls: http://localhost:3002/api/v1/...                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API SERVER                         │
├─────────────────────────────────────────────────────────────────┤
│  Backend (localhost:3002)                                       │
│  ├── Receives: API requests from frontend                      │
│  ├── Uses: SUPABASE_SERVICE_ROLE_KEY (admin operations)        │
│  ├── Uses: REDIS (rate limiting, caching)                      │
│  ├── Uses: ENCRYPTION_KEY (cookie encryption)                  │
│  └── Returns: Scraped data to frontend                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                            │
├─────────────────────────────────────────────────────────────────┤
│  ├── Supabase (Database, Auth)                                 │
│  ├── Redis (Rate Limiting, Cache)                              │
│  ├── Social Media APIs (Scraping targets)                      │
│  └── Discord (Notifications)                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Best Practices

### ✅ DO's

1. **Frontend**:
   - ✅ Use `NEXT_PUBLIC_*` prefix for browser-safe variables
   - ✅ Only store public keys (VAPID public, Supabase anon key)
   - ✅ Store backend API URL

2. **Backend**:
   - ✅ Store all sensitive keys (Service Role, Encryption, JWT)
   - ✅ Use Redis for rate limiting
   - ✅ Validate all incoming requests

### ❌ DON'Ts

1. **Frontend**:
   - ❌ NEVER store Service Role Key
   - ❌ NEVER store Encryption Key
   - ❌ NEVER store Private Keys (VAPID private, JWT secret)
   - ❌ NEVER store Redis credentials

2. **Backend**:
   - ❌ NEVER expose internal keys via API responses
   - ❌ NEVER log sensitive environment variables

---

## 📊 Comparison Table

| Variable | Frontend | Backend | Purpose |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Required | ✅ Required | Supabase connection |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Required | ✅ Required | Client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ Never | ✅ Required | Admin operations |
| `NEXT_PUBLIC_API_URL` | ✅ Required | ❌ Not needed | Backend endpoint |
| `UPSTASH_REDIS_REST_URL` | ❌ Never | ✅ Required | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | ❌ Never | ✅ Required | Redis auth |
| `ENCRYPTION_KEY` | ❌ Never | ✅ Required | Cookie encryption |
| `JWT_SECRET` | ❌ Never | ✅ Optional | Token signing |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✅ Optional | ❌ Not needed | Push notifications |
| `VAPID_PRIVATE_KEY` | ❌ Never | ✅ Optional | Push notifications |
| `ALLOWED_ORIGINS` | ❌ Not needed | ✅ Required | CORS config |
| `DISCORD_WEBHOOK_URL` | ❌ Never | ✅ Optional | Notifications |

---

## 🚀 Setup Instructions

### Step 1: Setup Backend First

```bash
cd api-xtfetch
cp .env.example .env
nano .env  # Edit with your values
```

**Required Variables**:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
ENCRYPTION_KEY=$(openssl rand -hex 16)
ALLOWED_ORIGINS=http://localhost:3001
```

**Optional but Recommended**:
```bash
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxx...
```

### Step 2: Setup Frontend

```bash
cd ../XTFetch-SocmedDownloader
cp .env.example .env
nano .env  # Edit with your values
```

**Required Variables**:
```bash
NEXT_PUBLIC_BASE_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3002
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### Step 3: Verify Setup

```bash
# Terminal 1: Start Backend
cd api-xtfetch
npm run dev  # Port 3002

# Terminal 2: Start Frontend
cd XTFetch-SocmedDownloader
npm run dev  # Port 3001
```

**Test**:
1. Open browser: `http://localhost:3001`
2. Frontend should call: `http://localhost:3002/api/v1/...`
3. Check browser console for API calls

---

## 🔍 Common Issues

### Issue 1: Frontend can't connect to Backend
**Symptom**: CORS errors, network errors

**Solution**:
```bash
# Backend .env
ALLOWED_ORIGINS=http://localhost:3001

# Frontend .env
NEXT_PUBLIC_API_URL=http://localhost:3002
```

### Issue 2: Supabase auth not working
**Symptom**: "Invalid API key" errors

**Solution**:
- Frontend: Use `NEXT_PUBLIC_SUPABASE_ANON_KEY` (NOT Service Role)
- Backend: Use `SUPABASE_SERVICE_ROLE_KEY` for admin operations

### Issue 3: Rate limiting not working
**Symptom**: No rate limits applied

**Solution**:
```bash
# Backend .env (REQUIRED)
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxx...
```

---

## 📝 Production Deployment

### Frontend (Vercel)
```bash
# Environment Variables in Vercel Dashboard
NEXT_PUBLIC_BASE_URL=https://xt-fetch.vercel.app
NEXT_PUBLIC_API_URL=https://api-xtfetch.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BPxxx...
```

### Backend (Vercel)
```bash
# Environment Variables in Vercel Dashboard
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxx...
ENCRYPTION_KEY=your-32-char-hex-key
ALLOWED_ORIGINS=https://xt-fetch.vercel.app
VAPID_PUBLIC_KEY=BPxxx...
VAPID_PRIVATE_KEY=xxx...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

---

## 🎯 Summary

### Frontend Responsibilities
- ✅ User interface & interactions
- ✅ Client-side auth (Supabase anon key)
- ✅ Call backend API
- ✅ Display scraped data

### Backend Responsibilities
- ✅ Scraping logic
- ✅ Rate limiting (Redis)
- ✅ API key validation (Supabase)
- ✅ Cookie encryption
- ✅ Admin operations (Service Role Key)
- ✅ Database operations

### Key Principle
> **Frontend = Public, Backend = Private**
> 
> Jika variable bisa dilihat di browser DevTools, itu harus di Frontend.
> Jika variable harus rahasia, itu harus di Backend.

---

*Guide created on December 21, 2025 - XTFetch Environment Architecture*
