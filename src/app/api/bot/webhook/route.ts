/**
 * Telegram Bot Webhook API Route
 * POST /api/bot/webhook
 *
 * Receives updates from Telegram and passes them to the bot handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { webhookCallback } from 'grammy';
import { bot, botConfigIsValid, TELEGRAM_WEBHOOK_SECRET } from '@/bot';

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

  // SECURITY: Webhook secret is MANDATORY to prevent unauthorized command injection
  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.error('[Webhook] CRITICAL: TELEGRAM_WEBHOOK_SECRET not configured - rejecting all requests');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
  }

  // Always validate secret token header
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
  if (!secretHeader) {
    console.warn('[Webhook] Rejected: Missing secret token header', {
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent')?.substring(0, 100) || 'unknown',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
    console.warn('[Webhook] Rejected: Invalid secret token', {
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent')?.substring(0, 100) || 'unknown',
      // Log partial header for debugging (first 8 chars only, never log full secret)
      headerPrefix: secretHeader.substring(0, 8) + '...',
    });
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
