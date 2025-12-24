/**
 * Admin Communications API
 * GET: Fetch all communications (announcements, ads)
 * POST: Create new communication item
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabaseAdmin } from '@/lib/database';

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'all';

        const result: Record<string, unknown[] | number> = {};

        // Fetch announcements
        if (type === 'all' || type === 'announcements') {
            const { data: announcements, error } = await supabaseAdmin
                .from('announcements')
                .select('*')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false });
            
            if (error) console.error('Error fetching announcements:', error);
            result.announcements = announcements || [];
        }

        // Fetch banner ads
        if (type === 'all' || type === 'banners') {
            const { data: banners, error } = await supabaseAdmin
                .from('banner_ads')
                .select('*')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false });
            
            if (error) console.error('Error fetching banner ads:', error);
            result.banners = banners || [];
        }

        // Fetch compact ads
        if (type === 'all' || type === 'compact') {
            const { data: compact, error } = await supabaseAdmin
                .from('compact_ads')
                .select('*')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false });
            
            if (error) console.error('Error fetching compact ads:', error);
            result.compact = compact || [];
        }

        // Fetch push notifications
        if (type === 'all' || type === 'push') {
            const { data: push, error } = await supabaseAdmin
                .from('push_notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            
            if (error) console.error('Error fetching push notifications:', error);
            result.push = push || [];
        }

        // Get push subscription count
        if (type === 'all' || type === 'push') {
            const { count } = await supabaseAdmin
                .from('push_subscriptions')
                .select('*', { count: 'exact', head: true })
                .eq('enabled', true);
            
            result.pushSubscriberCount = count || 0;
        }

        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        console.error('Communications API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
