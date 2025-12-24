/**
 * Admin Compact Ad by ID API
 * GET: Get single compact ad
 * PUT: Update compact ad
 * DELETE: Delete compact ad
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabaseAdmin } from '@/lib/supabase';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { id } = await params;
        const { data, error } = await supabaseAdmin
            .from('compact_ads')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Compact ad GET error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { id } = await params;
        const body = await request.json();
        
        const { data, error } = await supabaseAdmin
            .from('compact_ads')
            .update({
                ...body,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Compact ad PUT error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { id } = await params;
        const { error } = await supabaseAdmin
            .from('compact_ads')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Compact ad DELETE error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
