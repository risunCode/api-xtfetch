# Bot Fixes - December 2025

## Completed Fixes ✅

### 1. Bot Username Branding
**Status:** ✅ NOT NEEDED - Already correct `@downariaxt_bot`

---

### 2. /mystatus Remove Refresh Button
**Status:** ✅ DONE
**File:** `src/bot/commands/mystatus.ts`
**Fix:** Removed refresh keyboard, simplified VIP status display

---

### 3. Drop /history Command
**Status:** ✅ DONE
**Files:** 
- `src/bot/handlers/callback.ts` - Returns "not available" message
- `src/bot/keyboards/index.ts` - Removed from menu keyboard
**Fix:** History disabled, shows message to use website

---

### 4. /menu Donate Button Missing Keyboard
**Status:** ✅ DONE
**File:** `src/bot/handlers/callback.ts`
**Fix:** Added DONATE keyboard to donate callback

---

### 5. YouTube Filesize Display
**Status:** ✅ DONE
**Files:**
- `src/bot/keyboards/legacy.ts` - Hide filesize from buttons
- `src/bot/handlers/url.ts` - Use `select_quality_youtube` with warning
- `src/bot/i18n/index.ts` - Added YouTube-specific translation
**Fix:** 
- Buttons show only quality (🎬 HD, 📹 SD, 🎵 Audio)
- Caption shows warning: "⚠️ File sizes are estimates. Final size may differ after merge."

---

### 6. /donate Cancel Button Fix
**Status:** ✅ DONE
**File:** `src/bot/commands/donate.ts`
**Fix:** Changed cancel callback from `cmd:donate` to `donate_cancel_input` which deletes the message

---

### 7. /menu Greeting & Shorter Separator
**Status:** ✅ DONE
**File:** `src/bot/commands/menu.ts`
**Fix:**
- Added time-based greeting (Selamat pagi/siang/sore/malam)
- Shows username in greeting
- Shorter separator (────────────────────)
- Removed history button from keyboard

---

### 8. /mystatus VIP Status Display
**Status:** ✅ DONE
**File:** `src/bot/commands/mystatus.ts`
**Fix:**
- Status: ✅ Active (no warning icon for active VIP)
- Expires: datetime (days left) - warning only if expired

---

## Frontend Fixes ✅

### 9. YouTube Preview Warning
**Status:** ✅ DONE
**File:** `DownAria/src/lib/utils/media.ts`
**Fix:** Updated message to "🔇 Preview tanpa suara - dapat diputar setelah download"

### 10. Audio Support in DownloadPreview
**Status:** ✅ ALREADY SUPPORTED
**Files:**
- `DownAria/src/components/media/FormatSelector.tsx` - Already shows audio formats
- `DownAria/src/components/media/MediaGallery.tsx` - Already has audio player

**Note:** Audio formats are displayed if backend returns them. If audio is missing, check backend scraper response.

---

## Summary

All requested fixes have been implemented:
- Bot: donate cancel, menu greeting, mystatus display, YouTube warnings
- Frontend: YouTube preview notice updated, audio already supported

Build verified: Both `api-xtfetch` and `DownAria` compile successfully.
