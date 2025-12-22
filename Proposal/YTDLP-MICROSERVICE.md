# yt-dlp Integration Proposal

## Overview

Migrate backend `api-xtfetch` dari Vercel ke **Railway/Render** supaya bisa jalanin **yt-dlp** untuk YouTube downloads. Satu backend, support semua platform.

---

## Current vs New Architecture

### Current (Vercel - Limited)
```
Frontend (Vercel) ──▶ Backend (Vercel) ──▶ External YouTube API ❌
                                           (IP mismatch, 403)
```

### New (Railway/Render - Full Support)
```
Frontend (Vercel) ──▶ Backend (Railway/Render) ──▶ yt-dlp (Python)
   Port 3001              Port 3002                    │
                               │                       ▼
                               │                  YouTube URLs
                               │                  (IP matched!)
                               ▼
                          Proxy to User ✅
```

---

## Why Railway/Render?

| Feature | Vercel | Railway/Render |
|---------|--------|----------------|
| Node.js | ✅ | ✅ |
| Python | ❌ | ✅ |
| Binary execution | ❌ | ✅ |
| Long-running process | ❌ (10s limit) | ✅ |
| yt-dlp | ❌ | ✅ |

---

## Implementation Plan

### Step 1: Add Python yt-dlp Script

Create Python script di backend untuk extract YouTube:

```
api-xtfetch/
├── src/
│   └── ...existing code...
├── scripts/
│   └── ytdlp-extract.py    # NEW: Python extractor
├── Dockerfile              # NEW: For Railway/Render
├── railway.json            # NEW: Railway config
└── package.json
```

### Step 2: ytdlp-extract.py

```python
#!/usr/bin/env python3
"""
YouTube extractor using yt-dlp
Usage: python ytdlp-extract.py <url>
Output: JSON to stdout
"""
import sys
import json
import yt_dlp

def extract(url: str) -> dict:
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'format': 'best',
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        formats = []
        for f in info.get('formats', []):
            if not f.get('url'):
                continue
            
            vcodec = f.get('vcodec', 'none')
            acodec = f.get('acodec', 'none')
            
            if vcodec != 'none' and acodec != 'none':
                ftype = 'video'  # combined
            elif vcodec != 'none':
                ftype = 'video'
            elif acodec != 'none':
                ftype = 'audio'
            else:
                continue
            
            formats.append({
                'format_id': f.get('format_id'),
                'quality': f.get('format_note') or f.get('resolution') or f'{f.get("abr", 0)}kbps',
                'ext': f.get('ext'),
                'filesize': f.get('filesize') or f.get('filesize_approx'),
                'url': f.get('url'),
                'type': ftype,
                'height': f.get('height'),
                'fps': f.get('fps'),
            })
        
        # Sort by quality
        formats.sort(key=lambda x: (-(x.get('height') or 0), -(x.get('filesize') or 0)))
        
        return {
            'success': True,
            'data': {
                'id': info.get('id'),
                'title': info.get('title'),
                'author': info.get('uploader') or info.get('channel'),
                'duration': info.get('duration'),
                'thumbnail': info.get('thumbnail'),
                'formats': formats
            }
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'URL required'}))
        sys.exit(1)
    
    try:
        result = extract(sys.argv[1])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)
```

### Step 3: Update YouTube Scraper (Node.js calls Python)

```typescript
// api-xtfetch/src/lib/services/youtube.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { ScraperResult, ScraperErrorCode, createError } from '@/core/scrapers/types';

const execAsync = promisify(exec);

export async function scrapeYouTube(url: string): Promise<ScraperResult> {
  try {
    // Call Python script
    const { stdout, stderr } = await execAsync(
      `python3 scripts/ytdlp-extract.py "${url}"`,
      { timeout: 30000 } // 30s timeout
    );
    
    const result = JSON.parse(stdout);
    
    if (!result.success) {
      throw createError(ScraperErrorCode.EXTRACTION_FAILED, result.error);
    }
    
    const { data } = result;
    
    return {
      title: data.title,
      author: data.author,
      thumbnail: data.thumbnail,
      duration: data.duration,
      formats: data.formats.map((f: any) => ({
        url: f.url,
        quality: f.quality || `${f.height}p`,
        type: f.type,
        format: f.ext,
        filesize: f.filesize,
      })),
      platform: 'youtube',
    };
  } catch (error: any) {
    if (error.code === 'ETIMEDOUT') {
      throw createError(ScraperErrorCode.TIMEOUT, 'YouTube extraction timed out');
    }
    throw createError(ScraperErrorCode.EXTRACTION_FAILED, error.message);
  }
}
```

### Step 4: Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install Python + yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages yt-dlp

# Install Node dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build Next.js
RUN npm run build

EXPOSE 3002

CMD ["npm", "start"]
```

### Step 5: railway.json

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

---

## Deployment

### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Init project (di folder api-xtfetch)
cd api-xtfetch
railway init

# Deploy
railway up
```

### Render
1. Connect GitHub repo
2. Select `api-xtfetch` folder
3. Environment: Docker
4. Deploy!

---

## Environment Variables

```env
# Same as before, plus:
PORT=3002

# Frontend .env update:
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

---

## Cost

| Platform | Free Tier |
|----------|-----------|
| Railway | $5 credit/month (~500 hours) |
| Render | 750 hours/month |

Cukup untuk moderate usage.

---

## Migration Checklist

- [ ] Add `scripts/ytdlp-extract.py`
- [ ] Update `src/lib/services/youtube.ts`
- [ ] Add `Dockerfile`
- [ ] Add `railway.json`
- [ ] Deploy to Railway/Render
- [ ] Update frontend `NEXT_PUBLIC_API_URL`
- [ ] Test YouTube download
- [ ] Remove old external API code

---

## Timeline

| Task | Duration |
|------|----------|
| Add Python script | 15 min |
| Update YouTube scraper | 15 min |
| Create Dockerfile | 15 min |
| Deploy & test | 30 min |
| **Total** | ~1.5 hours |

---

## Notes

- yt-dlp URLs **IP-locked** ke server Railway/Render
- Backend proxy video ke user = **works!** (same IP)
- yt-dlp auto-update: `pip install -U yt-dlp` di Dockerfile
- Support semua platform yang yt-dlp support (bonus!)
