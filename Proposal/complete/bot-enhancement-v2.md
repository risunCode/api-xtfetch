# Telegram Bot Enhancement v2

## Overview

Perbaikan bug dan enhancement UX untuk Telegram Bot DownAria (@downariaxt_bot).

---

## Preview: Before vs After

### Single Media Download

**BEFORE:**
```
┌─────────────────────────────────────┐
│ User                                │
│ https://instagram.com/p/ABC123      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Bot                                 │
│ 📸 Processing Instagram link...    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Bot                                 │
│ [VIDEO THUMBNAIL]                   │
│                                     │
│ ✅ Download Ready!                  │
│                                     │
│ 📹 Title: Amazing sunset video...  │
│ 👤 Author: @traveler                │
│ ⏱️ Duration: 0:45                   │
│ 📦 Size: 12.5 MB                    │
│                                     │
│ [🔊 Audio Only]  [📤 Share]         │
│                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ 📊 9 downloads remaining today      │
│ 📸 via @DownAriaBot                 │
└─────────────────────────────────────┘
```

**AFTER:**
```
┌─────────────────────────────────────┐
│ Bot                                 │
│ [VIDEO - plays inline]              │
│                                     │
│ @traveler                           │
│ Amazing sunset video...             │
│                                     │
│ [Origin URL]                        │
└─────────────────────────────────────┘
```

- User message: **DELETED**
- Processing message: **DELETED**
- Caption: minimal (author + title 20 chars)
- Buttons: hanya Origin URL

---

### Large File (>40MB)

**AFTER:**
```
┌─────────────────────────────────────┐
│ Bot                                 │
│ [VIDEO SD QUALITY]                  │
│                                     │
│ @creator                            │
│ 4K Drone Footage of...              │
│                                     │
│ [HD Quality]  [Origin URL]          │
└─────────────────────────────────────┘
```

- Video SD dikirim langsung
- Button "HD Quality" → direct link ke file HD

---

### Carousel/Multi-Media (Instagram, Twitter)

**AFTER:**
```
┌─────────────────────────────────────┐
│ Bot                                 │
│ [PHOTO 1] [PHOTO 2] [PHOTO 3]       │
│ ← swipe →                           │
│                                     │
│ @photographer                       │
│ Beach vacation pics...              │
│                                     │
│ [Origin URL]                        │
└─────────────────────────────────────┘
```

- Telegram media group (max 10 items)
- Caption hanya di foto pertama

---
 
---
 
---
 

---

## Bug Fixes

### 1. Rate Limit Field Mismatch

**Problem:** Code pakai `downloads_reset_at`, database pakai `last_download_reset`

**Fix:**
```typescript
// types.ts
interface BotUser {
    last_download_reset?: string;  // ← ganti dari downloads_reset_at
}
```

### 2. Premium Check Incomplete

**Problem:** Hanya cek `api_key_id` exists, tidak cek expiry

**Fix:**
```typescript
ctx.isPremium = !!user.api_key_id && 
    (!user.premium_expires_at || new Date(user.premium_expires_at) > new Date());
```

### 3. Download Count Not Incrementing

**Fix:** Add logging, verify SQL update works

---

## New Features

### 1. Carousel Support
- `sendMediaGroup` untuk multi-media posts
- Max 10 items per group
- Caption hanya di item pertama

### 2. Large File Handling (>40MB)
- Kirim SD quality + HD button
- Threshold: 40MB
- Fallback: direct link jika tidak ada SD

### 3. Clean Chat
- Delete user's link message setelah media dikirim
- Delete processing message
- Hasil: chat bersih, hanya ada media

### 4. Minimal Caption
```
@author
Title (max 20 chars)...

[HD Quality]  [Origin URL]
```

---

## Message Templates

```typescript
const BOT_MESSAGES = {
    PROCESSING: 'Processing...',
    ERROR_GENERIC: 'Download failed.',
    ERROR_UNSUPPORTED: 'Unsupported link.',
    ERROR_RATE_LIMIT: 'Wait {seconds}s.',
    ERROR_LIMIT_REACHED: 'Limit reached ({limit}/{hours}h). Resets in {reset}.',
    ERROR_BANNED: 'Account suspended.',
    WELCOME: 'DownAria Bot\n\nPaste any video link.\n\nSupported: YouTube, Instagram, TikTok, X, Facebook, Weibo',
};
```

---

## Flow Diagram

```
User sends link
      │
      ▼
┌─────────────────┐
│ Auth Middleware │ → Banned? → "Account suspended."
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Rate Limit      │ → Exceeded? → "Limit reached..."
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Send            │
│ "Processing..." │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Call Scraper    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
 Success    Failed
    │         │
    ▼         ▼
┌─────────┐  ┌─────────────┐
│ Check   │  │ Edit to     │
│ filesize│  │ error msg   │
└────┬────┘  └─────────────┘
     │
     ├─── <40MB ──→ Send media directly
     │
     └─── >40MB ──→ Send SD + [HD Quality] button
                    │
                    ▼
              ┌─────────────┐
              │ Delete:     │
              │ - User msg  │
              │ - Processing│
              └─────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `types.ts` | Fix BotUser fields, update BOT_MESSAGES |
| `middleware/rateLimit.ts` | Fix field name, add logging |
| `middleware/auth.ts` | Fix premium expiry check |
| `handlers/url.ts` | Carousel, large file, delete messages |
| `utils/messages.ts` | New caption builder |

---

## Implementation Checklist

### Phase 1: Bug Fixes
- [ ] Fix `last_download_reset` field name
- [ ] Fix premium expiry check
- [ ] Add rate limit logging

### Phase 2: UI Cleanup
- [ ] Update all BOT_MESSAGES
- [ ] Remove emojis
- [ ] Shorten captions

### Phase 3: Features
- [ ] Carousel support (sendMediaGroup)
- [ ] Large file handling (40MB threshold)
- [ ] Delete user message after success
- [ ] Delete processing message

---

## Notes

- Telegram limits: 50MB upload, 10 items per media group, 1024 char caption
- HD button hanya muncul jika file >40MB
- Origin URL button selalu muncul
- No emoji in captions/buttons
