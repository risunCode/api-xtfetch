# YouTube Implementation V2 - Using Free External API

## Overview

Re-implement YouTube support using the free `yt-manager-dl-cc.vercel.app` API. This approach bypasses all previous issues (CORS, IP validation, CDN restrictions) by using a third-party service.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/video?url={youtube_url}` | GET | Get video stream (HLS m3u8) |
| `/api/audio?url={youtube_url}` | GET | Get audio download (MP3) |
| `/api/search?title={query}` | GET | Search YouTube videos |

### Response Formats

**Video Response:**
```json
{
  "status": true,
  "heading": "Video Title (4K Remaster)",
  "link": "https://manifest.googlevideo.com/.../playlist/index.m3u8",
  "duration": "3:33"
}
```

**Audio Response:**
```json
{
  "title": "Video Title",
  "download": "https://ccproject.serv00.net/h.php?content=...",
  "type": "mp3"
}
```

**Search Response:**
```json
{
  "results": [
    {
      "type": "video",
      "videoId": "dQw4w9WgXcQ",
      "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
      "title": "Video Title",
      "description": "...",
      "thumbnail": "https://i.ytimg.com/vi/.../hq720.jpg",
      "seconds": 214,
      "timestamp": "3:34",
      "views": 1723892765,
      "author": { "name": "Channel Name", "url": "..." }
    }
  ]
}
```

## Implementation Plan

### Phase 1: Core Scraper

**File:** `src/lib/services/youtube.ts`

```typescript
import axios from 'axios';
import { ScraperResult, ScraperOptions, createError, ScraperErrorCode } from '@/core/scrapers/types';

const API_BASE = 'https://yt-manager-dl-cc.vercel.app/api';

interface VideoResponse {
  status: boolean;
  heading: string;
  link: string;
  duration: string;
}

interface AudioResponse {
  title: string;
  download: string;
  type: string;
}

export async function scrapeYouTube(url: string, options?: ScraperOptions): Promise<ScraperResult> {
  try {
    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return createError(ScraperErrorCode.INVALID_URL, 'Invalid YouTube URL');
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Fetch video and audio in parallel
    const [videoRes, audioRes] = await Promise.all([
      axios.get<VideoResponse>(`${API_BASE}/video?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 30000 }),
      axios.get<AudioResponse>(`${API_BASE}/audio?url=${encodeURIComponent(youtubeUrl)}`, { timeout: 30000 }),
    ]);

    const video = videoRes.data;
    const audio = audioRes.data;

    if (!video.status || !video.link) {
      return createError(ScraperErrorCode.NO_MEDIA, 'Could not extract video');
    }

    return {
      success: true,
      data: {
        title: video.heading || audio.title || 'YouTube Video',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        author: 'YouTube',
        url: youtubeUrl,
        duration: video.duration,
        formats: [
          {
            url: video.link,
            quality: 'HD Video',
            type: 'video',
            format: 'm3u8', // HLS stream
          },
          ...(audio.download ? [{
            url: audio.download,
            quality: 'MP3 Audio',
            type: 'audio' as const,
            format: 'mp3',
          }] : []),
        ],
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        return createError(ScraperErrorCode.TIMEOUT);
      }
      if (error.response?.status === 429) {
        return createError(ScraperErrorCode.RATE_LIMITED);
      }
    }
    return createError(ScraperErrorCode.API_ERROR, error instanceof Error ? error.message : 'Unknown error');
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
```

### Phase 2: Type Updates

**Files to update:**
- `src/lib/types/index.ts` - Add 'youtube' back to Platform
- `src/core/scrapers/types.ts` - Add 'youtube' back to PlatformId
- `src/lib/supabase.ts` - Add 'youtube' back to Platform type

### Phase 3: Integration

**Files to update:**
- `src/lib/services/index.ts` - Export scrapeYouTube
- `src/app/api/route.ts` - Add YouTube case
- `src/app/api/playground/route.ts` - Add YouTube case
- `src/lib/url/pipeline.ts` - Add YouTube URL patterns
- `src/lib/redis.ts` - Add YouTube cache config

### Phase 4: UI Updates

**Files to update:**
- `src/components/admin/PlatformIcon.tsx` - Add YouTube icon
- `src/hooks/admin/useStats.ts` - Add YouTube color
- `src/app/advanced/page.tsx` - Add YouTube to supported platforms
- `src/i18n/messages/*.json` - Add YouTube translations
- `src/app/globals.css` - Add YouTube CSS variable

### Phase 5: Proxy Updates

**File:** `src/app/api/proxy/route.ts`

Add YouTube CDN domains back:
```typescript
const ALLOWED_PROXY_DOMAINS = [
  // ... existing domains
  // YouTube CDN
  'googlevideo.com', 'ytimg.com', 'ggpht.com',
  'ccproject.serv00.net', // Audio download server
];
```

### Phase 6: Database Migration

```sql
-- Add YouTube back to service_config
INSERT INTO service_config (id, enabled, rate_limit, cache_ttl, maintenance_mode)
VALUES ('youtube', true, 30, 3600, false)
ON CONFLICT (id) DO UPDATE SET enabled = true;
```

## Key Differences from V1

| Aspect | V1 (Failed) | V2 (New) |
|--------|-------------|----------|
| API | InnerTube (direct) | External free API |
| Video Format | MP4 (IP-locked) | HLS m3u8 (streamable) |
| Audio | Separate stream | Direct MP3 download |
| Quality | 360p only | HD (varies) |
| CORS | Blocked | No issues (server-side) |
| Dependencies | @ffmpeg/ffmpeg | None |

## Limitations & Considerations

1. **HLS Format**: Video is m3u8 (streaming), not direct MP4
   - Works great for playback
   - Download requires HLS-to-MP4 conversion (client-side or skip)
   - Alternative: Provide audio-only download as primary option

2. **Third-Party Dependency**: Relies on external API
   - May have rate limits
   - Could go offline
   - No SLA guarantee

3. **Quality**: Video quality depends on external API
   - Usually HD but not guaranteed
   - Audio is always MP3

## Recommended Approach

**Option A: Audio-First (Simpler)**
- Primary: MP3 audio download (direct, works everywhere)
- Secondary: HLS video stream (for preview/playback)
- Skip video download (HLS conversion is complex)

**Option B: Full Support (Complex)**
- Implement HLS-to-MP4 conversion using ffmpeg.wasm
- More complex, larger bundle size
- Better user experience

## Estimated Effort

| Task | Time |
|------|------|
| Core scraper | 1 hour |
| Type updates | 30 min |
| API integration | 1 hour |
| UI updates | 1 hour |
| Testing | 1 hour |
| **Total** | ~4.5 hours |

## Risks

1. **API Stability**: External API may change or go offline
2. **Rate Limiting**: Unknown limits on free API
3. **Legal**: Using third-party YouTube downloader API

## Recommendation

Start with **Option A (Audio-First)** for quick implementation, then evaluate if HLS video download is needed based on user feedback.

---

*Created: December 2024*
*Status: Proposal*
