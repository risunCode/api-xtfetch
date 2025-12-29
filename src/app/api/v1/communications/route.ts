/**
 * Public Communications API
 * GET: Fetch active announcements and ads for display
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database';

export async function GET(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const page = searchParams.get('page') || 'home';
        const now = new Date().toISOString();

        // Build page filter for announcements
        const pageFilters: Record<string, string> = {
            home: 'show_on_home',
            history: 'show_on_history',
            settings: 'show_on_settings',
            docs: 'show_on_docs',
        };
        const pageColumn = pageFilters[page] || 'show_on_home';

        // Fetch active announcements for this page
        const { data: announcements, error: annError } = await supabaseAdmin
            .from('announcements')
            .select('id, title, message, type, icon, link_url, link_text, dismissable, priority')
            .eq('enabled', true)
            .eq(pageColumn, true)
            .lte('start_date', now)
            .or('end_date.is.null,end_date.gt.' + now)
            .order('priority', { ascending: false })
            .limit(5);

        if (annError) {
            console.error('[Communications API] Announcements error:', annError.message);
        }

        // Fetch active banner ads
        const { data: banners, error: bannerError } = await supabaseAdmin
            .from('banner_ads')
            .select('id, name, image_url, link_url, alt_text, placement, position, badge_text, badge_color, sponsor_text, priority')
            .eq('enabled', true)
            .lte('start_date', now)
            .or('end_date.is.null,end_date.gt.' + now)
            .order('priority', { ascending: false })
            .limit(10);

        if (bannerError) {
            console.error('[Communications API] Banner error:', bannerError.message);
        }

        // Fetch active compact ads
        const { data: compactAds, error: compactError } = await supabaseAdmin
            .from('compact_ads')
            .select('id, name, title, description, image_url, link_url, preview_title, preview_description, preview_image, placement, size, priority')
            .eq('enabled', true)
            .lte('start_date', now)
            .or('end_date.is.null,end_date.gt.' + now)
            .order('priority', { ascending: false })
            .limit(10);

        if (compactError) {
            console.error('[Communications API] Compact error:', compactError.message);
        }

        return NextResponse.json({
            success: true,
            data: {
                announcements: announcements || [],
                banners: banners || [],
                compactAds: compactAds || [],
            },
        });
    } catch (error) {
        console.error('[Communications API] Error:', error instanceof Error ? error.message : 'Unknown');
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Track impression/click
export async function POST(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { type, id, action } = await request.json();
        
        if (!type || !id || !action) {
            return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
        }

        const validTypes = ['announcement', 'banner', 'compact'];
        if (!validTypes.includes(type)) {
            return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
        }
        
        // Use RPC function for atomic increment
        if (action === 'click') {
            await supabaseAdmin.rpc('increment_ad_click', { ad_type: type, ad_id: id });
        } else if (action === 'dismiss' && type === 'announcement') {
            await supabaseAdmin.rpc('increment_announcement_dismiss', { announcement_id: id });
        } else {
            await supabaseAdmin.rpc('increment_ad_impression', { ad_type: type, ad_id: id });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ success: false, error: 'Failed to track' }, { status: 500 });
    }
}
