/**
 * Cookie Pool Dynamic Route
 * GET - Get single cookie (with ?test=true for health check)
 * PATCH - Update cookie
 * DELETE - Delete cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/core/security';
import {
    updatePooledCookie,
    deleteCookieFromPool,
    testCookieHealth,
} from '@/lib/utils/cookie-pool';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
    const auth = await verifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const test = searchParams.get('test');

    try {
        if (test === 'true') {
            const result = await testCookieHealth(id);
            return NextResponse.json({ success: true, data: result });
        }

        return NextResponse.json({ success: false, error: 'Use ?test=true for health check' }, { status: 400 });
    } catch (e) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
    const auth = await verifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const body = await req.json();
        const result = await updatePooledCookie(id, body);
        return NextResponse.json({ success: true, data: result });
    } catch (e) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const auth = await verifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const success = await deleteCookieFromPool(id);
        if (!success) {
            return NextResponse.json({ success: false, error: 'Failed to delete cookie' }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: 'Cookie deleted' });
    } catch (e) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}
