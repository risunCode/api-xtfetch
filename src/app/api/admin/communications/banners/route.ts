/**
 * Admin Banner Ads API
 * GET: List all banner ads
 * POST: Create new banner ad
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabaseAdmin } from '@/lib/supabase';

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
            .from('banner_ads')
            .select('*')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Banner ads GET error:', error);
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

    try {
        const body = await request.json();
        
        const { data, error } = await supabaseAdmin
            .from('banner_ads')
            .insert({
                name: body.name,
                image_url: body.image_url,
                link_url: body.link_url,
                alt_text: body.alt_text,
                placement: body.placement || 'home',
                position: body.position || 'bottom',
                badge_text: body.badge_text,
                badge_color: body.badge_color || 'yellow',
                sponsor_text: body.sponsor_text,
                start_date: body.start_date || new Date().toISOString(),
                end_date: body.end_date,
                enabled: body.enabled ?? true,
                priority: body.priority ?? 0,
                created_by: auth.userId,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Banner ads POST error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
