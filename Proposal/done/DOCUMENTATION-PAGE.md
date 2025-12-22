# Proposal: Documentation Page

> **Status**: Draft  
> **Date**: December 21, 2025  
> **Priority**: Medium  
> **Estimated Effort**: 2-3 days

---

## 📋 Overview

Membuat halaman dokumentasi lengkap untuk XTFetch yang berisi:
- API Reference
- Getting Started Guide
- Platform-specific guides
- FAQ
- Changelog

---

## 🎯 Goals

1. **Developer-friendly** - API docs yang jelas dengan contoh code
2. **User-friendly** - Panduan penggunaan untuk end-user
3. **Searchable** - Bisa search content
4. **Responsive** - Mobile-friendly
5. **Dark/Light mode** - Sesuai theme app

---

## 📐 Page Structure

```
/docs                     → Documentation home
/docs/getting-started     → Quick start guide
/docs/api                 → API Reference (main)
/docs/api/[platform]      → Platform-specific API
/docs/guides              → User guides
/docs/guides/[slug]       → Individual guide
/docs/faq                 → Frequently Asked Questions
/docs/changelog           → Version history (berarti changelog yang ada di about kita hapus!)
```

---

## 🗂️ Content Structure

### 1. Getting Started (`/docs/getting-started`)

```markdown
# Getting Started

## Quick Start
1. Paste URL dari social media
2. Pilih kualitas video
3. Download!

## Supported Platforms
- Facebook (Videos, Reels, Stories)
- Instagram (Posts, Reels, Stories)
- Twitter/X (Tweets with video)
- TikTok (Videos, no watermark)
- YouTube (Videos, Shorts)
- Weibo (Videos, requires cookie)

## Features
- No watermark
- Multiple quality options
- No registration required
- Free unlimited downloads
```

### 2. API Reference (`/docs/api`)

```markdown
# API Reference

## Base URL
https://xtfetch.com/api

## Authentication
- **Public API**: No auth required (rate limited)
- **API Key**: Higher limits, usage tracking

## Endpoints

### POST /api
Main download endpoint (auto-detect platform)

### POST /api/playground  
Guest API for testing (5 req/2min)

### GET /api/status
Service status and platform availability

### GET /api/proxy
Media proxy for CORS bypass
```

### 3. Platform Guides (`/docs/api/[platform]`)

Untuk setiap platform:
- Supported URL formats
- Response structure
- Error codes
- Rate limits
- Cookie requirements (if any)
- Code examples (cURL, JavaScript, Python)

### 4. User Guides (`/docs/guides`)

```
guides/
├── cookies/           → How to get cookies
│   ├── facebook.md
│   ├── instagram.md
│   └── weibo.md
├── api-keys.md        → Managing API keys
├── settings.md        → App settings explained
├── troubleshooting.md → Common issues & fixes
└── privacy.md         → Privacy & data handling
```

### 5. FAQ (`/docs/faq`)

```markdown
## General
- What is XTFetch?
- Is it free?
- Do I need to register?

## Downloads
- Why is my download failing?
- How to download private content?
- What quality options are available?

## Technical
- What are cookies and why do I need them?
- How to get my API key?
- What are the rate limits?

## Privacy
- Do you store my data?
- Is my cookie safe?
```

### 6. Changelog (`/docs/changelog`)

- Pull from existing `CHANGELOG.md`
- Version history dengan filter
- Breaking changes highlighted

---

## 🎨 UI Components

### Sidebar Navigation

```
📚 Documentation
├── 🚀 Getting Started
├── 📡 API Reference
│   ├── Overview
│   ├── Authentication
│   ├── Endpoints
│   └── Platforms
│       ├── Facebook
│       ├── Instagram
│       ├── Twitter
│       ├── TikTok
│       ├── YouTube
│       └── Weibo
├── 📖 Guides
│   ├── Cookie Setup
│   ├── API Keys
│   └── Troubleshooting
├── ❓ FAQ
└── 📝 Changelog
```

### Code Block Component

```tsx
<CodeBlock 
  language="javascript"
  title="Example Request"
  copyable
>
{`const response = await fetch('/api', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://...' })
});`}
</CodeBlock>
```

### API Endpoint Card

```tsx
<EndpointCard
  method="POST"
  path="/api"
  description="Download media from any supported platform"
  auth="optional"
/>
```

### Response Example

```tsx
<ResponseExample
  status={200}
  body={{
    success: true,
    platform: "instagram",
    data: {
      title: "...",
      formats: [...]
    }
  }}
/>
```

---

## 📁 File Structure

```
src/
├── app/
│   └── docs/
│       ├── layout.tsx           → Docs layout with sidebar
│       ├── page.tsx             → Docs home
│       ├── getting-started/
│       │   └── page.tsx
│       ├── api/
│       │   ├── page.tsx         → API overview
│       │   └── [platform]/
│       │       └── page.tsx     → Platform-specific
│       ├── guides/
│       │   ├── page.tsx         → Guides index
│       │   └── [slug]/
│       │       └── page.tsx
│       ├── faq/
│       │   └── page.tsx
│       └── changelog/
│           └── page.tsx
│
├── components/
│   └── docs/
│       ├── DocsSidebar.tsx      → Navigation sidebar
│       ├── DocsSearch.tsx       → Search component
│       ├── CodeBlock.tsx        → Syntax highlighted code
│       ├── EndpointCard.tsx     → API endpoint display
│       ├── ResponseExample.tsx  → JSON response viewer
│       ├── TableOfContents.tsx  → Page TOC
│       └── Callout.tsx          → Info/Warning boxes
│
└── content/
    └── docs/
        ├── getting-started.mdx
        ├── api/
        │   ├── overview.mdx
        │   ├── authentication.mdx
        │   ├── facebook.mdx
        │   ├── instagram.mdx
        │   ├── twitter.mdx
        │   ├── tiktok.mdx
        │   ├── youtube.mdx
        │   └── weibo.mdx
        ├── guides/
        │   ├── cookies.mdx
        │   ├── api-keys.mdx
        │   └── troubleshooting.mdx
        └── faq.mdx
```

