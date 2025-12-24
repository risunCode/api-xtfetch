/**
 * Push Subscription API
 * POST: Subscribe to push notifications
 * DELETE: Unsubscribe from push notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database';

export async function POST(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { subscription, userId, userAgent, deviceType, browser } = await request.json();

        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return NextResponse.json({ success: false, error: 'Invalid subscription' }, { status: 400 });
        }

        // Upsert subscription (update if endpoint exists)
        const { data, error } = await supabaseAdmin
            .from('push_subscriptions')
            .upsert({
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_id: userId || null,
                user_agent: userAgent,
                device_type: deviceType,
                browser,
                enabled: true,
                last_used: new Date().toISOString(),
            }, {
                onConflict: 'endpoint',
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Push subscribe error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { endpoint } = await request.json();

        if (!endpoint) {
            return NextResponse.json({ success: false, error: 'Missing endpoint' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .update({ enabled: false })
            .eq('endpoint', endpoint);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Push unsubscribe error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
