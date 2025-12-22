# Enhancement Proposal: Batch Queue, Webhook Alerts & Cookie Health

> **Goal**: Enhance batch download queue, add error alerts via Discord webhook, dan auto-check cookie health.

---

## 📦 1. Batch Download Queue Enhancement

### Current State
`BatchQueue.tsx` sudah ada basic functionality:
- Add URLs to queue
- Process sequentially
- Show status per item

### Problems
- ❌ No progress indicator per item
- ❌ No retry failed items
- ❌ No pause/resume
- ❌ Results lost on page refresh
- ❌ No bulk add (paste multiple URLs)

### Proposed Enhancements

```
┌─────────────────────────────────────────────────────────────────┐
│  BATCH QUEUE v2                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📋 Paste multiple URLs (one per line)                   │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ https://fb.watch/xxx                                │ │   │
│  │ │ https://instagram.com/reel/xxx                      │ │   │
│  │ │ https://twitter.com/user/status/xxx                 │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  │                                    [Add All] [Clear]    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Queue: 5 items │ ✅ 2 done │ ⏳ 1 processing │ ❌ 1 failed    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. fb.watch/xxx          [FB]  ✅ Done    [Download]    │   │
│  │ 2. instagram.com/reel/x  [IG]  ✅ Done    [Download]    │   │
│  │ 3. twitter.com/status/x  [TW]  ⏳ 45%     [━━━━━░░░░░]  │   │
│  │ 4. tiktok.com/@user/vid  [TT]  ⏸️ Pending              │   │
│  │ 5. weibo.com/xxx         [WB]  ❌ Failed  [Retry]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [⏸️ Pause] [▶️ Resume] [🔄 Retry Failed] [💾 Export Results]  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Features to Add

| Feature | Description |
|---------|-------------| 
| **Progress Bar** | Per-item progress (scraping → downloading) |
| **Retry Failed** | Button untuk retry semua failed items | 
| **Persist Queue** | Save queue to IndexedDB, restore on refresh |
| **Export Results** | Download semua results sebagai JSON/ZIP |
| **Concurrent Processing** | Process 2-3 items simultaneously (configurable) |

### Implementation

```typescript
// Enhanced queue item
interface QueueItemV2 {
    id: string;
    url: string;
    platform: PlatformId;
    status: 'pending' | 'scraping' | 'downloading' | 'completed' | 'failed';
    progress: number; // 0-100
    result?: ScraperResult;
    error?: string;
    retryCount: number;
    addedAt: number;
    completedAt?: number;
}

// Queue state
interface BatchQueueState {
    items: QueueItemV2[];
    isProcessing: boolean;
    isPaused: boolean;
    concurrency: number; // 1-3
    currentIndex: number;
}

// Persist to IndexedDB
const QUEUE_STORE = 'batch_queue';
```

---

## 🔔 2. Discord Webhook Error Alerts (Admin)

### Current State
Discord webhook sudah ada untuk **user-side** download notifications.
Belum ada **admin-side** alerts untuk errors.

### Proposed: Admin Error Alerts

```
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN DISCORD ALERTS                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Webhook URL: [https://discord.com/api/webhooks/xxx/yyy    ]   │
│                                                                 │
│  Alert Types:                                                   │
│  ☑️ Error Spike (>10 errors in 5 min)                          │
│  ☑️ Cookie Pool Low (<2 healthy cookies per platform)          │
│  ☑️ Platform Down (5 consecutive failures)                     │
│  ☐ Daily Summary (disabled by default)                         │
│                                                                 │
│  Cooldown: [15] minutes (prevent spam)                         │
│                                                                 │
│  [Test Webhook] [Save]                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Alert Types

#### 1. Error Spike Alert
```
🚨 ERROR SPIKE DETECTED

Platform: Facebook
Errors: 15 in last 5 minutes
Error Rate: 75%
Common Error: "Rate limited"

Recent Errors:
• 14:32 - Rate limited (cookie #3)
• 14:31 - Rate limited (cookie #2)
• 14:30 - Session expired (cookie #1)
```

#### 2. Cookie Pool Low Alert
```
⚠️ COOKIE POOL LOW

Platform: Instagram
Healthy: 1/5 cookies
Cooldown: 2 cookies
Expired: 2 cookies

Action Required: Add more cookies or wait for cooldown
```

#### 3. Platform Down Alert
```
🔴 PLATFORM DOWN

Platform: Twitter
Status: 5 consecutive failures
Last Error: "API returned 503"
Since: 14:25

Auto-recovery will be attempted in 10 minutes
```

### Database Schema

```sql
-- Add to global_settings or create new table
CREATE TABLE admin_alerts_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_url TEXT,
    enabled BOOLEAN DEFAULT true,
    
    -- Alert toggles
    alert_error_spike BOOLEAN DEFAULT true,
    alert_cookie_low BOOLEAN DEFAULT true,
    alert_platform_down BOOLEAN DEFAULT true,
    alert_daily_summary BOOLEAN DEFAULT false,
    
    -- Thresholds
    error_spike_threshold INT DEFAULT 10,      -- errors in window
    error_spike_window INT DEFAULT 5,          -- minutes
    cookie_low_threshold INT DEFAULT 2,        -- healthy cookies
    platform_down_threshold INT DEFAULT 5,     -- consecutive failures
    
    -- Cooldown (prevent spam)
    cooldown_minutes INT DEFAULT 15,
    last_alert_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Implementation

```typescript
// src/lib/integrations/admin-alerts.ts

interface AlertConfig {
    webhookUrl: string;
    enabled: boolean;
    errorSpikeThreshold: number;
    errorSpikeWindow: number;
    cookieLowThreshold: number;
    platformDownThreshold: number;
    cooldownMinutes: number;
}

// Track errors in memory (or Redis)
const errorTracker = new Map<string, { count: number; timestamps: number[] }>();

export async function checkAndAlert(event: {
    type: 'error' | 'cookie_status' | 'platform_status';
    platform: string;
    details: Record<string, unknown>;
}): Promise<void> {
    const config = await getAlertConfig();
    if (!config?.enabled || !config.webhookUrl) return;
    
    // Check cooldown
    if (isInCooldown(config)) return;
    
    // Check thresholds and send alert if needed
    switch (event.type) {
        case 'error':
            await checkErrorSpike(config, event);
            break;
        case 'cookie_status':
            await checkCookiePool(config, event);
            break;
        case 'platform_status':
            await checkPlatformHealth(config, event);
            break;
    }
}

async function sendAdminAlert(config: AlertConfig, embed: DiscordEmbed): Promise<void> {
    await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'XTFetch Alerts',
            avatar_url: 'https://xt-fetch.vercel.app/icon.png',
            embeds: [embed],
        }),
    });
    
    // Update last alert time
    await updateLastAlertTime();
}
```

---

## 🍪 3. Cookie Health Auto-Check

### Current State
- Manual test via admin panel
- No scheduled health checks
- No auto-disable for expired cookies

### Proposed: Scheduled Health Check

```
┌─────────────────────────────────────────────────────────────────┐
│  COOKIE HEALTH CHECK                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Auto-Check Schedule:                                           │
│  ○ Disabled                                                     │
│  ● Every 6 hours                                                │
│  ○ Every 12 hours                                               │
│  ○ Every 24 hours                                               │
│                                                                 │
│  On Check Failure:                                              │
│  ☑️ Mark as expired                                             │
│  ☑️ Send Discord alert (if configured)                         │
│  ☐ Auto-disable cookie                                         │
│                                                                 │
│  Last Check: 2 hours ago                                        │
│  Next Check: in 4 hours                                         │
│                                                                 │
│  [Run Check Now]                                                │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Recent Results:                                                │
│  • Facebook: 3/3 healthy ✅                                     │
│  • Instagram: 2/3 healthy ⚠️ (1 expired)                       │
│  • Twitter: 1/2 healthy ⚠️ (1 cooldown)                        │
│  • Weibo: 0/1 healthy ❌ (1 expired)                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Options

