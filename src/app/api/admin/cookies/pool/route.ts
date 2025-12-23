/**
 * Cookie Pool API
 * GET - Get all cookies or stats
 * POST - Add new cookie
 * PATCH - Update cookie
 * DELETE - Delete cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import {
    cookiePoolGetStats,
    cookiePoolGetByPlatform,
    cookiePoolAdd,
    cookiePoolUpdate,
    cookiePoolDelete,
    cookiePoolTestHealth,
    type CookiePoolStats
} from '@/lib/cookies';

export async function GET(req: NextRequest) {
    const auth = await authVerifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform');
    const stats = searchParams.get('stats');

    try {
        if (stats === 'true') {
            const poolStats = await cookiePoolGetStats();
            const platforms = ['facebook', 'instagram', 'twitter', 'weibo'];
            const result: CookiePoolStats[] = platforms.map(p => {
                const existing = poolStats.find(s => s.platform === p);
                return existing || {
                    platform: p, total: 0, enabled_count: 0, healthy_count: 0,
                    cooldown_count: 0, expired_count: 0, disabled_count: 0,
                    total_uses: 0, total_success: 0, total_errors: 0
                };
            });
            return NextResponse.json({ success: true, data: result });
        }

        if (platform) {
            const cookies = await cookiePoolGetByPlatform(platform);
            const masked = cookies.map(c => ({
                ...c,
                cookie: (c as { cookiePreview?: string }).cookiePreview || '[encrypted]',
            }));
            return NextResponse.json({ success: true, data: masked });
        }

        return NextResponse.json({ success: false, error: 'Missing platform or stats parameter' }, { status: 400 });
    } catch (e) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const auth = await authVerifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { platform, cookie, label, note, max_uses_per_hour } = body;

        if (!platform || !cookie) {
            return NextResponse.json({ success: false, error: 'Missing platform or cookie' }, { status: 400 });
        }

        const result = await cookiePoolAdd(platform, cookie, { label, note, max_uses_per_hour });
        return NextResponse.json({ success: true, data: result });
    } catch (e) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const auth = await authVerifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { id, action, ...updates } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'Missing cookie id' }, { status: 400 });
        }

        if (action === 'test') {
            const result = await cookiePoolTestHealth(id);
            return NextResponse.json({ success: true, data: result });
        }

        const result = await cookiePoolUpdate(id, updates);
        return NextResponse.json({ success: true, data: result });
    } catch (e) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const auth = await authVerifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, error: 'Missing cookie id' }, { status: 400 });
        }

        const success = await cookiePoolDelete(id);
        if (!success) {
            return NextResponse.json({ success: false, error: 'Failed to delete cookie' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Cookie deleted' });
    } catch (e) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}
