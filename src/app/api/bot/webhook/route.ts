/**
 * Telegram Bot Webhook API Route
 * POST /api/bot/webhook
 *
 * Receives updates from Telegram and passes them to the bot handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { bot, botCreateWebhookHandler, botConfigIsValid, TELEGRAM_WEBHOOK_SECRET } from '@/bot';

// ============================================================================
// Webhook Handler
// ============================================================================

export async function POST(request: NextRequest) {
  console.log('[Webhook] POST received');
  
  // Check if bot is configured
  if (!botConfigIsValid()) {
    console.error('[Webhook] Bot not configured - missing TELEGRAM_BOT_TOKEN');
    return NextResponse.json(
      { error: 'Bot not configured' },
      { status: 503 }
    );
  }

  // Log incoming update for debugging
  try {
    const body = await request.clone().json();
    console.log('[Webhook] Update:', JSON.stringify(body).slice(0, 500));
  } catch (e) {
    console.log('[Webhook] Could not parse body');
  }

  try {
    // Get the webhook handler
    const handleUpdate = botCreateWebhookHandler();

    // Process the update
    return await handleUpdate(request);
  } catch (error) {
    console.error('[Webhook] Error processing update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Health Check (GET)
// ============================================================================

export async function GET() {
  const isConfigured = botConfigIsValid();

  return NextResponse.json({
    status: isConfigured ? 'ok' : 'not_configured',
    bot: isConfigured ? 'ready' : 'missing_token',
    timestamp: new Date().toISOString(),
  });
}
