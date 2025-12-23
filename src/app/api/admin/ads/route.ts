/**
 * Admin Ads API - CRUD for advertisement banners
 * GET - List all ads (including inactive)
 * GET ?type=compact - List compact ads
 * POST - Create new ad
 * PUT - Update ad
 * DELETE - Delete ad
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/core/database';
import { authVerifyAdminSession } from '@/core/security';

const db = supabaseAdmin || supabase;

// GET - List all ads
export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    const type = request.nextUrl.searchParams.get('type');
    const table = type === 'compact' ? 'compact_ads' : 'ads';

    const { data, error } = await db
        .from(table)
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
}

// POST - Create new ad
export async function POST(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { type } = body;

        // Compact ads - simple GIF + link
        if (type === 'compact') {
            const { gif_url, link_url, is_active } = body;
            if (!gif_url || !link_url) {
                return NextResponse.json({ success: false, error: 'gif_url and link_url are required' }, { status: 400 });
            }

            const { data, error } = await db
                .from('compact_ads')
                .insert({ gif_url, link_url, is_active: is_active !== false })
                .select()
                .single();

            if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            return NextResponse.json({ success: true, data });
        }

        // Regular ads
        const { title, description, image_url, link_url, link_text, platform, badge_text, badge_color, is_active, priority, start_date, end_date, pages, dismissable } = body;

        if (!title || !image_url || !link_url) {
            return NextResponse.json({ success: false, error: 'title, image_url, and link_url are required' }, { status: 400 });
        }

        const { data, error } = await db
            .from('ads')
            .insert({
                title,
                description: description || null,
                image_url,
                link_url,
                link_text: link_text || 'Shop Now',
                platform: platform || null,
                badge_text: badge_text || null,
                badge_color: badge_color || 'orange',
                is_active: is_active !== false,
                priority: priority || 0,
                start_date: start_date || null,
                end_date: end_date || null,
                pages: pages || ['home'],
                dismissable: dismissable !== false,
            })
            .select()
            .single();

        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, data });
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }
}

// PUT - Update ad
export async function PUT(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { id, type, ...updates } = body;
        const table = type === 'compact' ? 'compact_ads' : 'ads';

        if (!id) {
            return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await db
            .from(table)
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }
}

// DELETE - Delete ad
export async function DELETE(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    const id = request.nextUrl.searchParams.get('id');
    const type = request.nextUrl.searchParams.get('type');
    const table = type === 'compact' ? 'compact_ads' : 'ads';

    if (!id) {
        return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const { error } = await db
        .from(table)
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Ad deleted' });
}
