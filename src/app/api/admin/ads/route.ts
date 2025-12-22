/**
 * Admin Ads API - CRUD for advertisement banners
 * GET - List all ads (including inactive)
 * POST - Create new ad
 * PUT - Update ad
 * DELETE - Delete ad
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/core/database';
import { verifyAdminSession } from '@/core/security';

const db = supabaseAdmin || supabase;

// GET - List all ads
export async function GET(request: NextRequest) {
    const auth = await verifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    const { data, error } = await db
        .from('ads')
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
    const auth = await verifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { title, description, image_url, link_url, link_text, platform, badge_text, badge_color, is_active, priority, start_date, end_date } = body;

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
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (err) {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }
}

// PUT - Update ad
export async function PUT(request: NextRequest) {
    const auth = await verifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
        }

        // Add updated_at
        updates.updated_at = new Date().toISOString();

        const { data, error } = await db
            .from('ads')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (err) {
        return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }
}

// DELETE - Delete ad
export async function DELETE(request: NextRequest) {
    const auth = await verifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!db) {
        return NextResponse.json({ success: false, error: 'DB not configured' }, { status: 500 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
        return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const { error } = await db
        .from('ads')
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Ad deleted' });
}
