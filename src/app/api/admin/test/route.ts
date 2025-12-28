/**
 * Admin Test Endpoint
 * For debugging admin auth flow - REQUIRES ADMIN AUTH
 * 
 * SECURITY: This endpoint is protected and only accessible by admins
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';

export async function GET(request: NextRequest) {
    // SECURITY: Require admin auth FIRST before any processing
    const auth = await authVerifyAdminSession(request);
    if (!auth.valid) {
        return NextResponse.json({ 
            success: false, 
            error: 'Unauthorized' 
        }, { status: 401 });
    }

    // Only log in development
    if (process.env.NODE_ENV === 'development') {
        console.log('[TEST] Admin auth verified:', auth.userId);
    }

    try {
        const { supabase } = await import('@/lib/database');
        
        if (!supabase) {
            return NextResponse.json({ 
                success: false, 
                error: 'Database not configured'
            }, { status: 500 });
        }
        
        // Simple health check query
        const { data, error } = await supabase.from('users').select('id').limit(1);
        
        if (error) {
            return NextResponse.json({ 
                success: false, 
                error: 'Database query failed'
            }, { status: 500 });
        }
        
        return NextResponse.json({ 
            success: true, 
            message: 'Admin test passed',
            adminId: auth.userId,
            dbConnected: true
        });
    } catch (e) {
        return NextResponse.json({ 
            success: false, 
            error: 'Internal error'
        }, { status: 500 });
    }
}
