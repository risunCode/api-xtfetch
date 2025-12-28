/**
 * Admin Users API
 * GET: List all users
 * POST: Update user (role, status, ban)
 * DELETE: Delete user
 * 
 * Schema (Dec 2024):
 * - status: 'active' | 'frozen' | 'banned' (replaces is_active)
 * - last_seen (replaces last_login)
 * - first_joined (replaces created_at for user context)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/database';
import { authVerifyAdminSession } from '@/core/security';
import { transformUsers, type UserDatabase } from '@/lib/utils';

// User status enum type
type UserStatus = 'active' | 'frozen' | 'banned';

export async function GET(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
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
        const status = searchParams.get('status') || ''; // 'active' | 'frozen' | 'banned'

        let query = supabase
            .from('users')
            .select('*', { count: 'exact' })
            .order('first_joined', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (search) {
            query = query.or(`email.ilike.%${search}%,username.ilike.%${search}%,display_name.ilike.%${search}%`);
        }
        if (role) query = query.eq('role', role);
        // New status enum filter: 'active' | 'frozen' | 'banned'
        if (status) query = query.eq('status', status);

        const { data, error, count } = await query;
        if (error) throw error;

        // Transform snake_case to camelCase for frontend
        const users = transformUsers((data || []) as UserDatabase[]);

        return NextResponse.json({
            success: true,
            data: { users, total: count || 0, page, limit, totalPages: Math.ceil((count || 0) / limit) }
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch users'
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    
    if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    // Store reference to avoid null checks in nested functions
    const db = supabase;

    try {
        const body = await request.json();
        const { action, userId, ...data } = body;

        // SECURITY: Helper to check if target user is admin
        const isTargetAdmin = async (targetId: string): Promise<boolean> => {
            const { data: targetUser } = await db
                .from('users')
                .select('role')
                .eq('id', targetId)
                .single();
            return targetUser?.role === 'admin';
        };

        // SECURITY: Prevent self-modification for critical actions
        if (['updateRole', 'toggleStatus', 'banUser', 'freezeUser'].includes(action)) {
            if (userId === auth.userId) {
                return NextResponse.json({ 
                    success: false, 
                    error: 'Cannot modify your own account. Ask another admin.' 
                }, { status: 403 });
            }
        }

        switch (action) {
            case 'updateRole': {
                // PROTECTION: Cannot modify admin users at all
                if (await isTargetAdmin(userId)) {
                    return NextResponse.json({ 
                        success: false, 
                        error: 'Cannot modify admin role. Admin accounts are protected.' 
                    }, { status: 403 });
                }
                
                // Validate role value
                if (!['user', 'admin'].includes(data.role)) {
                    return NextResponse.json({ 
                        success: false, 
                        error: 'Invalid role value' 
                    }, { status: 400 });
                }
                
                const { error } = await supabase.from('users').update({ role: data.role }).eq('id', userId);
                if (error) throw error;
                return NextResponse.json({ success: true, message: 'Role updated' });
            }

            case 'toggleStatus': {
                // PROTECTION: Cannot modify admin status
                if (await isTargetAdmin(userId)) {
                    return NextResponse.json({ 
                        success: false, 
                        error: 'Cannot modify admin status. Admin accounts are protected.' 
                    }, { status: 403 });
                }
                
                // New: Set status enum value ('active' | 'frozen' | 'banned')
                const newStatus: UserStatus = data.status || (data.isActive ? 'active' : 'frozen');
                if (!['active', 'frozen', 'banned'].includes(newStatus)) {
                    return NextResponse.json({ success: false, error: 'Invalid status value' }, { status: 400 });
                }
                const { error } = await supabase.from('users').update({ status: newStatus }).eq('id', userId);
                if (error) throw error;
                return NextResponse.json({ success: true, message: `User status set to ${newStatus}` });
            }

            case 'banUser': {
                // PROTECTION: Cannot ban admin
                if (await isTargetAdmin(userId)) {
                    return NextResponse.json({ 
                        success: false, 
                        error: 'Cannot ban admin users. Admin accounts are protected.' 
                    }, { status: 403 });
                }
                
                const { error } = await supabase.from('users').update({ status: 'banned' as UserStatus }).eq('id', userId);
                if (error) throw error;
                return NextResponse.json({ success: true, message: 'User banned' });
            }

            case 'unbanUser': {
                // New action: Set status back to 'active'
                const { error } = await supabase.from('users').update({ status: 'active' as UserStatus }).eq('id', userId);
                if (error) throw error;
                return NextResponse.json({ success: true, message: 'User unbanned' });
            }

            case 'freezeUser': {
                // PROTECTION: Cannot freeze admin
                if (await isTargetAdmin(userId)) {
                    return NextResponse.json({ 
                        success: false, 
                        error: 'Cannot freeze admin users. Admin accounts are protected.' 
                    }, { status: 403 });
                }
                
                const { error } = await supabase.from('users').update({ status: 'frozen' as UserStatus }).eq('id', userId);
                if (error) throw error;
                return NextResponse.json({ success: true, message: 'User frozen' });
            }

            case 'createUser': {
                if (!supabaseAdmin) {
                    return NextResponse.json({ success: false, error: 'Admin client not configured' }, { status: 500 });
                }
                const { email, password, role: userRole } = data;
                
                // Input validation
                if (!email || !password) {
                    return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 });
                }
                
                // Email format validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 });
                }
                
                // Password strength validation
                if (password.length < 8) {
                    return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });
                }
                
                // Role validation
                if (userRole && !['user', 'admin'].includes(userRole)) {
                    return NextResponse.json({ success: false, error: 'Invalid role value' }, { status: 400 });
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
    const auth = await authVerifyAdminSession(request);
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
        
        // SECURITY: Cannot delete yourself
        if (userId === auth.userId) {
            return NextResponse.json({ 
                success: false, 
                error: 'Cannot delete your own account' 
            }, { status: 403 });
        }
        
        // SECURITY: Cannot delete admin users
        const { data: targetUser } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();
            
        if (targetUser?.role === 'admin') {
            return NextResponse.json({ 
                success: false, 
                error: 'Cannot delete admin users. Admin accounts are protected.' 
            }, { status: 403 });
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
