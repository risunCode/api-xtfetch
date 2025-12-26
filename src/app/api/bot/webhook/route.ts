/**
 * Telegram Bot Webhook API Route
 * POST /api/bot/webhook
 *
 * Receives updates from Telegram and passes them to the bot handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { webhookCallback } from 'grammy';
import { bot, botConfigIsValid, TELEGRAM_WEBHOOK_SECRET } from '@/bot';

// Telegram's official IP ranges for webhook requests
// https://core.telegram.org/bots/webhooks#the-short-version
const TELEGRAM_IP_RANGES = [
  '149.154.160.0/20',  // 149.154.160.0 - 149.154.175.255
  '91.108.4.0/22',     // 91.108.4.0 - 91.108.7.255
  '91.108.8.0/22',     // 91.108.8.0 - 91.108.11.255
  '91.108.56.0/22',    // 91.108.56.0 - 91.108.59.255
];

// Check if IP is in Telegram's range
function isFromTelegram(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;
  
  // Parse IP to number for range check
  const ipParts = ip.split('.').map(Number);
  if (ipParts.length !== 4 || ipParts.some(isNaN)) return false;
  
  const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
  
  // Check each Telegram range
  const ranges = [
    { start: (149 << 24) + (154 << 16) + (160 << 8), end: (149 << 24) + (154 << 16) + (175 << 8) + 255 },
    { start: (91 << 24) + (108 << 16) + (4 << 8), end: (91 << 24) + (108 << 16) + (7 << 8) + 255 },
    { start: (91 << 24) + (108 << 16) + (8 << 8), end: (91 << 24) + (108 << 16) + (11 << 8) + 255 },
    { start: (91 << 24) + (108 << 16) + (56 << 8), end: (91 << 24) + (108 << 16) + (59 << 8) + 255 },
  ];
  
  return ranges.some(r => ipNum >= r.start && ipNum <= r.end);
}

// Lazy-init webhook handler (avoid build-time errors when bot is null)
let handleUpdate: ((req: Request) => Promise<Response>) | null = null;

function getHandler() {
  if (!handleUpdate && bot) {
    handleUpdate = webhookCallback(bot, 'std/http', {
      timeoutMilliseconds: 25_000,
      onTimeout: 'return',
      secretToken: TELEGRAM_WEBHOOK_SECRET || undefined,
    });
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
  
  if (!isFromTelegram(clientIp)) {
    console.warn('[Webhook] Rejected: Not from Telegram IP', { ip: clientIp });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const handler = getHandler();
  if (!handler) {
    console.error('[Webhook] Handler not initialized');
    return NextResponse.json({ error: 'Bot not ready' }, { status: 503 });
  }

  try {
    return await handler(request);
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
