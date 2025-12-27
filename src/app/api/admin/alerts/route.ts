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
        const single = searchParams.get('single'); // Get single config mode

        let query = db.from('alert_config').select('*').order('created_at', { ascending: false });

        if (type) {
            query = query.eq('type', type);
        }
        if (enabled !== null && enabled !== undefined) {
            query = query.eq('enabled', enabled === 'true');
        }

        // Single config mode - return first row as object (not array)
        if (single === 'true') {
            const { data, error } = await query.limit(1).single();
            
            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }
            
            // Map database columns to frontend field names
            const config = data ? {
                id: data.id,
                alertErrorSpike: data.alert_error_spike ?? true,
                alertCookieLow: data.alert_cookie_low ?? true,
                alertPlatformDown: data.alert_platform_down ?? true,
                alertRateLimit: data.alert_rate_limit ?? false,
                enabled: data.enabled ?? true,
                errorSpikeThreshold: data.error_spike_threshold ?? 50,
                errorSpikeWindow: data.error_spike_window ?? 300,
                cookieLowThreshold: data.cookie_low_threshold ?? 2,
                platformDownThreshold: data.platform_down_threshold ?? 3,
                rateLimitThreshold: data.rate_limit_threshold ?? 100,
                cooldownMinutes: data.cooldown_minutes ?? 30,
                notifyEmail: data.notify_email ?? false,
                notifyDiscord: data.notify_discord ?? true,
                discordWebhookUrl: data.discord_webhook_url,
                webhookUrl: data.discord_webhook_url, // Legacy alias
                emailRecipients: data.email_recipients,
                healthCheckEnabled: data.health_check_enabled ?? false,
                healthCheckInterval: data.health_check_interval ?? 3600,
                lastHealthCheckAt: data.last_health_check_at,
                lastAlertAt: data.last_alert_at,
                lastAlertType: data.last_alert_type,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
            } : null;
            
            return NextResponse.json({ success: true, data: config });
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

        // Remove any fields that shouldn't be updated directly
        delete updates.created_at;
        delete updates.last_triggered;
        delete updates.createdAt;
        delete updates.updatedAt;

        // Map frontend field names to database column names
        const dbUpdates: Record<string, unknown> = {};
        
        // Boolean flags
        if (updates.alertErrorSpike !== undefined) dbUpdates.alert_error_spike = updates.alertErrorSpike;
        if (updates.alertCookieLow !== undefined) dbUpdates.alert_cookie_low = updates.alertCookieLow;
        if (updates.alertPlatformDown !== undefined) dbUpdates.alert_platform_down = updates.alertPlatformDown;
        if (updates.alertRateLimit !== undefined) dbUpdates.alert_rate_limit = updates.alertRateLimit;
        if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
        
        // Thresholds
        if (updates.errorSpikeThreshold !== undefined) dbUpdates.error_spike_threshold = updates.errorSpikeThreshold;
        if (updates.errorSpikeWindow !== undefined) dbUpdates.error_spike_window = updates.errorSpikeWindow;
        if (updates.cookieLowThreshold !== undefined) dbUpdates.cookie_low_threshold = updates.cookieLowThreshold;
        if (updates.platformDownThreshold !== undefined) dbUpdates.platform_down_threshold = updates.platformDownThreshold;
        if (updates.rateLimitThreshold !== undefined) dbUpdates.rate_limit_threshold = updates.rateLimitThreshold;
        if (updates.cooldownMinutes !== undefined) dbUpdates.cooldown_minutes = updates.cooldownMinutes;
        
        // Notification settings
        if (updates.notifyEmail !== undefined) dbUpdates.notify_email = updates.notifyEmail;
        if (updates.notifyDiscord !== undefined) dbUpdates.notify_discord = updates.notifyDiscord;
        if (updates.discordWebhookUrl !== undefined) dbUpdates.discord_webhook_url = updates.discordWebhookUrl;
        if (updates.webhookUrl !== undefined) dbUpdates.discord_webhook_url = updates.webhookUrl; // Legacy alias
        if (updates.emailRecipients !== undefined) dbUpdates.email_recipients = updates.emailRecipients;
        
        // Health check settings
        if (updates.healthCheckEnabled !== undefined) dbUpdates.health_check_enabled = updates.healthCheckEnabled;
        if (updates.healthCheckInterval !== undefined) dbUpdates.health_check_interval = updates.healthCheckInterval;

        // Add updated_at timestamp
        dbUpdates.updated_at = new Date().toISOString();

        let query;
        if (id) {
            // Update specific row by ID
            query = db.from('alert_config').update(dbUpdates).eq('id', id);
        } else {
            // Update first row (single config mode) or upsert
            // First try to get existing config
            const { data: existing } = await db.from('alert_config').select('id').limit(1).single();
            
            if (existing?.id) {
                query = db.from('alert_config').update(dbUpdates).eq('id', existing.id);
            } else {
                // No config exists, create one
                query = db.from('alert_config').insert(dbUpdates);
            }
        }

        const { data, error } = await query.select().single();

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data, message: 'Alert config updated successfully' });
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
