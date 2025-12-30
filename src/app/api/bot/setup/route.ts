/**
 * Telegram Bot Setup API Route
 * GET /api/bot/setup - Setup webhook with Telegram
 * 
 * Call this endpoint once to register the webhook URL with Telegram.
 * Requires ADMIN_SECRET_KEY for authorization via Authorization header.
 * 
 * Security:
 * - Rate limited: 5 attempts per 15 minutes (handled by middleware)
 * - Timing-safe comparison to prevent timing attacks
 * - Secret must be in Authorization header (not query params)
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, botConfigIsValid } from '@/bot';

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || '';

// Timing-safe string comparison to prevent timing attacks
function timingSafeCompare(a: string, b: string): boolean {
    if (!a || !b) return false;
    
    // Ensure both strings are the same length for timing-safe comparison
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    
    if (aBuffer.length !== bBuffer.length) {
        // Still do a comparison to maintain constant time
        crypto.timingSafeEqual(aBuffer, aBuffer);
        return false;
    }
    
    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export async function GET(request: NextRequest) {
    // Check authorization - ONLY from Authorization header (not query params for security)
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '').trim() || '';
    
    // Use timing-safe comparison to prevent timing attacks
    if (!ADMIN_SECRET || !timingSafeCompare(providedSecret, ADMIN_SECRET)) {
        // Generic error message - don't reveal if secret exists or not
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
    // Check authorization - ONLY from Authorization header (not query params for security)
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '').trim() || '';
    
    // Use timing-safe comparison to prevent timing attacks
    if (!ADMIN_SECRET || !timingSafeCompare(providedSecret, ADMIN_SECRET)) {
        // Generic error message - don't reveal if secret exists or not
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
