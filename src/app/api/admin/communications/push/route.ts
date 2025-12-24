/**
 * Admin Push Notifications API
 * GET: List all push notifications
 * POST: Create and send push notification
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabaseAdmin } from '@/lib/database';
import webpush from 'web-push';

// Configure VAPID
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@xt-fetch.vercel.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('push_notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // Get subscriber count
        const { count } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('enabled', true);

        return NextResponse.json({ 
            success: true, 
            data,
            subscriberCount: count || 0,
            vapidConfigured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
        });
    } catch (error) {
        console.error('Push notifications GET error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return NextResponse.json({ success: false, error: 'VAPID not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { title, body: notifBody, icon, image, badge, click_url, target, send_now } = body;

        // Create notification record
        const { data: notification, error: createError } = await supabaseAdmin
            .from('push_notifications')
            .insert({
                title,
                body: notifBody,
                icon,
                image,
                badge,
                click_url,
                target: target || 'all',
                status: send_now ? 'sending' : 'draft',
                created_by: auth.userId,
            })
            .select()
            .single();

        if (createError) throw createError;

        // If send_now, send to all subscribers
        if (send_now) {
            const { data: subscriptions, error: subError } = await supabaseAdmin
                .from('push_subscriptions')
                .select('*')
                .eq('enabled', true);

            if (subError) throw subError;

            const payload = JSON.stringify({
                title,
                body: notifBody,
                icon: icon || '/icon-192.png',
                image,
                badge: badge || '/badge-72.png',
                data: { url: click_url || '/' },
            });

            let sent = 0;
            let failed = 0;

            for (const sub of subscriptions || []) {
                try {
                    await webpush.sendNotification({
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.p256dh,
                            auth: sub.auth,
                        },
                    }, payload);
                    sent++;
                } catch (err) {
                    console.error('Push send error:', err);
                    failed++;
                    
                    // If subscription is invalid, disable it
                    if (err instanceof webpush.WebPushError && err.statusCode === 410) {
                        await supabaseAdmin
                            .from('push_subscriptions')
                            .update({ enabled: false })
                            .eq('id', sub.id);
                    }
                }
            }

            // Update notification stats
            await supabaseAdmin
                .from('push_notifications')
                .update({
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    total_sent: sent,
                    total_failed: failed,
                })
                .eq('id', notification.id);

            return NextResponse.json({ 
                success: true, 
                data: notification,
                stats: { sent, failed, total: (subscriptions || []).length },
            });
        }

        return NextResponse.json({ success: true, data: notification });
    } catch (error) {
        console.error('Push notifications POST error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
