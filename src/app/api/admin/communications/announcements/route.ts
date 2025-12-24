/**
 * Admin Announcements API
 * GET: List all announcements
 * POST: Create new announcement
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
            .from('announcements')
            .select('*')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Announcements GET error:', error);
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
            .from('announcements')
            .insert({
                title: body.title,
                message: body.message,
                type: body.type || 'info',
                icon: body.icon,
                link_url: body.link_url,
                link_text: body.link_text,
                show_on_home: body.show_on_home ?? true,
                show_on_history: body.show_on_history ?? false,
                show_on_settings: body.show_on_settings ?? false,
                show_on_docs: body.show_on_docs ?? false,
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
        console.error('Announcements POST error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
