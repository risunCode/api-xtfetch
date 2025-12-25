/**
 * Simple test endpoint for debugging
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    console.log('[TEST] Request received');
    
    // Test 1: Basic response
    console.log('[TEST] Step 1: Basic check OK');
    
    // Test 2: Check auth header
    const authHeader = request.headers.get('Authorization');
    console.log('[TEST] Step 2: Auth header:', authHeader ? 'Present' : 'Missing');
    
    // Test 3: Try importing auth
    try {
        const { authVerifyAdminSession } = await import('@/core/security');
        console.log('[TEST] Step 3: Auth import OK');
        
        const auth = await authVerifyAdminSession(request);
        console.log('[TEST] Step 4: Auth result:', auth);
        
        if (!auth.valid) {
            return NextResponse.json({ 
                success: false, 
                error: auth.error,
                step: 'auth_failed'
            }, { status: 401 });
        }
    } catch (e) {
        console.error('[TEST] Auth error:', e);
        return NextResponse.json({ 
            success: false, 
            error: String(e),
            step: 'auth_import_error'
        }, { status: 500 });
    }
    
    // Test 4: Try importing database
    try {
        const { supabase } = await import('@/lib/database');
        console.log('[TEST] Step 5: Database import OK, supabase:', supabase ? 'Configured' : 'NULL');
        
        if (!supabase) {
            return NextResponse.json({ 
                success: false, 
                error: 'Supabase not configured',
                step: 'db_null'
            }, { status: 500 });
        }
        
        // Test 5: Simple query
        const { data, error } = await supabase.from('users').select('id').limit(1);
        console.log('[TEST] Step 6: Query result:', { data, error });
        
        return NextResponse.json({ 
            success: true, 
            message: 'All tests passed',
            hasUsers: data && data.length > 0
        });
    } catch (e) {
        console.error('[TEST] Database error:', e);
        return NextResponse.json({ 
            success: false, 
            error: String(e),
            step: 'db_error'
        }, { status: 500 });
    }
}
