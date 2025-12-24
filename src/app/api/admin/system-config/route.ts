/**
 * Admin System Config API
 * Manages system_config table for global configuration settings
 * 
 * GET: Get all system configs or specific key
 * POST: Update config value (upsert)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabaseAdmin, supabase } from '@/lib/database';

export interface SystemConfig {
    key: string;
    value: unknown; // JSONB value
    description: string | null;
    updated_at: string;
    updated_by: string | null;
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
        const key = searchParams.get('key');

        if (key) {
            // Get specific config by key
            const { data, error } = await db.from('system_config')
                .select('*')
                .eq('key', key)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return NextResponse.json({ success: false, error: 'Config key not found' }, { status: 404 });
                }
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, data });
        }

        // Get all configs
        const { data, error } = await db.from('system_config')
            .select('*')
            .order('key', { ascending: true });

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // Transform to key-value map for easier consumption
        const configMap: Record<string, unknown> = {};
        const configList = data || [];
        configList.forEach((item: SystemConfig) => {
            configMap[item.key] = item.value;
        });

        return NextResponse.json({ 
            success: true, 
            data: configList,
            configMap 
        });
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
        const { action, key, value, description, configs } = body;

        switch (action) {
            case 'set':
            case 'upsert': {
                if (!key) {
                    return NextResponse.json({ success: false, error: 'Key is required' }, { status: 400 });
                }

                if (value === undefined) {
                    return NextResponse.json({ success: false, error: 'Value is required' }, { status: 400 });
                }

                const { data, error } = await db.from('system_config')
                    .upsert({
                        key,
                        value,
                        description: description || null,
                        updated_at: new Date().toISOString(),
                        updated_by: auth.userId || null,
                    }, { onConflict: 'key' })
                    .select()
                    .single();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, data, message: `Config '${key}' updated successfully` });
            }

            case 'bulkSet': {
                // Bulk update multiple configs at once
                if (!configs || !Array.isArray(configs)) {
                    return NextResponse.json({ success: false, error: 'configs array is required' }, { status: 400 });
                }

                const upsertData = configs.map((config: { key: string; value: unknown; description?: string }) => ({
                    key: config.key,
                    value: config.value,
                    description: config.description || null,
                    updated_at: new Date().toISOString(),
                    updated_by: auth.userId || null,
                }));

                const { data, error } = await db.from('system_config')
                    .upsert(upsertData, { onConflict: 'key' })
                    .select();

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ 
                    success: true, 
                    data, 
                    message: `${configs.length} config(s) updated successfully` 
                });
            }

            case 'delete': {
                if (!key) {
                    return NextResponse.json({ success: false, error: 'Key is required' }, { status: 400 });
                }

                const { error } = await db.from('system_config').delete().eq('key', key);

                if (error) {
                    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
                }

                return NextResponse.json({ success: true, message: `Config '${key}' deleted successfully` });
            }

            default:
                return NextResponse.json({ 
                    success: false, 
                    error: 'Invalid action. Use: set, upsert, bulkSet, delete' 
                }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
