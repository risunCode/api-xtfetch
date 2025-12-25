/**
 * Telegram Bot Webhook API Route
 * POST /api/bot/webhook
 *
 * Receives updates from Telegram and passes them to the bot handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { webhookCallback } from 'grammy';
import { bot, botConfigIsValid } from '@/bot';

// Create webhook handler once (singleton)
const handleUpdate = webhookCallback(bot, 'std/http', {
  timeoutMilliseconds: 25_000,
  onTimeout: 'return',
});

// ============================================================================
// Webhook Handler
// ============================================================================

export async function POST(request: NextRequest) {
  // Check if bot is configured
  if (!botConfigIsValid()) {
    console.error('[Webhook] Bot not configured');
    return NextResponse.json({ error: 'Bot not configured' }, { status: 503 });
  }

  try {
    // Directly pass to grammY - no body consumption before this!
    return await handleUpdate(request);
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
