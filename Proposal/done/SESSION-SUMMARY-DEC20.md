# Session Summary - December 20, 2024

## Overview
Session ini fokus pada 2 fitur utama: **YouTube Implementation v2** dan **AI Chat Feature**.

---

## 1. YouTube Implementation v2 (External API)

### API Used
```
Base: https://yt-manager-dl-cc.vercel.app/api/
- Video: /video?url={youtube_url} → Returns HLS m3u8 stream
- Audio: /audio?url={youtube_url} → Returns direct MP3
- Search: /search?title={query} → Search videos
```

### Files Created
| File | Purpose |
|------|---------|
| `src/lib/services/youtube.ts` | YouTube scraper using external API |
| `src/lib/utils/hls-downloader.ts` | HLS to MP4 client-side converter |
| `migration/sql-11-add-youtube-v2.sql` | Database migration for YouTube config |

### Files Modified
| File | Changes |
|------|---------|
| `src/lib/types/index.ts` | Added 'youtube' to Platform type, PLATFORMS array |
| `src/core/scrapers/types.ts` | Added 'youtube' to PlatformId |
| `src/lib/services/helper/api-config.ts` | Added YouTube aliases |
| `src/lib/url/pipeline.ts` | Added YouTube URL patterns & content ID extractors |
| `src/lib/redis.ts` | Added YouTube cache config |
| `src/lib/utils/security.ts` | Added YouTube domains to ALLOWED_DOMAINS |
| `src/core/config/index.ts` | Added YouTube to ALLOWED_SOCIAL_DOMAINS |
| `src/app/api/route.ts` | Added YouTube case, skipCache support |
| `src/app/api/playground/route.ts` | Added YouTube case |
| `src/app/api/proxy/route.ts` | Added YouTube CDN domains |
| `src/components/DownloadPreview.tsx` | HLS download integration, filename fix |
| `src/app/page.tsx` | Added skipCache to API request |

### Features
- ✅ Video download (HLS → MP4 conversion)
- ✅ Audio download (direct MP3)
- ✅ Estimated file size from duration
- ✅ Proper filename format: `YT_Title_Quality_[XTFetch].ext`
- ✅ Skip cache setting support
- ✅ Client-side segment concatenation (no FFmpeg needed)

### HLS Download Flow
```
1. User clicks download on HLS format
2. DownloadPreview detects isHLS flag
3. Calls downloadHLSAsMP4() from hls-downloader.ts
4. Fetches m3u8 playlist via proxy
5. Downloads all .ts segments in batches
6. Concatenates into single Uint8Array
7. Creates Blob with video/mp4 MIME type
8. Triggers browser download
```

### Known Limitations
- Video loads into browser memory (suitable for <15 min videos)
- Longer videos may cause memory issues on low-end devices
- HLS quality is whatever the API provides (no quality selection)

---

## 2. AI Chat Feature (GPT-4 Turbo)

### API Used
```
GET https://hutchingd-freegptsir.hf.space/api/ask?q={message}
Response: { reply: "..." }
```

### Files Created
| File | Purpose |
|------|---------|
| `src/lib/services/gpt.ts` | GPT API wrapper |
| `src/components/chat/ChatContainer.tsx` | Main chat UI |
| `src/components/chat/ChatMessage.tsx` | Message bubble with markdown |
| `src/components/chat/ChatInput.tsx` | Input field + send button |
| `src/components/chat/index.ts` | Barrel export |

### Files Modified
| File | Changes |
|------|---------|
| `src/app/advanced/page.tsx` | Added AI Chat tab |
| `package.json` | Added react-markdown, remark-gfm |

### Features
- ✅ Chat interface with user/bot bubbles
- ✅ Full markdown support (react-markdown + remark-gfm)
- ✅ Code blocks with syntax highlighting + copy button
- ✅ Tables, bold, italic, lists, headers
- ✅ Typing indicator (bouncing dots)
- ✅ Clear chat button
- ✅ Warning: "Chat tidak disimpan"
- ✅ Info: GPT-4 Turbo, Knowledge Nov 2023, Updated Jun 2024
- ✅ Disclaimer: AI tidak akurat, validasi data

### No Persistence
Chat state is in-memory only. Refreshing page clears all messages (by design).

---

## 3. Bug Fixes

### Skip Cache Setting
- **Issue**: YouTube (and other platforms) didn't respect global skipCache setting
- **Fix**: 
  - Frontend sends `skipCache` from localStorage to API
  - API route accepts and passes to all scrapers
  - Cache check skipped when `skipCache=true`

### Filename Format
- **Issue**: `[XT-Fetch]` was after extension (`.m3u8[XT-Fetch]`)
- **Fix**: Changed to `_[XTFetch].ext` format in DownloadPreview.tsx

---

## 4. Dependencies Added
```json
{
  "react-markdown": "^9.x",
  "remark-gfm": "^4.x"
}
```

---

## 5. Database Migration Required

Run this SQL in Supabase:
```sql
-- migration/sql-11-add-youtube-v2.sql
INSERT INTO service_config (id, enabled, rate_limit, cache_time, maintenance_mode, maintenance_message)
VALUES ('youtube', true, 10, 3600, false, 'YouTube service is temporarily unavailable.')
ON CONFLICT (id) DO UPDATE SET 
  enabled = true,
  rate_limit = COALESCE(service_config.rate_limit, 10),
  cache_time = COALESCE(service_config.cache_time, 3600);
```

---

## 6. Pre-Deploy Checklist

### Must Do
- [ ] Run database migration (sql-11-add-youtube-v2.sql)
- [ ] Test YouTube download on production
- [ ] Test AI Chat on production
- [ ] Verify skipCache setting works

### Optional
- [ ] Add YouTube to admin services UI (if not auto-detected)
- [ ] Monitor memory usage for long YouTube videos
- [ ] Add rate limiting for AI Chat if needed

---

## 7. File Tree Summary

```
src/
├── lib/
│   ├── services/
│   │   ├── youtube.ts          # NEW - YouTube scraper
│   │   └── gpt.ts              # NEW - GPT API wrapper
│   └── utils/
│       └── hls-downloader.ts   # NEW - HLS to MP4 converter
├── components/
│   └── chat/                   # NEW - AI Chat components
│       ├── ChatContainer.tsx
│       ├── ChatMessage.tsx
│       ├── ChatInput.tsx
│       └── index.ts
├── app/
│   ├── api/
│   │   └── route.ts            # MODIFIED - YouTube + skipCache
│   └── advanced/
│       └── page.tsx            # MODIFIED - AI Chat tab
└── ...

migration/
└── sql-11-add-youtube-v2.sql   # NEW - YouTube DB config
```

---

## 8. Testing Notes

### YouTube
```
Test URLs:
- https://www.youtube.com/watch?v=dQw4w9WgXcQ
- https://youtu.be/dQw4w9WgXcQ
- https://music.youtube.com/watch?v=xxx
- https://www.youtube.com/shorts/xxx
```

### AI Chat
```
Test prompts:
- "Buatin markdown table"
- "Tulis kode JavaScript hello world"
- "Apa itu React?"
```

---

## 9. Rollback Plan

If issues occur:
1. **YouTube**: Set `enabled = false` in service_config for 'youtube'
2. **AI Chat**: Remove tab from advanced/page.tsx (comment out)
3. **Dependencies**: `npm uninstall react-markdown remark-gfm`

---

*Session completed: December 20, 2024*
