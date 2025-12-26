/**
 * Telegram Bot Setup API Route
 * GET /api/bot/setup - Setup webhook with Telegram
 * 
 * Call this endpoint once to register the webhook URL with Telegram.
 * Requires ADMIN_SECRET_KEY for authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, botConfigIsValid } from '@/bot';

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || '';

export async function GET(request: NextRequest) {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '') || 
                          request.nextUrl.searchParams.get('secret');
    
    if (!ADMIN_SECRET || providedSecret !== ADMIN_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if bot is configured
    if (!botConfigIsValid()) {
        return NextResponse.json(
            { error: 'Bot not configured - missing TELEGRAM_BOT_TOKEN' },
            { status: 503 }
        );
    }

    // Get webhook URL from request or env
    const host = request.headers.get('host') || '';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/bot/webhook`;

    try {
        // Set webhook with Telegram API
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;
        
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                secret_token: TELEGRAM_WEBHOOK_SECRET || undefined,
                allowed_updates: ['message', 'callback_query'],
                drop_pending_updates: true,
            }),
        });

        const result = await response.json();

        if (!result.ok) {
            return NextResponse.json({
                success: false,
                error: result.description,
                webhookUrl,
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: 'Webhook set successfully',
            webhookUrl,
            result,
        });
    } catch (error) {
        console.error('[Bot Setup] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * DELETE /api/bot/setup - Remove webhook
 */
export async function DELETE(request: NextRequest) {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '') || 
                          request.nextUrl.searchParams.get('secret');
    
    if (!ADMIN_SECRET || providedSecret !== ADMIN_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!botConfigIsValid()) {
        return NextResponse.json(
            { error: 'Bot not configured' },
            { status: 503 }
        );
    }

    try {
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`;
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drop_pending_updates: true }),
        });

        const result = await response.json();

        return NextResponse.json({
            success: result.ok,
            message: result.ok ? 'Webhook removed' : result.description,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
