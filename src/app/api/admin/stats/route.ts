/**
 * Admin Stats API
 * GET: Fetch dashboard statistics
 * 
 * Schema (Jan 2025):
 * - download_stats: Platform download statistics (with country, source)
 * - error_logs: Error tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { supabase } from '@/lib/database';

interface DownloadStat {
    id: string;
    platform: string;
    date: string;
    country?: string;
    source?: string;
    total_requests: number;
    success_count: number;
    error_count: number;
    unique_users: number;
    avg_response_time: number;
}

interface ErrorLog {
    id: string;
    platform: string;
    error_type?: string;
    error_code: string;
    error_message: string;
    request_url?: string | null;
    url?: string | null;
    user_agent: string | null;
    ip_hash?: string | null;
    ip_address?: string | null;
    timestamp?: string;
    created_at?: string;
}

export async function GET(request: NextRequest) {
    try {
        const auth = await authVerifyAdminSession(request);
        if (!auth.valid) {
            return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
        }

        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
        }

        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '7');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Fetch download stats
        const { data: downloadStats, error: statsError } = await supabase
            .from('download_stats')
            .select('*')
            .gte('date', startDate.toISOString().split('T')[0])
            .order('date', { ascending: false });

        if (statsError) {
            console.error('Error fetching download stats:', statsError);
        }

        // Fetch recent errors
        const { data: errorLogs, error: logsError } = await supabase
            .from('error_logs')
            .select('*')
            .gte('timestamp', startDate.toISOString())
            .order('timestamp', { ascending: false })
            .limit(100);

        if (logsError) {
            console.error('Error fetching error logs:', logsError);
        }

        // Calculate totals
        const stats = (downloadStats || []) as DownloadStat[];
        const totalDownloads = stats.reduce((sum, s) => sum + (s.total_requests || 0), 0);
        const successfulDownloads = stats.reduce((sum, s) => sum + (s.success_count || 0), 0);
        const failedDownloads = stats.reduce((sum, s) => sum + (s.error_count || 0), 0);
        const uniqueUsers = stats.reduce((sum, s) => sum + (s.unique_users || 0), 0);

        // Group by platform
        const byPlatform: Record<string, { total: number; success: number; failed: number }> = {};
        stats.forEach(s => {
            if (!byPlatform[s.platform]) {
                byPlatform[s.platform] = { total: 0, success: 0, failed: 0 };
            }
            byPlatform[s.platform].total += s.total_requests || 0;
            byPlatform[s.platform].success += s.success_count || 0;
            byPlatform[s.platform].failed += s.error_count || 0;
        });

        // Group by country
        const byCountry: Record<string, number> = {};
        stats.forEach(s => {
            const country = s.country || 'XX';
            byCountry[country] = (byCountry[country] || 0) + (s.total_requests || 0);
        });

        // Group by source
        const bySource: Record<string, number> = {};
        stats.forEach(s => {
            const source = s.source || 'web';
            bySource[source] = (bySource[source] || 0) + (s.total_requests || 0);
        });

        // Process errors with normalized fields
        const errors = (errorLogs || []) as ErrorLog[];
        const errorsByCode: Record<string, number> = {};
        const recentErrors = errors.slice(0, 20).map(e => ({
            id: e.id,
            platform: e.platform,
            error_type: e.error_type || 'unknown',
            error_code: e.error_code,
            error_message: e.error_message,
            request_url: e.request_url || e.url || null,
            user_agent: e.user_agent,
            ip_address: e.ip_address || e.ip_hash || null,
            timestamp: e.timestamp || e.created_at,
        }));
        
        errors.forEach(e => {
            errorsByCode[e.error_code] = (errorsByCode[e.error_code] || 0) + 1;
        });

        return NextResponse.json({
            success: true,
            data: {
                summary: {
                    totalDownloads,
                    successfulDownloads,
                    failedDownloads,
                    uniqueUsers,
                    successRate: totalDownloads > 0 ? Math.round((successfulDownloads / totalDownloads) * 100) : 0,
                },
                byPlatform,
                byCountry,
                bySource,
                recentErrors,
                errorsByCode,
                dailyStats: stats,
            }
        });
    } catch (error) {
        console.error('Stats API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
