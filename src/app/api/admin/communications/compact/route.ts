/**
 * Admin Compact Ads API
 * GET: List all compact ads
 * POST: Create new compact ad
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabaseAdmin } from '@/lib/database';

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
            .from('compact_ads')
            .select('*')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Compact ads GET error:', error);
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
            .from('compact_ads')
            .insert({
                name: body.name,
                title: body.title,
                description: body.description,
                image_url: body.image_url,
                link_url: body.link_url,
                preview_title: body.preview_title,
                preview_description: body.preview_description,
                preview_image: body.preview_image,
                placement: body.placement || 'sidebar',
                size: body.size || 'medium',
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
        console.error('Compact ads POST error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
