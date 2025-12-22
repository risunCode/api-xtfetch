/**
 * User-Agent Pool Dynamic Route
 * PATCH - Update user agent
 * DELETE - Delete user agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/core/security';
import { supabase } from '@/core/database';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const auth = await verifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const { id } = await params;

    try {
        const body = await req.json();
        
        // Only allow updating specific fields
        const allowedFields = ['user_agent', 'device_type', 'browser', 'label', 'note', 'enabled', 'platform'];
        const updates: Record<string, unknown> = {};
        
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updates[field] = body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('useragent_pool')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (e) {
        console.error('[UserAgent Pool PATCH] Error:', e);
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const auth = await verifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const { id } = await params;

    try {
        const { error } = await supabase
            .from('useragent_pool')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'User agent deleted' });
    } catch (e) {
        console.error('[UserAgent Pool DELETE] Error:', e);
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}
