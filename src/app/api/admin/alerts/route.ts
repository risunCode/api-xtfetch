/**
 * Admin Alerts API
 * Manages alert_config table for monitoring and notifications
 * 
 * GET: List all alerts
 * POST: Create new alert / Update alert / Delete alert
 * PATCH: Toggle alert enabled status
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabaseAdmin, supabase } from '@/lib/database';

// Alert types
export type AlertType = 'error_rate' | 'response_time' | 'cookie_health' | 'rate_limit' | 'platform_down';

export interface AlertConfig {
    id: string;
    name: string;
    type: AlertType;
    threshold: number;
    time_window: number; // in seconds
    enabled: boolean;
    notify_email: string | null;
    notify_webhook: string | null;
    last_triggered: string | null;
    created_at: string;
    updated_at: string;
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
        const type = searchParams.get('type') as AlertType | null;
        const enabled = searchParams.get('enabled');

        let query = db.from('alert_config').select('*').order('created_at', { ascending: false });

        if (type) {
            query = query.eq('type', type);
        }
        if (enabled !== null) {
            query = query.eq('enabled', enabled === 'true');
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: data || [] });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
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
        const { action, id, name, type, threshold, time_window, enabled, notify_email, notify_webhook } = body;

        switch (action) {
            case 'create': {
                if (!name || !type) {
                    return NextResponse.json({ success: false, error: 'Name and type are required' }, { status: 400 });
                }

                const validTypes: AlertType[] = ['error_rate', 'response_time', 'cookie_health', 'rate_limit', 'platform_down'];
                if (!validTypes.includes(type)) {
                    return NextResponse.json({ success: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
                }

                const { data, error } = await db.from('alert_config').insert({
                    name,
                    type,
                    threshold: threshold ?? 50,
                    time_window: time_window ?? 300, // default 5 minutes
                    enabled: enabled ?? true,
                    notify_email: notify_email || null,
                    notify_webhook: notify_webhook || null,
                }).select().single();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, data, message: 'Alert created successfully' });
            }

            case 'update': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
                }

                const updates: Partial<AlertConfig> = {};
                if (name !== undefined) updates.name = name;
                if (type !== undefined) updates.type = type;
                if (threshold !== undefined) updates.threshold = threshold;
                if (time_window !== undefined) updates.time_window = time_window;
                if (enabled !== undefined) updates.enabled = enabled;
                if (notify_email !== undefined) updates.notify_email = notify_email || null;
                if (notify_webhook !== undefined) updates.notify_webhook = notify_webhook || null;

                const { data, error } = await db.from('alert_config')
                    .update({ ...updates, updated_at: new Date().toISOString() })
                    .eq('id', id)
                    .select()
                    .single();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, data, message: 'Alert updated successfully' });
            }

            case 'delete': {
                if (!id) {
                    return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
                }

                const { error } = await db.from('alert_config').delete().eq('id', id);

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, message: 'Alert deleted successfully' });
            }

            case 'test': {
                const { webhookUrl } = body;
                if (!webhookUrl) {
                    return NextResponse.json({ success: false, error: 'Webhook URL required' }, { status: 400 });
                }
                
                try {
                    const response = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'test',
                            message: 'DownAria Alert Test',
                            timestamp: new Date().toISOString()
                        })
                    });
                    
                    return NextResponse.json({ 
                        success: response.ok,
                        error: response.ok ? undefined : `HTTP ${response.status}`
                    });
                } catch (testError) {
                    return NextResponse.json({ 
                        success: false, 
                        error: testError instanceof Error ? testError.message : 'Connection failed'
                    });
                }
            }

            default:
                return NextResponse.json({ success: false, error: 'Invalid action. Use: create, update, delete, test' }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
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
        const { id, ...updates } = body;
        
        if (!id) {
            return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
        }

        // Remove any fields that shouldn't be updated directly
        delete updates.created_at;
        delete updates.last_triggered;

        const { data, error } = await db
            .from('alert_config')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data, message: 'Alert updated successfully' });
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
        const { id, enabled } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
        }

        if (typeof enabled !== 'boolean') {
            return NextResponse.json({ success: false, error: 'enabled must be a boolean' }, { status: 400 });
        }

        const { data, error } = await db.from('alert_config')
            .update({ enabled, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            data, 
            message: `Alert ${enabled ? 'enabled' : 'disabled'} successfully` 
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
