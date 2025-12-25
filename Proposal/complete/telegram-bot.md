# 📱 Telegram Bot Proposal - XTFetch API

## Overview

Telegram bot untuk XTFetch yang terintegrasi dengan backend existing. User bisa download video langsung dari chat Telegram.

---

<details>
<summary><b>📁 Struktur Folder</b></summary>

```
api-xtfetch/
├── src/
│   ├── bot/                          # Telegram Bot Module
│   │   ├── index.ts                  # Bot entry point & webhook handler
│   │   ├── commands/                 # Command handlers
│   │   │   ├── start.ts              # /start - Welcome & register
│   │   │   ├── help.ts               # /help - Command list
│   │   │   ├── download.ts           # /dl <url> - Download media
│   │   │   ├── status.ts             # /status - Check service status
│   │   │   ├── history.ts            # /history - Download history
│   │   │   ├── settings.ts           # /settings - User preferences
│   │   │   └── admin/                # Admin commands
│   │   │       ├── broadcast.ts      # /broadcast - Send to all users
│   │   │       ├── stats.ts          # /stats - Bot statistics
│   │   │       ├── ban.ts            # /ban - Ban user
│   │   │       └── users.ts          # /users - List users
│   │   ├── handlers/                 # Message handlers
│   │   │   ├── url.ts                # Auto-detect URL in message
│   │   │   └── callback.ts           # Inline button callbacks
│   │   ├── middleware/               # Bot middleware
│   │   │   ├── auth.ts               # User auth & registration
│   │   │   ├── rateLimit.ts          # Rate limiting per user
│   │   │   └── admin.ts              # Admin check
│   │   ├── services/                 # Bot services
│   │   │   ├── userService.ts        # User CRUD
│   │   │   └── notificationService.ts # Send notifications
│   │   ├── keyboards/                # Inline keyboards
│   │   │   └── index.ts              # Reusable keyboards
│   │   └── utils/                    # Bot utilities
│   │       ├── messages.ts           # Message templates
│   │       └── format.ts             # Format helpers
│   └── app/api/
│       └── bot/
│           └── webhook/
│               └── route.ts          # POST /api/bot/webhook
```

</details>

---

<details>
<summary><b>⚙️ Tech Stack</b></summary>

| Component | Choice | Reason |
|-----------|--------|--------|
| Bot Framework | `grammy` | Lightweight, TypeScript-first, webhook support |
| Webhook | Next.js API Route | Reuse existing infra |
| Database | Supabase (existing) | Store users, history |
| Rate Limit | Redis (existing) | Per-user limits |
| Bot Creation | @BotFather | Standard Telegram bot |

</details>

---

<details>
<summary><b>🗄️ Database Schema (Supabase)</b></summary>

### Migration Required

```sql
-- Bot Users (NEW TABLE)
CREATE TABLE bot_users (
  id BIGINT PRIMARY KEY,              -- Telegram user ID
  username TEXT,
  first_name TEXT,
  language_code TEXT DEFAULT 'en',
  is_banned BOOLEAN DEFAULT false,
  is_admin BOOLEAN DEFAULT false,
  
  -- Premium link
  api_key_id UUID REFERENCES api_keys(id),  -- Link to existing api_keys table
  
  -- Free tier tracking
  daily_downloads INT DEFAULT 0,
  last_download_reset TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Bot Download History (NEW TABLE)
CREATE TABLE bot_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES bot_users(id),
  platform TEXT,                      -- 'youtube', 'tiktok', etc
  url TEXT,
  title TEXT,
  status TEXT,                        -- 'success', 'failed'
  is_premium BOOLEAN DEFAULT false,   -- Track if used premium
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_bot_users_api_key ON bot_users(api_key_id);
CREATE INDEX idx_bot_downloads_user ON bot_downloads(user_id);
```

### Existing Table (api_keys) - No Changes
Bot akan reuse table `api_keys` yang sudah ada untuk validasi premium.

</details>

---

<details>
<summary><b>🤖 Commands & Auto-Detection</b></summary>

### How It Works
**Kirim URL langsung → Bot auto-detect platform → Download & send result**

Gak perlu command `/dl`, tinggal paste URL aja!

### User Commands (Minimal)
| Command | Description |
|---------|-------------|
| `/start` | Welcome message, auto-register user |
| `/help` | Show supported platforms |
| `/status` | Check platform status |
| `/history` | Show last 10 downloads |
| `/premium` | Link API key for premium |
| `/mystatus` | Check premium status & expiry |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/stats` | Bot statistics (users, downloads) |
| `/broadcast <msg>` | Send message to all users |
| `/ban <user_id>` | Ban user |
| `/unban <user_id>` | Unban user |
| `/givepremium <user_id> <duration>` | Give premium (7d, 30d, 90d, 365d, lifetime, or custom) |
| `/revokepremium <user_id>` | Revoke premium access |

### Supported URL Patterns (Auto-Detect)
```
youtube.com, youtu.be
instagram.com/p/, instagram.com/reel/
tiktok.com, vm.tiktok.com
twitter.com, x.com
facebook.com, fb.watch
weibo.com
```

</details>

---

<details>
<summary><b>🎨 UI/UX Screens</b></summary>

### `/start` Welcome Screen
```
🎬 Welcome to XTFetch Bot!

Download videos from your favorite platforms instantly.
Just paste any video URL and I'll handle the rest!

✅ Supported: YouTube, Instagram, TikTok, Twitter, Facebook, Weibo

━━━━━━━━━━━━━━━━━━━━━━
📊 Your Stats: 0 downloads today (10 remaining)
━━━━━━━━━━━━━━━━━━━━━━