---

## 🔧 Technical Implementation

### Option A: MDX (Recommended)

```bash
npm install @next/mdx @mdx-js/loader @mdx-js/react
npm install rehype-highlight rehype-slug
npm install remark-gfm
```

**Pros:**
- Write docs in Markdown
- Embed React components
- Easy to maintain
- Good SEO

### Option B: Contentlayer

```bash
npm install contentlayer next-contentlayer
```

**Pros:**
- Type-safe content
- Auto-generated types
- Better DX

### Option C: Static JSON/TS

- Define content in TypeScript files
- No extra dependencies
- Full control

**Recommendation:** Option A (MDX) - balance antara flexibility dan simplicity.

---

## 🎨 Design Specs

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header (same as main app)                              │
├──────────┬──────────────────────────────┬───────────────┤
│          │                              │               │
│ Sidebar  │     Main Content             │  TOC          │
│ (240px)  │     (flex-1)                 │  (200px)      │
│          │                              │  (desktop)    │
│          │                              │               │
├──────────┴──────────────────────────────┴───────────────┤
│  Footer                                                 │
└─────────────────────────────────────────────────────────┘
```

### Colors (Dark Mode)

```css
--docs-bg: var(--bg-primary);
--docs-sidebar-bg: var(--bg-secondary);
--docs-code-bg: #1e1e1e;
--docs-border: var(--border-color);
--docs-link: var(--accent-primary);
```

### Typography

```css
/* Headings */
h1: 2rem, font-bold
h2: 1.5rem, font-semibold
h3: 1.25rem, font-medium

/* Body */
p: 1rem, leading-relaxed

/* Code */
code: 0.875rem, font-mono
```

---

## 📊 API Documentation Format

### Endpoint Documentation Template

```markdown
## POST /api

Download media from any supported platform.

### Request

**Headers**
| Header | Required | Description |
|--------|----------|-------------|
| Content-Type | Yes | application/json |
| X-API-Key | No | Your API key for higher limits |

**Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| url | string | Yes | Social media URL |
| cookie | string | No | Platform cookie |
| skipCache | boolean | No | Skip cached results |

### Response

**Success (200)**
```json
{
  "success": true,
  "platform": "instagram",
  "data": {
    "title": "Video title",
    "author": "@username",
    "thumbnail": "https://...",
    "formats": [
      {
        "url": "https://...",
        "quality": "720p",
        "type": "video"
      }
    ]
  }
}
```

**Error (4xx/5xx)**
```json
{
  "success": false,
  "error": "Error message"
}
```

### Code Examples

<Tabs>
  <Tab label="cURL">
    ```bash
    curl -X POST https://xtfetch.com/api \
      -H "Content-Type: application/json" \
      -d '{"url": "https://instagram.com/p/ABC123"}'
    ```
  </Tab>
  <Tab label="JavaScript">
    ```javascript
    const response = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://...' })
    });
    const data = await response.json();
    ```
  </Tab>
  <Tab label="Python">
    ```python
    import requests
    
    response = requests.post(
      'https://xtfetch.com/api',
      json={'url': 'https://...'}
    )
    data = response.json()
    ```
  </Tab>
</Tabs>
```

---

## ✅ Implementation Checklist

### Phase 1: Foundation
- [ ] Setup MDX configuration
- [ ] Create docs layout with sidebar
- [ ] Create base components (CodeBlock, Callout)
- [ ] Setup routing structure

### Phase 2: Core Content
- [ ] Getting Started page
- [ ] API Overview page
- [ ] Platform-specific API docs (6 platforms)
- [ ] Error codes reference

### Phase 3: Guides & FAQ
- [ ] Cookie setup guides
- [ ] API key management guide
- [ ] Troubleshooting guide
- [ ] FAQ page

### Phase 4: Polish
- [ ] Search functionality
- [ ] Table of Contents
- [ ] Mobile responsive
- [ ] Dark/Light mode
- [ ] Changelog integration

### Phase 5: SEO & Analytics
- [ ] Meta tags for each page
- [ ] Structured data (JSON-LD)
- [ ] Sitemap generation
- [ ] Analytics tracking

---

## 📦 Dependencies

```json
{
  "@next/mdx": "^15.0.0",
  "@mdx-js/loader": "^3.0.0",
  "@mdx-js/react": "^3.0.0",
  "rehype-highlight": "^7.0.0",
  "rehype-slug": "^6.0.0",
  "remark-gfm": "^4.0.0"
}
```

---

## 🚀 Future Enhancements

1. **API Playground** - Interactive API tester in docs
2. **SDK Downloads** - JavaScript/Python SDK
3. **Webhook Docs** - Discord webhook integration guide
4. **Rate Limit Calculator** - Estimate usage
5. **Status Page Integration** - Real-time platform status
6. **Multi-language** - i18n for docs (EN/ID)

---

## 📝 Notes

- Prioritize API docs first (most requested)
- Keep content concise and scannable
- Include real working examples
- Update docs when API changes
- Consider versioning for breaking changes
