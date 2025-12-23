# 🚀 XTFetch Backend API

> **Free, fast, and easy-to-use API for downloading videos from social media platforms**  
> No registration, no limits, no BS.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/risunCode/api-xfetch)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)

---

## 🎯 What is this?

XTFetch Backend API is the **server-side component** of the XTFetch social media video downloader. This API-only backend handles:

- **Video scraping** from 5+ platforms (Facebook, Instagram, Twitter/X, TikTok, Weibo)
- **Cookie pool management** with health tracking and rotation
- **Rate limiting** and security middleware
- **Admin panel APIs** for platform management
- **Push notifications** system
- **Caching layer** with Redis

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    XTFetch Backend API                           │
├─────────────────────────────────────────────────────────────────┤
│  Next.js 15 API Routes (27 endpoints)                          │
│  ├── /api              → Main download API                      │
│  ├── /api/playground   → Guest testing API                      │
│  ├── /api/admin/*      → Admin management (18 endpoints)       │
│  ├── /api/proxy        → Media proxy (CORS bypass)             │
│  └── /api/status       → Service health check                   │
├─────────────────────────────────────────────────────────────────┤
│  Core Modules                                                   │
│  ├── @/core/scrapers   → Platform scrapers + factory           │
│  ├── @/core/security   → Encryption, rate limiting, auth       │
│  ├── @/core/database   → Supabase client, cache, config        │
│  └── @/core/config     → Constants, environment                │
├─────────────────────────────────────────────────────────────────┤
│  Library Modules                                                │
│  ├── @/lib/cookies     → Cookie parsing, pool rotation         │
│  ├── @/lib/http        → Axios client, fetch utilities         │
│  ├── @/lib/url         → URL pipeline (normalize, detect)      │
│  ├── @/lib/services    → Platform scrapers implementation      │
│  └── @/lib/utils       → Backend utilities                     │
└─────────────────────────────────────────────────────────────────┘
```

## 🌐 Supported Platforms

| Platform | Status | Method | Cookie Required | Features |
|----------|--------|--------|-----------------|----------|
| **Facebook** | ✅ Active | HTML Scraping | Optional | Videos, Reels, Stories |
| **Instagram** | ✅ Active | GraphQL API + Embed | Optional | Posts, Reels, Stories |
| **Twitter/X** | ✅ Active | Syndication + GraphQL | Optional | Tweets, Videos |
| **TikTok** | ✅ Active | TikWM API | No | Videos, no watermark |
| **Weibo** | ✅ Active | Mobile API | Yes | Videos, requires cookie |

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/risunCode/api-xfetch.git
cd api-xfetch
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Configure your `.env` file:

```env
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Security (Required)
ENCRYPTION_KEY=your_32_byte_hex_key

# Redis Cache (Optional but recommended)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Discord Alerts (Optional)
DISCORD_WEBHOOK_URL=your_discord_webhook

# Push Notifications (Optional)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your_email@domain.com
```

### 3. Run Development Server

```bash
npm run dev
```

API will be available at `http://localhost:3002`

### 4. Build for Production

```bash
npm run build
npm start
```

## 📡 API Endpoints

### Public APIs (v1)

```http
POST /api/v1/download
# Main download API - auto-detects platform from URL
# Body: { "url": "https://..." }

POST /api/v1/playground  
# Guest API for testing (rate limited: 5 req/2min)
# Body: { "url": "https://..." }

GET /api/v1/status
# Service health check and platform status

GET /api/v1/announcements
# Get site-wide announcements

POST /api/v1/push/subscribe
# Subscribe to push notifications

GET /api/proxy?url=...
# Media proxy for CORS bypass
```

### Admin APIs (Authentication Required)

```http
# Authentication
POST /api/admin/auth
# Admin login with Supabase JWT

# Platform Management  
GET|POST|PATCH /api/admin/services
# Enable/disable platforms, configure rate limits

# Cookie Pool Management
GET|POST|DELETE /api/admin/cookies/pool
GET /api/admin/cookies/status
POST /api/admin/cookies/health-check
POST /api/admin/cookies/migrate

# User Management
GET|POST|PATCH|DELETE /api/admin/users

# API Keys
GET|POST|DELETE /api/admin/apikeys

# Analytics & Stats
GET /api/admin/stats

# System Settings
GET|POST /api/admin/settings

# Push Notifications
GET|POST /api/admin/push

# Cache Management
DELETE /api/admin/cache
```

## 🔐 Security Features

### 1. **Rate Limiting**
- **Global**: 60 req/min per IP
- **Auth endpoints**: 10 req/min per IP  
- **Playground**: 5 req/2min per IP
- **Per-platform**: Configurable limits
- **Per-API-key**: Custom rate limits

### 2. **Authentication & Authorization**
- **Supabase JWT** for admin authentication
- **Role-based access** (user, admin)
- **API key management** with usage tracking
- **Session management** with automatic refresh

### 3. **Data Protection**
- **AES-256-GCM encryption** for sensitive data
- **Cookie encryption** at rest
- **XSS/SQLi pattern detection**
- **Input sanitization** and validation
- **SSRF protection** with proxy whitelist

### 4. **Security Headers**
```
Content-Security-Policy: default-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
```

## 🍪 Cookie Pool System

Enterprise-grade cookie management for bypassing rate limits:

```
┌─────────────────────────────────────────────────────────────┐
│                    COOKIE POOL                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ Cookie1 │  │ Cookie2 │  │ Cookie3 │  │ Cookie4 │       │
│  │ healthy │  │ cooldown│  │ healthy │  │ expired │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                             │
│  Features:                                                  │
│  ✅ Automatic rotation (least recently used)                │
│  ✅ Health tracking (healthy/cooldown/expired)              │
│  ✅ Stats per cookie (uses, success, errors)               │
│  ✅ Encrypted at rest (AES-256-GCM)                        │
│  ✅ Admin UI for management                                 │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Tech Stack

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Framework** | Next.js | 15.1.3 | API routes & middleware |
| **Language** | TypeScript | 5.7.2 | Type safety |
| **Database** | Supabase | 2.49.1 | PostgreSQL with RLS |
| **Cache** | Upstash Redis | 1.34.3 | Response caching |
| **HTTP Client** | Axios | 1.7.9 | Scraping requests |
| **HTML Parser** | Cheerio | 1.0.0 | DOM manipulation |
| **Push Notifications** | web-push | 3.6.7 | Admin notifications |

## 🚀 Deployment

### Vercel (Recommended)

1. **Fork this repository**
2. **Connect to Vercel**
3. **Configure environment variables**
4. **Deploy**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/risunCode/api-xfetch)

### Manual Deployment

```bash
# Build
npm run build

# Start production server
npm start
```

## 📈 Monitoring & Analytics

### Tracked Metrics
- Downloads per platform
- Success/error rates  
- Response times
- Geographic distribution
- API key usage
- Cookie health stats

### Error Tracking
- Platform-specific errors
- Error categorization  
- Recent errors dashboard
- Error trends analysis

## 🔧 Development

### Commands

```bash
npm run dev      # Development server (port 3002)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

### Project Structure

```
src/
├── app/api/              # Next.js API routes (27 endpoints)
├── core/                 # Core domain logic
│   ├── scrapers/         # Platform scrapers + factory
│   ├── security/         # Encryption, rate limiting, auth
│   ├── database/         # Supabase client, cache, config
│   └── config/           # Constants, environment
├── lib/                  # Library modules
│   ├── cookies/          # Cookie parsing, pool rotation
│   ├── http/             # HTTP client, fetch utilities
│   ├── url/              # URL pipeline processing
│   ├── services/         # Platform scrapers implementation
│   └── utils/            # Utility functions
└── middleware.ts         # Security & rate limiting middleware
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit changes** (`git commit -m 'Add amazing feature'`)
4. **Push to branch** (`git push origin feature/amazing-feature`)
5. **Open Pull Request**

## 📄 License

This project is licensed under the **GPL-3.0 License** - see the [LICENSE](./LICENSE) file for details.

## 🔗 Related Projects

- **[XTFetch Frontend](https://github.com/risunCode/XTFetch-SocmedDownloader)** - React frontend for XTFetch
- **[XTFetch Website](https://xt-fetch.vercel.app/)** - Live demo

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/risunCode/api-xfetch/issues)
- **Discussions**: [GitHub Discussions](https://github.com/risunCode/api-xfetch/discussions)
- **Email**: [Contact](mailto:risuncode@users.noreply.github.com)

---

**Built with ❤️ by [risunCode](https://github.com/risunCode)**