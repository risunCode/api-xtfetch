/**
 * Telegram Bot Webhook API Route
 * POST /api/bot/webhook
 *
 * Receives updates from Telegram and passes them to the bot handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { webhookCallback } from 'grammy';
import { bot, botConfigIsValid, TELEGRAM_WEBHOOK_SECRET, initWorker, isQueueAvailable, setBotApi } from '@/bot';

// Telegram's official IP ranges for webhook requests
// https://core.telegram.org/bots/webhooks#the-short-version
const TELEGRAM_CIDRS = [
  { ip: [149, 154, 160, 0], mask: 20 },  // 149.154.160.0/20
  { ip: [91, 108, 4, 0], mask: 22 },     // 91.108.4.0/22
  { ip: [91, 108, 8, 0], mask: 22 },     // 91.108.8.0/22  
  { ip: [91, 108, 56, 0], mask: 22 },    // 91.108.56.0/22
];

// Check if IP is from Telegram using proper CIDR matching
function isFromTelegram(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;
  
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;
  
  // Convert to 32-bit unsigned integer using >>> 0
  const ipNum = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  
  for (const cidr of TELEGRAM_CIDRS) {
    const netNum = ((cidr.ip[0] << 24) | (cidr.ip[1] << 16) | (cidr.ip[2] << 8) | cidr.ip[3]) >>> 0;
    const mask = (0xFFFFFFFF << (32 - cidr.mask)) >>> 0;
    
    if ((ipNum & mask) === (netNum & mask)) {
      return true;
    }
  }
  
  return false;
}

// Lazy-init webhook handler (avoid build-time errors when bot is null)
let handleUpdate: ((req: Request) => Promise<Response>) | null = null;
let botInitialized = false;
let workerInitialized = false;

async function getHandler() {
  if (!handleUpdate && bot) {
    // Initialize bot first (fetch bot info from Telegram)
    if (!botInitialized) {
      try {
        await bot.init();
        botInitialized = true;
        console.log('[Webhook] Bot initialized');
        
        // Set bot API for worker
        setBotApi(bot.api);
        console.log('[Webhook] Bot API set for worker');
      } catch (error) {
        console.error('[Webhook] Bot init failed:', error);
        return null;
      }
    }
    
    // Initialize worker if not done yet
    if (!workerInitialized && isQueueAvailable()) {
      try {
        console.log('[Webhook] Queue available, initializing worker...');
        const started = await initWorker();
        workerInitialized = true;
        console.log('[Webhook] Worker initialized:', started ? 'SUCCESS' : 'FAILED');
      } catch (error) {
        console.error('[Webhook] Worker init failed:', error);
      }
    }
    
    // Secret token validation: Grammy checks x-telegram-bot-api-secret-token header
    // We already validate IP, but secret token adds extra security layer
    handleUpdate = webhookCallback(bot, 'std/http', {
      timeoutMilliseconds: 25_000,
      onTimeout: 'return',
      secretToken: TELEGRAM_WEBHOOK_SECRET || undefined,
    });
    
    console.log('[Webhook] Handler created with secretToken:', TELEGRAM_WEBHOOK_SECRET ? 'SET' : 'NOT SET');
  }
  return handleUpdate;
}

// ============================================================================
// Webhook Handler
// ============================================================================

export async function POST(request: NextRequest) {
  // Check if bot is configured
  if (!botConfigIsValid()) {
    console.error('[Webhook] Bot not configured');
    return NextResponse.json({ error: 'Bot not configured' }, { status: 503 });
  }

  // SECURITY: Validate request is from Telegram's IP range
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() 
    || request.headers.get('x-real-ip') 
    || 'unknown';
  
  const isValidIp = isFromTelegram(clientIp);
  console.log('[Webhook] IP check:', { clientIp, isValid: isValidIp });
  
  if (!isValidIp) {
    console.warn('[Webhook] Rejected: Not from Telegram IP');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const handler = await getHandler();
    if (!handler) {
      console.error('[Webhook] Handler not initialized');
      return NextResponse.json({ error: 'Bot not ready' }, { status: 503 });
    }

    // Pass request directly to Grammy - don't consume body first!
    const response = await handler(request);
    return response;
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json({ ok: true }); // Always 200 to prevent Telegram retry
  }
}

// ============================================================================
// Health Check (GET)
// ============================================================================

export async function GET() {
  return NextResponse.json({
    status: botConfigIsValid() ? 'ok' : 'not_configured',
    timestamp: new Date().toISOString(),
  });
}
