/**
 * Public Ads API - Get active ads for display
 * GET /api/v1/ads - Returns active ads within date range
 * GET /api/v1/ads?placement=compact - Returns compact ads (different table)
 * POST /api/v1/ads - Track ad click
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/core/database';

const db = supabaseAdmin || supabase;

// GET - Fetch active ads
export async function GET(request: NextRequest) {
    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '3');
    const page = request.nextUrl.searchParams.get('page') || 'home';
    const placement = request.nextUrl.searchParams.get('placement');
    const now = new Date().toISOString();

    // Compact ads - separate table (simple GIF banners)
    if (placement === 'compact') {
        const { data, error } = await db
            .from('compact_ads')
            .select('id, gif_url, link_url')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[Ads API] Compact error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            data,
            meta: { count: data?.length || 0, placement: 'compact' }
        });
    }

    // Regular ads
    const { data, error } = await db
        .from('ads')
        .select('id, title, description, image_url, link_url, link_text, platform, badge_text, badge_color, dismissable, pages')
        .eq('is_active', true)
        .contains('pages', [page])
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('priority', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[Ads API] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Track impressions (fire and forget)
    if (data && data.length > 0) {
        const ids = data.map(ad => ad.id);
        (async () => {
            try { await db.rpc('increment_ad_impressions', { ad_ids: ids }); } catch {}
        })();
    }

    return NextResponse.json({ 
        success: true, 
        data,
        meta: {
            count: data?.length || 0,
            page,
            endpoint: '/api/v1/ads'
        }
    });
}

// POST - Track ad click
export async function POST(request: NextRequest) {
    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { id, placement } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'Ad id is required' }, { status: 400 });
        }

        // Compact ads click tracking
        if (placement === 'compact') {
            try {
                await db.rpc('increment_compact_ad_clicks', { ad_id: id });
            } catch {
                await db.from('compact_ads').update({ click_count: 1 }).eq('id', id);
            }
            return NextResponse.json({ success: true });
        }

        // Regular ads click tracking
        const { error } = await db.rpc('increment_ad_clicks', { ad_id: id });

        if (error) {
            await db.from('ads').update({ click_count: 1 }).eq('id', id);
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
    }
}

// CORS
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
