/**
 * Admin Alerts Integration
 * Handles alert notifications for cookie health, error spikes, etc.
 * 
 * Note: This is a stub implementation. Full webhook/notification
 * functionality can be added later.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/services/helper/logger';

type PlatformId = 'facebook' | 'instagram' | 'twitter' | 'tiktok' | 'weibo' | 'youtube';

export interface AlertConfig {
    id: string;
    webhook_url: string | null;
    enabled: boolean;
    alert_error_spike: boolean;
    alert_cookie_low: boolean;
    alert_platform_down: boolean;
    error_spike_threshold: number;
    error_spike_window: number;
    cookie_low_threshold: number;
    platform_down_threshold: number;
    cooldown_minutes: number;
    last_alert_at: string | null;
    last_alert_type: string | null;
    health_check_enabled: boolean;
    health_check_interval: number;
    last_health_check_at: string | null;
}

// In-memory tracking for error rates (reset on server restart)
const errorCounts: Record<string, { count: number; windowStart: number }> = {};
const successCounts: Record<string, number> = {};

/**
 * Get alert configuration from database
 */
export async function getAlertConfig(): Promise<AlertConfig | null> {
    if (!supabaseAdmin) return null;
    
    try {
        const { data, error } = await supabaseAdmin
            .from('alert_config')
            .select('*')
            .single();
        
        if (error) {
            // Table might not exist yet
            if (error.code === 'PGRST116') return null;
            logger.error('admin-alerts', `Failed to get alert config: ${error.message}`);
            return null;
        }
        
        return data;
    } catch {
        return null;
    }
}

/**
 * Check cookie pool health and send alert if needed
 */
export async function checkCookiePoolHealth(
    stats: Record<string, { total: number; healthy: number }>
): Promise<void> {
    try {
        const config = await getAlertConfig();
        if (!config?.enabled || !config.alert_cookie_low) return;
        
        // Check each platform
        for (const [platform, data] of Object.entries(stats)) {
            if (data.total === 0) continue;
            
            const healthyPercent = (data.healthy / data.total) * 100;
            
            if (healthyPercent < config.cookie_low_threshold) {
                await sendAlert(config, 'cookie_low', {
                    platform,
                    healthy: data.healthy,
                    total: data.total,
                    percent: Math.round(healthyPercent),
                });
            }
        }
    } catch (error) {
        logger.error('admin-alerts', `checkCookiePoolHealth error: ${error}`);
    }
}

/**
 * Update last health check timestamp
 */
export async function updateLastHealthCheck(): Promise<void> {
    if (!supabaseAdmin) return;
    
    try {
        await supabaseAdmin
            .from('alert_config')
            .update({ last_health_check_at: new Date().toISOString() })
            .not('id', 'is', null); // Update all rows (should be single row)
    } catch (error) {
        logger.error('admin-alerts', `updateLastHealthCheck error: ${error}`);
    }
}

/**
 * Track successful download (for monitoring)
 */
export async function trackSuccess(platform: string): Promise<void> {
    successCounts[platform] = (successCounts[platform] || 0) + 1;
}

/**
 * Track error and check for error spike
 */
export async function trackError(platform: string, _errorMessage: string): Promise<void> {
    try {
        const config = await getAlertConfig();
        if (!config?.enabled || !config.alert_error_spike) return;
        
        const now = Date.now();
        const windowMs = config.error_spike_window * 60 * 1000; // Convert minutes to ms
        
        // Initialize or reset window
        if (!errorCounts[platform] || now - errorCounts[platform].windowStart > windowMs) {
            errorCounts[platform] = { count: 0, windowStart: now };
        }
        
        errorCounts[platform].count++;
        
        // Check if threshold exceeded
        if (errorCounts[platform].count >= config.error_spike_threshold) {
            await sendAlert(config, 'error_spike', {
                platform,
                count: errorCounts[platform].count,
                window: config.error_spike_window,
            });
            
            // Reset counter after alert
            errorCounts[platform] = { count: 0, windowStart: now };
        }
    } catch (error) {
        logger.error('admin-alerts', `trackError error: ${error}`);
    }
}

/**
 * Send alert via webhook
 */
async function sendAlert(
    config: AlertConfig,
    alertType: string,
    data: Record<string, unknown>
): Promise<void> {
    // Check cooldown
    if (config.last_alert_at) {
        const lastAlert = new Date(config.last_alert_at).getTime();
        const cooldownMs = config.cooldown_minutes * 60 * 1000;
        
        if (Date.now() - lastAlert < cooldownMs) {
            logger.debug('admin-alerts', `Alert skipped (cooldown): ${alertType}`);
            return;
        }
    }
    
    // Send webhook if configured
    if (config.webhook_url) {
        try {
            const payload = {
                type: alertType,
                timestamp: new Date().toISOString(),
                data,
            };
            
            await fetch(config.webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            
            logger.debug('admin-alerts', `Alert sent: ${alertType}`);
        } catch (error) {
            logger.error('admin-alerts', `Failed to send webhook: ${error}`);
        }
    }
    
    // Update last alert timestamp
    if (supabaseAdmin) {
        await supabaseAdmin
            .from('alert_config')
            .update({
                last_alert_at: new Date().toISOString(),
                last_alert_type: alertType,
            })
            .not('id', 'is', null);
    }
}

/**
 * Test webhook connectivity
 */
export async function testWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'test',
                timestamp: new Date().toISOString(),
                message: 'XTFetch webhook test',
            }),
        });
        
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }
        
        return { success: true };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Request failed' 
        };
    }
}
