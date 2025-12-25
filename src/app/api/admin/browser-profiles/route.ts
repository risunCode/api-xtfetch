/**
 * Admin Browser Profiles API
 * GET: List all profiles with stats
 * POST: Add new profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabase } from '@/lib/database';

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

    try {
        // Get all profiles
        const { data: profiles, error } = await supabase
            .from('browser_profiles')
            .select('*')
            .order('platform')
            .order('priority', { ascending: false });

        if (error) throw error;

        // Calculate totals from profiles directly (no separate stats table needed)
        const totals = {
            total: profiles?.length || 0,
            enabled: profiles?.filter(p => p.enabled).length || 0,
            totalUses: profiles?.reduce((sum, p) => sum + (p.use_count || 0), 0) || 0,
            totalSuccess: profiles?.reduce((sum, p) => sum + (p.success_count || 0), 0) || 0,
            totalErrors: profiles?.reduce((sum, p) => sum + (p.error_count || 0), 0) || 0,
        };

        // Calculate stats by platform/browser/device from profiles
        const statsMap = new Map<string, { platform: string; browser: string; device_type: string; total: number; enabled_count: number; total_uses: number; total_success: number; total_errors: number }>();
        
        for (const p of profiles || []) {
            const key = `${p.platform}-${p.browser}-${p.device_type}`;
            const existing = statsMap.get(key) || {
                platform: p.platform,
                browser: p.browser,
                device_type: p.device_type,
                total: 0,
                enabled_count: 0,
                total_uses: 0,
                total_success: 0,
                total_errors: 0,
            };
            existing.total++;
            if (p.enabled) existing.enabled_count++;
            existing.total_uses += p.use_count || 0;
            existing.total_success += p.success_count || 0;
            existing.total_errors += p.error_count || 0;
            statsMap.set(key, existing);
        }

        return NextResponse.json({
            success: true,
            data: {
                profiles: profiles || [],
                stats: Array.from(statsMap.values()),
                totals,
            }
        });
    } catch (error) {
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to fetch profiles' 
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

    try {
        const body = await request.json();
        const {
            platform = 'all',
            label,
            user_agent,
            sec_ch_ua,
            sec_ch_ua_platform,
            sec_ch_ua_mobile = '?0',
            accept_language = 'en-US,en;q=0.9',
            browser = 'chrome',
            device_type = 'desktop',
            os,
            is_chromium = false,
            priority = 5,
            enabled = true,
            note,
        } = body;

        // Validation
        if (!label || !user_agent) {
            return NextResponse.json({ success: false, error: 'Label and user_agent are required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('browser_profiles')
            .insert({
                platform,
                label,
                user_agent,
                sec_ch_ua: sec_ch_ua || null,
                sec_ch_ua_platform: sec_ch_ua_platform || null,
                sec_ch_ua_mobile,
                accept_language,
                browser,
                device_type,
                os: os || null,
                is_chromium,
                priority,
                enabled,
                note: note || null,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to create profile' 
        }, { status: 500 });
    }
}
