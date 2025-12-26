# DownAria Bot Enhancement Proposal

**Bot:** @downariaxt_bot  
**Framework:** grammY  
**Date:** December 26, 2024

---

## 🚨 Critical Bugs to Fix

### 1. Maintenance Mode Bypass (SECURITY)

Bot bypasses frontend's global maintenance mode - users can download via bot even when site is "under maintenance".

**Current:** Bot calls scrapers directly, no maintenance check  
**Fix:** Check Redis `global:maintenance` flag before processing downloads

```typescript
// Add to bot middleware
const isMaintenanceMode = await redis.get('global:maintenance');
if (isMaintenanceMode && !ctx.isAdmin) {
    await ctx.reply('🚧 Service under maintenance.');
    return;
}
```

---

### 2. Quality Buttons Useless (Non-YouTube)

**Current Behavior:**
- Bot auto-sends HD quality immediately
- HD button = irrelevant (already sent)
- SD/Audio buttons = expired (session cleared after send)
- User gets: "⏰ Session expired. Please send URL again."

**New Smart Logic:**
```
IF HD ≤ 40MB → Send HD, buttons: [🔗 Original ↗]
IF HD > 40MB → Send SD, buttons: [🎬 HD ↗ (link)] [🔗 Original ↗]
```

**Result:**
- No confusing expired buttons
- HD accessible via external link when too large
- Clean UX

---

### 3. Keyboard Duplication Everywhere

**Current Mess:**
- `keyboards/index.ts` has 20+ functions
- Many unused: `helpKeyboard()`, `statsKeyboard()`, `settingsKeyboard()`, `languageKeyboard()`, `adminKeyboard()`
- Commands build keyboards inline (duplicating logic)
- No consistent naming

**Solution - Grouped Keyboard System:**

```typescript
// keyboards/index.ts - SIMPLIFIED

export const MENU = {
    main: () => kb()
        .text('📊 Status', 'cmd:mystatus').text('📜 History', 'cmd:history').row()
        .text('💎 Premium', 'cmd:premium').text('❓ Help', 'cmd:help').row()
        .url('🌐 Web', 'https://downaria.vercel.app'),
};

export const DOWNLOAD = {
    success: (url: string) => kb().url('🔗 Original', url),
    fallback: (hdUrl: string, url: string) => kb().url('🎬 HD', hdUrl).url('🔗 Original', url),
    youtube: (url: string, vid: string, q: Qualities) => { /* quality buttons */ },
    error: (url: string) => kb().text('🔄 Retry', `retry:${url.slice(0,50)}`),
};

export const PREMIUM = {
    info: () => kb().text('🛒 Buy', 'premium_contact').row().text('🔑 I Have Key', 'premium_enter_key'),
    status: () => kb().text('🔓 Unlink', 'premium_unlink').text('🔄 Refresh', 'mystatus_refresh'),
};

export const NAV = {
    backToMenu: () => kb().text('« Menu', 'cmd:menu'),
};
```

**Usage:**
```typescript
await ctx.reply(msg, { reply_markup: MENU.main() });
await ctx.reply(msg, { reply_markup: DOWNLOAD.success(url) });
```

---

## 📱 Commands Reference

### User Commands

| Command | Description | Buttons |
|---------|-------------|---------|
| `/start` | Welcome message | Menu, Help, Status, Premium, Website |
| `/menu` | Main menu | Status, History, Premium, Privacy, Website, Help |
| `/help` | Usage guide | Menu, Premium, Website |
| `/mystatus` | Download stats | Get Premium / Unlink, Refresh |
| `/history` | Recent downloads | Refresh |
| `/premium` | Premium info | Buy, I Have Key |
| `/privacy` | Privacy policy | Website, Menu |
| `/status` | Platform status | Refresh |

### Admin Commands

| Command | Description |
|---------|-------------|
| `/stats` | Bot statistics (users, downloads, platform breakdown) |
| `/broadcast <msg>` | Send to all users |
| `/ban <id>` | Ban user |
| `/unban <id>` | Unban user |
| `/givepremium <id> <duration>` | Grant premium (7d/30d/90d/365d/lifetime) |
| `/maintenance on/off` | Broadcast maintenance notice |

---

## 📥 Download Flow

### Non-YouTube (Smart Quality)

```
User sends URL
    ↓
Bot: "⏳ Processing Instagram..."
    ↓
Scraper returns HD (15MB) and SD (8MB)
    ↓
HD ≤ 40MB? 
    YES → Send HD video
          Buttons: [🔗 Original ↗]
    
    NO  → Send SD video
          Caption: "⚠️ HD exceeds 40MB limit"
          Buttons: [🎬 HD ↗] [🔗 Original ↗]
```

### YouTube (Preview First)

```
User sends URL
    ↓
Bot: "⏳ Processing YouTube..."
    ↓
Bot sends THUMBNAIL with quality buttons:
    [🎬 HD (1080p) 45MB] [📹 SD (480p) 15MB] [🎵 Audio 5MB]
    [🔗 Original ↗] [❌ Cancel]
    ↓
User clicks quality
    ↓
Preview message DELETED (all buttons disappear)
    ↓
Bot sends video/audio with only:
    [🔗 Original ↗]
```

### Photo Album

```
User sends URL
    ↓
Bot sends up to 10 photos as media group
First photo has caption
    ↓
Buttons: [🔗 Original ↗]
```

---

## 🎹 Callback Naming Convention

```
Pattern: {domain}:{action}:{payload?}

Navigation:
  cmd:menu, cmd:mystatus, cmd:history, cmd:premium, cmd:help, cmd:privacy

Download:
  dl:hd:{visitorId}, dl:sd:{visitorId}, dl:audio:{visitorId}, dl:cancel:{visitorId}
  retry:{url}

Premium:
  premium_contact, premium_enter_key, premium_unlink, premium_unlink_confirm

Refresh:
  mystatus_refresh, history_refresh, history_page:{n}

Admin:
  admin_confirm:{action}, report_cookie:{platform}
```

---

## 📊 Rate Limits

| Tier | Downloads | Period | Cooldown |
|------|-----------|--------|----------|
| Free | 10 | 6 hours | 5 seconds |
| Premium | Unlimited | - | None |

---

## 🌐 Supported Platforms

| Platform | Content Types |
|----------|---------------|
| YouTube | Videos, Shorts |
| Instagram | Posts, Reels, Stories |
| TikTok | Videos |
| Twitter/X | Videos, Images |
| Facebook | Videos, Reels |
| Weibo | Videos, Images |

---

## 🌍 i18n

Auto-detected from Telegram `language_code`:
- 🇺🇸 English (default)
- 🇮🇩 Bahasa Indonesia

---

## ✅ Implementation Checklist

### Critical (Do First)
- [ ] Fix maintenance mode bypass
- [ ] Implement smart quality logic (40MB threshold)
- [ ] Simplify keyboards to grouped system

### Nice to Have
- [ ] `/settings` - User preferences
- [ ] `/feedback` - Send feedback
- [ ] Better error messages
- [ ] Progress indicator for large downloads
- [ ] Redis-backed sessions
