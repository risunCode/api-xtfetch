# 🚀 XT-Fetch API

> High-performance social media scraper API with Telegram bot integration.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)

## 🌐 Supported Platforms

| Platform | Video | Image | Stories | Carousel |
|----------|-------|-------|---------|----------|
| Facebook | ✅ | ✅ | ✅ | ✅ |
| Instagram | ✅ | ✅ | ✅ | ✅ |
| Twitter/X | ✅ | ✅ | - | ✅ |
| TikTok | ✅ | ✅ | - | ✅ |
| Weibo | ✅ | ✅ | - | - |
| YouTube | ✅ | - | - | - |

## 🔑 Features

- **Multi-engine scrapers** - Fallback engines for reliability
- **Smart caching** - Redis + in-memory LRU cache
- **Rate limiting** - Per-IP and per-API-key limits
- **Telegram Bot** - Download media directly via Telegram
- **Cookie pool** - Rotating cookies for private content
- **SSRF protection** - Secure proxy with domain whitelist

## 📡 API Endpoints

### Public Playground (Rate Limited)
```bash
GET /api/v1/playground?url={VIDEO_URL}
```

### Premium API (Requires API Key)
```bash
GET /api/v1?key={API_KEY}&url={VIDEO_URL}
```

### Media Proxy
```bash
GET /api/v1/proxy?url={CDN_URL}&platform={PLATFORM}
```

### YouTube Merge (Video + Audio)
```bash
POST /api/v1/youtube/merge
Body: { "url": "...", "quality": "1080p" }
```

## 🤖 Telegram Bot

Built-in Telegram bot for direct media downloads:
- Send any supported URL to download
- Quality selection via inline buttons
- Multi-language support (EN/ID)
- Admin commands for management

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Development (port 3002)
npm run dev

# Production build
npm run build && npm start
```

## ⚙️ Environment Variables

```env
# Required
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Optional - Telegram Bot
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

# Optional - Security
ADMIN_SECRET_KEY=
ENCRYPTION_KEY=
```

## 📊 Tech Stack

- **Framework**: Next.js 15 + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Cache**: Upstash Redis
- **Bot**: grammY (Telegram)
- **Scraping**: Cheerio, yt-dlp

## 📄 License

GPL-3.0 License - see [LICENSE](./LICENSE)

---

**Built with ❤️ by [risunCode](https://github.com/risunCode)**
