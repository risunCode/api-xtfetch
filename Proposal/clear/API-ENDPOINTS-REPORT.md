# XTFetch API Endpoints Report

## Overview
Report lengkap semua public GET API endpoints dan response-nya.

**Note:** Rate limit di response `meta.rateLimit` adalah hardcoded string, bukan dari database.

---

## 1. `/api/health` (Hidden)
**Purpose:** Health check & system info

### Response
```json
{
  "status": "ok",
  "timestamp": "2025-12-22T15:07:44.978Z",
  "uptime": 587.75,
  "node": "v25.1.0",
  "ytdlp": "not available"
}
```

---

## 2. `/api/v1/status`
**Purpose:** Service status & platform availability

### Response
```json
{
  "success": true,
  "data": {
    "maintenance": false,
    "maintenanceMessage": null,
    "platforms": [
      { "id": "facebook", "name": "Facebook", "enabled": true, "status": "active" },
      { "id": "instagram", "name": "Instagram", "enabled": true, "status": "active" },
      { "id": "twitter", "name": "Twitter/X", "enabled": true, "status": "active" },
      { "id": "tiktok", "name": "TikTok", "enabled": true, "status": "active" },
      { "id": "weibo", "name": "Weibo", "enabled": false, "status": "offline" },
      { "id": "youtube", "name": "YouTube", "enabled": true, "status": "active" }
    ],
    "apiVersion": "v1",
    "endpoints": { ... }
  },
  "meta": {
    "endpoint": "/api/v1/status",
    "timestamp": "2025-12-22T15:07:55.456Z",
    "version": "1.0.0"
  }
}
```

---

## 3. `/api/v1/cookies` (Hidden)
**Purpose:** Check cookie availability per platform

### Response
```json
{
  "success": true,
  "data": {
    "instagram": { "available": true, "label": "Instagram" },
    "twitter": { "available": true, "label": "Twitter" },
    "facebook": { "available": true, "label": "Facebook" },
    "weibo": { "available": true, "label": "Weibo" }
  }
}
```

---

## 4. `/api/v1/playground?url={URL}`
**Purpose:** Free API testing - extract media from URL

### Response Structure
```json
{
  "success": true,
  "data": {
    "title": "Video Title",
    "author": "Author Name",
    "thumbnail": "https://...",
    "url": "https://original-url...",
    "formats": [...],
    "cached": true,
    "engagement": {
      "views": 1724535182,
      "likes": 18689390,
      "comments": 1234,
      "shares": 5678
    }
  },
  "meta": {
    "tier": "playground",
    "platform": "youtube",
    "rateLimit": "5 requests per 2 minutes",
    "endpoint": "/api/v1/playground",
    "responseTime": "3194ms",
    "note": "For testing purposes only."
  }
}
```

### Data Fields
| Field | Type | Description |
|-------|------|-------------|
| title | string | Video/post title |
| author | string | Channel/uploader name |
| thumbnail | string | Thumbnail URL |
| url | string | Original URL |
| formats | array | Available download formats |
| cached | boolean | `true` jika dari Redis cache |
| engagement | object | Stats (jika platform support) |

### Engagement Fields (Platform-dependent)
| Field | Type | Platforms |
|-------|------|-----------|
| views | number | YouTube, Twitter, TikTok |
| likes | number | YouTube, Twitter, Weibo, TikTok |
| comments | number | Twitter, Weibo, TikTok |
| shares | number | Twitter, Weibo, TikTok |
| bookmarks | number | Twitter |
| replies | number | Twitter |

### Format Fields
| Field | Type | Description |
|-------|------|-------------|
| url | string | Direct download URL |
| quality | string | "1080p", "720p", "480p", etc |
| type | string | "video", "audio", "image" |
| format | string | "mp4", "webm", "m4a" |
| filesize | number | File size in bytes (optional) |
| width | number | Video width (optional) |
| height | number | Video height (optional) |

### Meta Fields
| Field | Type | Description |
|-------|------|-------------|
| tier | string | "playground" atau "premium" |
| platform | string | Detected platform |
| rateLimit | string | Hardcoded: "5 requests per 2 minutes" |
| responseTime | string | Processing time (e.g. "3194ms") |

---

## Engagement Support by Platform

| Platform | views | likes | comments | shares | bookmarks | replies |
|----------|-------|-------|----------|--------|-----------|---------|
| YouTube | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Facebook | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Instagram | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Twitter/X | ✅ | ✅ | ❌ | ✅ (retweets) | ✅ | ✅ |
| TikTok | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Weibo | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## Cache Behavior

- **Storage:** Redis (Upstash)
- **Response field:** `data.cached: true/false`
- **Benefit:** Cached responses return instantly tanpa re-scrape

---

## Rate Limits (Hardcoded)

| Endpoint | Limit | Note |
|----------|-------|------|
| `/api/v1/playground` | 5 req / 2 min | Hardcoded di route |
| `/api/v1/status` | 30 req / min | - |

**Note:** `meta.rateLimit` di response adalah string hardcoded, bukan dynamic dari database.

---

## Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "errorCode": "ERROR_CODE"
}
```

### Common Error Codes
| Code | Description |
|------|-------------|
| INVALID_URL | URL format invalid |
| UNSUPPORTED_PLATFORM | Platform not supported |
| VIDEO_NOT_FOUND | Video unavailable |
| RATE_LIMITED | Too many requests |
| EXTRACTION_FAILED | Failed to extract |