[📥 How to Use]  [📊 Status]
[📜 History]     [❓ Help]
```

### Processing (Auto-Delete on Success)
```
⏳ Processing your request...

🔗 Platform: Instagram
📎 URL: instagram.com/reel/xxx...

Please wait...
```
> ⚠️ Message ini **auto-delete** ketika media berhasil dikirim!

### Download Success
```
✅ Download Ready!

📹 Title: Video Title Here
👤 Author: @username
⏱️ Duration: 0:45
📦 Size: 12.5 MB

[🔊 Audio Only]  [📤 Share]

━━━━━━━━━━━━━━━━━━━━━━
📊 9 downloads remaining today
```
> Media dikirim langsung sebagai file/video

### Download Failed (Edit Processing Message)
```
❌ Download Failed

Platform: TikTok
Error: Video is private or unavailable

💡 Tips:
• Make sure the video is public
• Check if the URL is correct
• Try again in a few seconds

[🔄 Try Again]  [📊 Status]
```

### Rate Limit Reached
```
⚠️ Daily Limit Reached!

You've used all 10 free downloads today.
Limit resets in: 5h 23m

💡 Want unlimited downloads?
Visit downaria.vercel.app for more options!

[🌐 Visit Website]  [📊 My Stats]
```

</details>

---

<details>
<summary><b>🚦 Rate Limiting & Premium</b></summary>

### User Tiers

| Tier | Daily Limit | Cooldown | Features |
|------|-------------|----------|----------|
| Free | 10/day | 30s | Basic download |
| Premium | Unlimited | No cooldown | HD, Audio extract, Priority |

### Premium Flow

**Option 1: Buy Premium (New User)**
```
User: /premium
      ↓
Bot: "👑 Upgrade to Premium!

     ✅ Unlimited downloads
     ✅ No cooldown
     ✅ HD quality
     ✅ Audio extraction
     
     [💬 Contact Admin]  [🔑 I Have API Key]"
      ↓
[Contact Admin] → Opens chat with @risunCode (or admin username)
      ↓
Admin manually creates API key & sends to user
      ↓
User: /premium → [🔑 I Have API Key]
      ↓
Bot: "Enter your API key:"
      ↓
User: xtf_abc123...
      ↓
[Validate key] → Link to Telegram ID
      ↓
Bot: "✅ Premium activated! Valid until: 2025-02-01"
```

**Option 2: Already Has Key**
```
User: /premium → [🔑 I Have API Key]
      ↓
Bot: "Enter your API key:"
      ↓
User: xtf_abc123...
      ↓
[Validate] → Success!
```

### Premium Commands
| Command | Description |
|---------|-------------|
| `/premium` | Show premium options / link API key |
| `/mystatus` | Check premium status & expiry |
| `/unlink` | Remove API key link |

### Premium Screen
```
👑 Get Premium Access!

Enjoy unlimited downloads with no restrictions.

✅ Unlimited downloads/day
✅ No cooldown between requests  
✅ HD video quality
✅ Audio extraction
✅ Priority processing

━━━━━━━━━━━━━━━━━━━━━━

[💬 Contact Admin]  [🔑 I Have API Key]
```

### Premium Status Message
```
👑 Premium Status

API Key: xtf_abc1••••••
Status: ✅ Active
Expires: February 1, 2025 (37 days left)
Downloads today: 45 (Unlimited)

[🔓 Unlink Key]  [🔄 Refresh]
```

</details>

---

<details>
<summary><b>🔔 Notifications</b></summary>

- Download complete → Send file/link
- Download failed → Error message with reason
- Daily limit reached → Warning message
- Maintenance → Broadcast to all users
- New feature → Broadcast announcement

</details>

---

<details>
<summary><b>📝 Environment Variables</b></summary>

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_WEBHOOK_SECRET=random_secret_string
TELEGRAM_ADMIN_IDS=123456789,987654321

# Webhook URL (auto-set based on deployment)
# Railway: https://your-app.up.railway.app/api/bot/webhook
```

</details>

---

<details>
<summary><b>🔄 Flow Diagram</b></summary>

```
User sends URL
      ↓
[Webhook /api/bot/webhook]
      ↓
[Auth Middleware] → Check banned? → ❌ Reject
      ↓ ✅
[Rate Limit] → Exceeded? → ❌ "Limit reached"
      ↓ ✅
[Send "⏳ Processing..." message] ← Save message_id
      ↓
[URL Handler] → Detect platform
      ↓
[Call existing scraper] → /api/v1/publicservices
      ↓
Success? ─────────────────────────────┐
   ↓ ✅                               ↓ ❌
[DELETE processing message]    [EDIT to error message]
   ↓                                  ↓
[Send media file directly]     [Show retry button]
   ↓
[Save to history]
```

</details>

---

<details>
<summary><b>📦 Dependencies</b></summary>

```json
{
  "grammy": "^1.21.1"
}
```

Cuma 1 dependency baru, sisanya reuse existing (Supabase, Redis).

</details>

---

<details>
<summary><b>🚀 Setup Steps</b></summary>

1. Create bot via @BotFather → Get token
2. Add env vars to backend
3. Deploy → Webhook auto-register
4. Set commands via BotFather:
   ```
   start - Start the bot
   help - Show commands
   dl - Download video
   status - Check status
   history - Download history
   settings - Preferences
   ```

</details>

---

## Summary

- **Folder**: `src/bot/` di backend
- **Framework**: grammy (lightweight)
- **Reuse**: Existing scrapers, Supabase, Redis
- **Features**: Download, history, rate limit, admin commands, broadcast
