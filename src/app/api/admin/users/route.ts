/**
 * Admin Users API
 * GET: List all users
 * POST: Update user
 * DELETE: Delete user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { verifyAdminSession } from '@/core/security';

export async function GET(request: NextRequest) {
    const auth = await verifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const search = searchParams.get('search') || '';
        const role = searchParams.get('role') || '';
        const status = searchParams.get('status') || '';

        let query = supabase
            .from('users')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (search) {
            query = query.or(`email.ilike.%${search}%,username.ilike.%${search}%,display_name.ilike.%${search}%`);
        }
        if (role) query = query.eq('role', role);
        if (status === 'active') query = query.eq('is_active', true);
        else if (status === 'inactive') query = query.eq('is_active', false);

        const { data, error, count } = await query;
        if (error) throw error;

        return NextResponse.json({
            success: true,
            data: { users: data, total: count || 0, page, limit, totalPages: Math.ceil((count || 0) / limit) }
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch users'
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = await verifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { action, userId, ...data } = body;

        switch (action) {
            case 'updateRole': {
                const { error } = await supabase.from('users').update({ role: data.role }).eq('id', userId);
                if (error) throw error;
                return NextResponse.json({ success: true, message: 'Role updated' });
            }

            case 'toggleStatus': {
                const { error } = await supabase.from('users').update({ is_active: data.isActive }).eq('id', userId);
                if (error) throw error;
                return NextResponse.json({ success: true, message: `User ${data.isActive ? 'enabled' : 'disabled'}` });
            }

            case 'createUser': {
                if (!supabaseAdmin) {
                    return NextResponse.json({ success: false, error: 'Admin client not configured' }, { status: 500 });
                }
                const { email, password, role: userRole } = data;
                if (!email || !password) {
                    return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 });
                }
                const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                    email, password, email_confirm: true
                });
                if (authError) {
                    return NextResponse.json({ success: false, error: authError.message }, { status: 400 });
                }
                if (userRole && userRole !== 'user' && authData.user) {
                    await supabase.from('users').update({ role: userRole }).eq('id', authData.user.id);
                }
                return NextResponse.json({ success: true, message: 'User created', userId: authData.user?.id });
            }

            default:
                return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Operation failed'
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const auth = await verifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    try {
        const { userId } = await request.json();
        if (!userId) {
            return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 });
        }
        const { error } = await supabase.from('users').delete().eq('id', userId);
        if (error) throw error;
        return NextResponse.json({ success: true, message: 'User deleted' });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Delete failed'
        }, { status: 500 });
    }
}
