# 🤖 DownAria Bot Command Reference

**Bot:** @downariaxt_bot  
**Updated:** December 26, 2024

---

## 📱 User Commands

```
start - Start the bot, show welcome message
menu - Show main menu with buttons
donate - Show donation info & link API key
mystatus - Check download stats & donator status
history - View recent download history
privacy - Show privacy policy
status - Check platform status
help - Show usage guide and supported platforms
```

---

## 👑 Admin Commands

```
stats - Show bot statistics (users, downloads)
broadcast- Send message to all users <msg> 
ban - Ban a user from using the bot <user_id> 
unban - Unban a user <user_id> 
givevip - Give VIP access to user <user_id> <duration> 
revokevip - Revoke VIP access from user <user_id> 
maintenance - Toggle maintenance mode on/off
```

### VIP Duration Options

```
7d - 7 days (1 week)
30d - 30 days (1 month)
90d - 90 days (3 months)
365d - 365 days (1 year)
lifetime - Forever
45 or 45d - Custom days
```

---

## 🔄 Callback Actions

### User Callbacks
```
cmd:start - Trigger /start
cmd:help - Trigger /help
cmd:mystatus - Trigger /mystatus
cmd:history - Trigger /history
cmd:donate - Trigger /donate
donate_contact - Show admin contact for donation
donate_enter_key - Enter API key prompt
donate_unlink - Unlink API key
donate_refresh - Refresh donator status
```

### Admin Callbacks
```
gv_give_{userId}_{days} - Give VIP via button
gv_preset_{days} - VIP duration preset
```

---

## 📊 Rate Limits

```
Free Tier:
- 8 downloads/day
- 4 seconds cooldown
- 1 URL only per message

Donator Tier:
- Based on API key limit
- No cooldown
- Max 5 URLs per message

Daily reset: 00:00 WIB (UTC+7)
```

---

## 🌐 Supported Platforms

```
Facebook - Videos, Reels, Stories
Instagram - Posts, Reels, Stories
Twitter/X - Tweets, Videos
TikTok - Videos, Slideshows
YouTube - Videos (proxy required)
Weibo - Videos, Images
```

---

## 🔧 Environment Variables

```env
# Required
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
TELEGRAM_ADMIN_IDS=123456789,987654321
TELEGRAM_WEBHOOK_SECRET=your-random-secret

# Optional
TELEGRAM_BOT_USERNAME=downariaxt_bot
TELEGRAM_ADMIN_USERNAME=risunCode
```

---

## 📁 Bot Structure

```
src/bot/
├── index.ts              # Bot instance & exports
├── config.ts             # Configuration
├── types.ts              # Type definitions
├── commands/
│   ├── index.ts          # User commands barrel
│   ├── start.ts          # /start
│   ├── help.ts           # /help
│   ├── mystatus.ts       # /mystatus
│   ├── history.ts        # /history
│   ├── donate.ts         # /donate
│   └── admin/
│       ├── index.ts      # Admin commands barrel
│       ├── stats.ts      # /stats
│       ├── broadcast.ts  # /broadcast
│       ├── ban.ts        # /ban, /unban
│       ├── givevip.ts    # /givevip, /revokevip
│       └── maintenance.ts # /maintenance
├── handlers/
│   ├── url.ts            # URL processing
│   └── callback.ts       # Callback queries
├── middleware/
│   ├── auth.ts           # User authentication
│   ├── rateLimit.ts      # Rate limiting
│   └── maintenance.ts    # Maintenance mode
├── keyboards/
│   └── index.ts          # Inline keyboards
├── services/
│   └── userService.ts    # User database operations
└── utils/
    └── logger.ts         # Logging utilities
```

---

## 🔄 Recent Changes (Dec 2024)

### Renamed Commands
```
/premium → /donate
/givepremium → /givevip
/revokepremium → /revokevip
```

### Rate Limit Changes
```
10 downloads / 6 hours → 8 downloads / day
5s cooldown → 4s cooldown
Rolling window → Daily reset at 00:00 WIB
```

### New Features
- Multi-URL support for donators (max 5)
- Smart proxy for cookie-required content
- Fallback thumbnail when video too large
- Rate limit protection on API key validation