#### Option A: Cron Job (External)
- Use Vercel Cron or external service
- Call `/api/admin/cookies/health-check` endpoint
- Most reliable for scheduled tasks

#### Option B: On-Demand Check
- Check cookie health before use (lazy)
- Cache result for X minutes
- Less overhead, but reactive not proactive

#### Recommended: Hybrid Approach
1. **Lazy check**: Before using cookie, check if last_health_check > 6 hours ago
2. **API endpoint**: `/api/admin/cookies/health-check` for manual/cron trigger
3. **Alert integration**: Send Discord alert if healthy count drops below threshold

### API Endpoint

```typescript
// POST /api/admin/cookies/health-check
export async function POST(request: NextRequest) {
    const auth = await verifyAdminSession(request);
    if (!auth.valid) return unauthorized();
    
    const results: Record<string, { total: number; healthy: number; expired: string[] }> = {};
    
    for (const platform of ['facebook', 'instagram', 'twitter', 'weibo']) {
        const cookies = await getCookiesByPlatform(platform);
        const platformResult = { total: cookies.length, healthy: 0, expired: [] as string[] };
        
        for (const cookie of cookies.filter(c => c.enabled)) {
            const health = await testCookieHealth(cookie.id);
            if (health.healthy) {
                platformResult.healthy++;
            } else {
                platformResult.expired.push(cookie.label || cookie.id);
            }
        }
        
        results[platform] = platformResult;
    }
    
    // Check if alert needed
    await checkCookiePoolAlert(results);
    
    // Update last check time
    await updateLastHealthCheck();
    
    return NextResponse.json({ success: true, results });
}
```

---

## 📁 Files to Create/Modify

### New Files
```
src/lib/integrations/admin-alerts.ts       # ✅ Admin Discord alerts
src/app/api/admin/alerts/route.ts          # ✅ Alert config API
src/app/api/admin/cookies/health-check/route.ts  # ✅ Health check API
src/hooks/admin/useAlerts.ts               # ✅ Alert config hook
migration/sql-8-admin-alerts.sql           # ✅ Alert config table
```

### Modified Files
```
src/components/BatchQueue.tsx              # Enhanced batch queue (TODO)
src/lib/storage/indexeddb.ts               # Add queue persistence (TODO)
src/app/admin/settings/page.tsx            # ✅ Add alert config UI
src/app/admin/services/page.tsx            # Add health check UI to Pools (TODO)
src/lib/utils/cookie-pool.ts               # Add health check integration (TODO)
src/lib/supabase.ts                        # ✅ Integrated alert tracking
src/lib/integrations/index.ts              # ✅ Export admin alerts
```

---

## 🎯 Priority Order

1. **Cookie Health Auto-Check** - Most impactful, prevents failed requests
2. **Discord Error Alerts** - Early warning for issues
3. **Batch Queue Enhancement** - Nice to have, improves UX

---

## 📊 Expected Benefits

| Feature | Benefit |
|---------|---------|
| Cookie Health Check | Reduce failed requests by 30-50% |
| Error Alerts | Faster response to issues (minutes vs hours) |
| Batch Queue v2 | Better UX for power users |

---

*Proposal by: Kiro AI Assistant*
*Date: December 20, 2025*
