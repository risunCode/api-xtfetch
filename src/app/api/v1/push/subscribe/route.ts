/**
 * Push Subscription API v1
 * Handles user subscription management
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST - Subscribe to push notifications
export async function POST(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({
            success: false,
            error: 'Database not configured',
            meta: { endpoint: '/api/v1/push/subscribe' }
        }, { status: 503 });
    }

    try {
        const { subscription } = await request.json();
        
        if (!subscription?.endpoint || !subscription?.keys) {
            return NextResponse.json({
                success: false, 
                error: 'Invalid subscription data - endpoint and keys required',
                meta: {
                    endpoint: '/api/v1/push/subscribe'
                }
            }, { status: 400 });
        }
        
        const userAgent = request.headers.get('user-agent') || '';
        
        // Upsert subscription (update if exists, insert if new)
        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .upsert({
                endpoint: subscription.endpoint,
                keys_p256dh: subscription.keys.p256dh,
                keys_auth: subscription.keys.auth,
                user_agent: userAgent,
                is_active: true,
                last_used_at: new Date().toISOString()
            }, {
                onConflict: 'endpoint'
            });
        
        if (error) {
            console.error('[Push v1] Subscribe error:', error);
            return NextResponse.json({
                success: false, 
                error: 'Failed to save subscription',
                meta: {
                    endpoint: '/api/v1/push/subscribe'
                }
            }, { status: 500 });
        }
        
        return NextResponse.json({ 
            success: true,
            meta: {
                endpoint: '/api/v1/push/subscribe',
                message: 'Successfully subscribed to push notifications'
            }
        });
    } catch (error) {
        console.error('[Push v1] Subscribe error:', error);
        return NextResponse.json({
            success: false, 
            error: 'Internal server error',
            meta: {
                endpoint: '/api/v1/push/subscribe'
            }
        }, { status: 500 });
    }
}

// DELETE - Unsubscribe from push notifications
export async function DELETE(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({
            success: false,
            error: 'Database not configured',
            meta: { endpoint: '/api/v1/push/subscribe' }
        }, { status: 503 });
    }

    try {
        const { endpoint } = await request.json();
        
        if (!endpoint) {
            return NextResponse.json({
                success: false, 
                error: 'Endpoint required in request body',
                meta: {
                    endpoint: '/api/v1/push/subscribe'
                }
            }, { status: 400 });
        }
        
        // Mark as inactive instead of deleting (for analytics)
        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('endpoint', endpoint);
        
        if (error) {
            console.error('[Push v1] Unsubscribe error:', error);
            return NextResponse.json({
                success: false, 
                error: 'Failed to unsubscribe',
                meta: {
                    endpoint: '/api/v1/push/subscribe'
                }
            }, { status: 500 });
        }
        
        return NextResponse.json({ 
            success: true,
            meta: {
                endpoint: '/api/v1/push/subscribe',
                message: 'Successfully unsubscribed from push notifications'
            }
        });
    } catch (error) {
        console.error('[Push v1] Unsubscribe error:', error);
        return NextResponse.json({
            success: false, 
            error: 'Internal server error',
            meta: {
                endpoint: '/api/v1/push/subscribe'
            }
        }, { status: 500 });
    }
}

// GET - Check subscription status
export async function GET(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({
            success: false,
            error: 'Database not configured',
            meta: { endpoint: '/api/v1/push/subscribe' }
        }, { status: 503 });
    }

    try {
        const endpoint = request.nextUrl.searchParams.get('endpoint');
        
        if (!endpoint) {
            // Return total subscriber count
            const { count, error } = await supabaseAdmin
                .from('push_subscriptions')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true);
            
            if (error) throw error;
            
            return NextResponse.json({ 
                success: true, 
                data: {
                    subscriberCount: count || 0
                },
                meta: {
                    endpoint: '/api/v1/push/subscribe',
                    query: 'total_count'
                }
            });
        }
        
        // Check specific subscription
        const { data, error } = await supabaseAdmin
            .from('push_subscriptions')
            .select('is_active')
            .eq('endpoint', endpoint)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        return NextResponse.json({
            success: true,
            data: {
                isSubscribed: data?.is_active || false
            },
            meta: {
                endpoint: '/api/v1/push/subscribe',
                query: 'subscription_status'
            }
        });
    } catch (error) {
        console.error('[Push v1] Status check error:', error);
        return NextResponse.json({
            success: false, 
            error: 'Internal server error',
            meta: {
                endpoint: '/api/v1/push/subscribe'
            }
        }, { status: 500 });
    }
}

// Support OPTIONS for CORS
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}