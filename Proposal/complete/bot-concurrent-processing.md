# Bot Concurrent Processing - Handle Multiple Users

**STATUS: ✅ IMPLEMENTED**

## Problem

Saat ini bot memproses request secara **sequential** - jika User A kirim link, User B harus menunggu sampai User A selesai. Ini menyebabkan:

1. **Bottleneck** - Satu user lambat = semua user lambat
2. **Timeout** - Request menumpuk, Telegram webhook timeout (60s)
3. **Bad UX** - User menunggu lama tanpa feedback

## Current Flow (Sequential)

```
User A sends link ──┐
                    │
User B sends link ──┼──► [Queue] ──► Process A ──► Process B ──► Process C
                    │
User C sends link ──┘

Timeline: |----A (10s)----|----B (8s)----|----C (12s)----|
Total: 30s (User C waits 30s!)
```

## Proposed Flow (Concurrent)

```
User A sends link ──► Process A ──► Done (10s)
                      ↑
User B sends link ──► Process B ──► Done (8s)
                      ↑
User C sends link ──► Process C ──► Done (12s)

Timeline: |----A (10s)----|
          |---B (8s)---|
          |------C (12s)------|
Total: 12s (max of all)
```

---

## Solution Options

### Option 1: Async/Await with Promise.all (Simple)

**Pros:** Simple, no extra infrastructure
**Cons:** Still limited by Node.js event loop, memory usage

```typescript
// Current (blocking)
bot.on('message:text', async (ctx) => {
    await processDownload(ctx); // Blocks next message
});

// Proposed (non-blocking)
bot.on('message:text', async (ctx) => {
    // Don't await - let it run in background
    processDownload(ctx).catch(err => {
        logger.error('telegram', err, 'BACKGROUND_PROCESS');
    });
});
```

### Option 2: Job Queue with Bull/BullMQ (Recommended)

**Pros:** Scalable, retry logic, job monitoring, rate limiting per user
**Cons:** Requires Redis (already have), more complex

```typescript
// Queue setup
import { Queue, Worker } from 'bullmq';

const downloadQueue = new Queue('bot-downloads', { connection: redis });

// Producer (webhook handler)
bot.on('message:text', async (ctx) => {
    const processingMsg = await ctx.reply('Processing...');
    
    await downloadQueue.add('download', {
        chatId: ctx.chat.id,
        messageId: ctx.message.message_id,
        processingMsgId: processingMsg.message_id,
        url: extractUrl(ctx.message.text),
        userId: ctx.from.id,
        isPremium: ctx.isPremium,
    });
});

// Consumer (worker)
const worker = new Worker('bot-downloads', async (job) => {
    const { chatId, url, processingMsgId, isPremium } = job.data;
    
    const result = await botUrlCallScraper(url, isPremium);
    
    if (result.success) {
        await bot.api.deleteMessage(chatId, processingMsgId);
        await sendMedia(chatId, result);
    } else {
        await bot.api.editMessageText(chatId, processingMsgId, `Error: ${result.error}`);
    }
}, { connection: redis, concurrency: 10 });
```

### Option 3: Webhook Response + Background Processing (Hybrid)

**Pros:** Fast webhook response, background processing
**Cons:** Need to track job status

```typescript
// Webhook responds immediately
bot.on('message:text', async (ctx) => {
    await ctx.reply('Processing...');
    
    // Schedule background job (don't await)
    setImmediate(() => {
        processDownload(ctx).catch(console.error);
    });
});
```

---

## Recommended: Option 2 (BullMQ)

### Why BullMQ?

1. **Concurrency Control** - Process N jobs simultaneously
2. **Rate Limiting** - Limit per user to prevent abuse
3. **Retry Logic** - Auto-retry failed jobs
4. **Job Priority** - Premium users get priority
5. **Monitoring** - Bull Board for job monitoring
6. **Already Have Redis** - No new infrastructure

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Webhook                         │
│                    POST /api/bot/webhook                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Grammy Bot Handler                        │
│  1. Auth middleware (get user)                              │
│  2. Rate limit check                                        │
│  3. Send "Processing..." message                            │
│  4. Add job to queue                                        │
│  5. Return immediately (< 1s)                               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Redis Queue (BullMQ)                      │
│  - bot:downloads:waiting                                    │
│  - bot:downloads:active                                     │
│  - bot:downloads:completed                                  │
│  - bot:downloads:failed                                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Worker 1   │   │  Worker 2   │   │  Worker 3   │
│  (Job A)    │   │  (Job B)    │   │  (Job C)    │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Bot API                          │
│  - Delete processing message                                │
│  - Send media / Edit to error                               │
│  - Delete user message                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Setup Queue Infrastructure

**Files to create:**
- `src/bot/queue/index.ts` - Queue setup & exports
- `src/bot/queue/downloadQueue.ts` - Download job queue
- `src/bot/queue/worker.ts` - Job processor

**Dependencies:**
```bash
npm install bullmq
```

### Phase 2: Modify URL Handler

