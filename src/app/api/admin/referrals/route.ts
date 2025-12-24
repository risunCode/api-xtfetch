/**
 * Admin Special Referrals API
 * GET: List all special referrals
 * POST: Create new special referral
 * PATCH: Update referral
 * DELETE: Delete referral
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { authVerifyAdminSession } from '@/core/security';

// Get database client (prefer admin for write operations)
const getDb = () => supabaseAdmin || supabase;

// CORS headers for preflight
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle preflight OPTIONS request
export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

// Generate random referral code
function generateCode(prefix: string = 'XTF'): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = prefix;
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    if (!db) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { data, error } = await db
            .from('special_referrals')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch referrals'
        }, { status: 500 });
    }
}


export async function POST(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    if (!db) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { code: customCode, role = 'user', max_uses = 1, note, expires_at } = body;

        // Generate or use custom code
        let code = customCode?.toUpperCase() || generateCode();
        
        // Ensure code starts with XTF
        if (!code.startsWith('XTF')) {
            code = 'XTF' + code;
        }

        // Check if code already exists
        const { data: existing } = await db
            .from('special_referrals')
            .select('id')
            .eq('code', code)
            .single();

        if (existing) {
            return NextResponse.json({ success: false, error: 'Code already exists' }, { status: 400 });
        }

        // Create referral
        const { data, error } = await db
            .from('special_referrals')
            .insert({
                code,
                role,
                max_uses,
                note,
                expires_at: expires_at || null,
                created_by: auth.userId
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data, message: 'Referral code created' });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create referral'
        }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    if (!db) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { id, is_active, max_uses, note, expires_at } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'Referral ID required' }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        if (typeof is_active === 'boolean') updates.is_active = is_active;
        if (typeof max_uses === 'number') updates.max_uses = max_uses;
        if (note !== undefined) updates.note = note;
        if (expires_at !== undefined) updates.expires_at = expires_at;

        const { data, error } = await db
            .from('special_referrals')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data, message: 'Referral updated' });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update referral'
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    if (!db) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, error: 'Referral ID required' }, { status: 400 });
        }

        const { error } = await db
            .from('special_referrals')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Referral deleted' });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete referral'
        }, { status: 500 });
    }
}
