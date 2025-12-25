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
  // Check if bot is configured
  if (!botConfigIsValid()) {
    console.error('[Webhook] Bot not configured - missing TELEGRAM_BOT_TOKEN');
    return NextResponse.json(
      { error: 'Bot not configured' },
      { status: 503 }
    );
  }

  // Verify webhook secret if configured
  if (TELEGRAM_WEBHOOK_SECRET) {
    const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');

    // Debug: log lengths after trim
    console.log('[Webhook] Secret lengths - Expected:', TELEGRAM_WEBHOOK_SECRET.length, 'Received:', secretHeader?.length);

    if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
      console.warn('[Webhook] Invalid secret token');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
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
