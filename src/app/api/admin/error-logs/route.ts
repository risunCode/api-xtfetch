/**
 * Admin Error Logs API
 * Manages error_logs table for error tracking and resolution
 * 
 * GET: List error logs with filters (platform, resolved, date range)
 * PATCH: Mark error as resolved
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabaseAdmin, supabase } from '@/lib/database';

export type PlatformId = 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo' | 'youtube';

export interface ErrorLog {
    id: string;
    timestamp: string;
    platform: PlatformId | null;
    error_code: string | null;
    error_message: string;
    error_stack: string | null;
    request_url: string | null;
    user_id: string | null;
    api_key_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    resolved: boolean;
    resolved_at: string | null;
    resolved_by: string | null;
}

// Get the database client (prefer admin client for write operations)
const getDb = () => supabaseAdmin || supabase;

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
        const { searchParams } = new URL(request.url);
        
        // Filter parameters
        const platform = searchParams.get('platform') as PlatformId | null;
        const resolved = searchParams.get('resolved');
        const errorCode = searchParams.get('error_code');
        const startDate = searchParams.get('start_date');
        const endDate = searchParams.get('end_date');
        const limit = parseInt(searchParams.get('limit') || '100', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        let query = db.from('error_logs')
            .select('*', { count: 'exact' })
            .order('timestamp', { ascending: false })
            .range(offset, offset + limit - 1);

        // Apply filters
        if (platform) {
            query = query.eq('platform', platform);
        }
        if (resolved !== null) {
            query = query.eq('resolved', resolved === 'true');
        }
        if (errorCode) {
            query = query.eq('error_code', errorCode);
        }
        if (startDate) {
            query = query.gte('timestamp', startDate);
        }
        if (endDate) {
            query = query.lte('timestamp', endDate);
        }

        const { data, error, count } = await query;

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            data: data || [],
            pagination: {
                total: count || 0,
                limit,
                offset,
                hasMore: (count || 0) > offset + limit
            }
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
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
        const { action, id, ids } = body;

        switch (action) {
            case 'resolve': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
                }

                const { data, error } = await db.from('error_logs')
                    .update({
                        resolved: true,
                        resolved_at: new Date().toISOString(),
                        resolved_by: auth.userId || null,
                    })
                    .eq('id', id)
                    .select()
                    .single();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, data, message: 'Error marked as resolved' });
            }

            case 'unresolve': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
                }

                const { data, error } = await db.from('error_logs')
                    .update({
                        resolved: false,
                        resolved_at: null,
                        resolved_by: null,
                    })
                    .eq('id', id)
                    .select()
                    .single();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, data, message: 'Error marked as unresolved' });
            }

            case 'bulkResolve': {
                if (!ids || !Array.isArray(ids) || ids.length === 0) {
                    return NextResponse.json({ success: false, error: 'ids array is required' }, { status: 400 });
                }

                const { data, error } = await db.from('error_logs')
                    .update({
                        resolved: true,
                        resolved_at: new Date().toISOString(),
                        resolved_by: auth.userId || null,
                    })
                    .in('id', ids)
                    .select();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ 
                    success: true, 
                    data, 
                    message: `${data?.length || 0} error(s) marked as resolved` 
                });
            }

            case 'delete': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
                }

                const { error } = await db.from('error_logs').delete().eq('id', id);

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, message: 'Error log deleted' });
            }

            case 'bulkDelete': {
                if (!ids || !Array.isArray(ids) || ids.length === 0) {
                    return NextResponse.json({ success: false, error: 'ids array is required' }, { status: 400 });
                }

                const { error } = await db.from('error_logs').delete().in('id', ids);

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, message: `${ids.length} error log(s) deleted` });
            }

            default:
                return NextResponse.json({ 
                    success: false, 
                    error: 'Invalid action. Use: resolve, unresolve, bulkResolve, delete, bulkDelete' 
                }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// POST endpoint for logging new errors (can be called internally)
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
        const { 
            platform, 
            error_code, 
            error_message, 
            error_stack, 
            request_url, 
            user_id, 
            api_key_id, 
            ip_address, 
            user_agent 
        } = body;

        if (!error_message) {
            return NextResponse.json({ success: false, error: 'error_message is required' }, { status: 400 });
        }

        const { data, error } = await db.from('error_logs').insert({
            platform: platform || null,
            error_code: error_code || null,
            error_message,
            error_stack: error_stack || null,
            request_url: request_url || null,
            user_id: user_id || null,
            api_key_id: api_key_id || null,
            ip_address: ip_address || null,
            user_agent: user_agent || null,
            resolved: false,
        }).select().single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data, message: 'Error logged successfully' });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