**Current:** Process inline, blocking
**New:** Add to queue, return immediately

```typescript
// src/bot/handlers/url.ts
import { downloadQueue } from '../queue';

bot.on('message:text', async (ctx) => {
    const url = botUrlExtract(ctx.message.text);
    if (!url) return;
    
    // Send processing message
    const processingMsg = await ctx.reply('Processing...');
    
    // Add to queue (non-blocking)
    await downloadQueue.add('download', {
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        messageId: ctx.message.message_id,
        processingMsgId: processingMsg.message_id,
        url,
        isPremium: ctx.isPremium,
        timestamp: Date.now(),
    }, {
        priority: ctx.isPremium ? 1 : 10, // Premium gets priority
        attempts: 2,
        backoff: { type: 'fixed', delay: 1000 },
    });
});
```

### Phase 3: Create Worker

```typescript
// src/bot/queue/worker.ts
import { Worker } from 'bullmq';
import { bot } from '../index';
import { botUrlCallScraper, botUrlSendMedia } from '../handlers/url';

export const downloadWorker = new Worker('bot-downloads', async (job) => {
    const { chatId, userId, messageId, processingMsgId, url, isPremium } = job.data;
    
    try {
        // Call scraper
        const result = await botUrlCallScraper(url, isPremium);
        
        if (result.success) {
            // Delete processing message
            await bot.api.deleteMessage(chatId, processingMsgId).catch(() => {});
            
            // Send media
            await sendMediaToChat(chatId, result, url);
            
            // Delete user message
            await bot.api.deleteMessage(chatId, messageId).catch(() => {});
            
            // Record download
            await botRateLimitRecordDownload(userId);
        } else {
            // Edit to error
            await bot.api.editMessageText(chatId, processingMsgId, `Error: ${result.error}`);
        }
    } catch (error) {
        await bot.api.editMessageText(chatId, processingMsgId, 'Download failed.').catch(() => {});
        throw error; // For retry
    }
}, {
    connection: redis,
    concurrency: 10, // Process 10 jobs simultaneously
    limiter: {
        max: 30,      // Max 30 jobs
        duration: 60000, // Per minute
    },
});
```

### Phase 4: Graceful Shutdown

```typescript
// src/bot/queue/index.ts
export async function shutdownQueue() {
    await downloadWorker.close();
    await downloadQueue.close();
}

// In webhook handler or server shutdown
process.on('SIGTERM', async () => {
    await shutdownQueue();
    process.exit(0);
});
```

---

## Configuration

```typescript
// src/bot/queue/config.ts
export const QUEUE_CONFIG = {
    // Queue name
    QUEUE_NAME: 'bot-downloads',
    
    // Worker concurrency (simultaneous jobs)
    CONCURRENCY: 10,
    
    // Rate limiting
    RATE_LIMIT: {
        MAX_JOBS: 30,
        DURATION_MS: 60000, // 1 minute
    },
    
    // Job options
    JOB_OPTIONS: {
        ATTEMPTS: 2,
        BACKOFF_DELAY: 1000,
        REMOVE_ON_COMPLETE: 100, // Keep last 100 completed
        REMOVE_ON_FAIL: 50,      // Keep last 50 failed
    },
    
    // Priority (lower = higher priority)
    PRIORITY: {
        PREMIUM: 1,
        FREE: 10,
    },
};
```

---

## Monitoring (Optional)

### Bull Board Dashboard

```typescript
// src/app/api/admin/queue/route.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
createBullBoard({
    queues: [new BullMQAdapter(downloadQueue)],
    serverAdapter,
});

// Mount at /api/admin/queue
```

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/bot/queue/index.ts` | ✅ CREATED | Queue exports |
| `src/bot/queue/downloadQueue.ts` | ✅ CREATED | Queue definition |
| `src/bot/queue/worker.ts` | ✅ CREATED | Job processor |
| `src/bot/queue/config.ts` | ✅ CREATED | Queue config |
| `src/bot/handlers/url.ts` | ✅ MODIFIED | Use queue instead of inline |
| `src/bot/index.ts` | ✅ MODIFIED | Initialize worker |
| `package.json` | ✅ MODIFIED | Added bullmq, ioredis |
| `.env.example` | ✅ MODIFIED | Added UPSTASH_REDIS_URL |

---

## Rollback Plan

Jika ada masalah, bisa rollback dengan:
1. Remove queue imports dari `url.ts`
2. Restore inline processing
3. Worker akan drain existing jobs

---

## Timeline

| Phase | Task | Estimate |
|-------|------|----------|
| 1 | Setup BullMQ, create queue files | 30 min |
| 2 | Modify URL handler to use queue | 20 min |
| 3 | Create worker with error handling | 30 min |
| 4 | Testing & debugging | 30 min |
| **Total** | | **~2 hours** |

---

## Notes

- BullMQ requires Redis 6.2+ (Upstash supports this)
- Worker runs in same process as webhook (serverless compatible)
- For high traffic, consider separate worker process
- Monitor Redis memory usage with many jobs
