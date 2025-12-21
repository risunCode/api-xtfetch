/**
 * Admin Auth API
 * Check current auth status via Supabase session
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySession, verifyAdminSession } from '@/core/security';

export async function GET(request: NextRequest) {
    const auth = await verifySession(request);
    
    if (!auth.valid) {
        return NextResponse.json({ 
            success: false, 
            authenticated: false,
            error: auth.error 
        }, { status: 401 });
    }
    
    return NextResponse.json({ 
        success: true, 
        authenticated: true,
        userId: auth.userId,
        email: auth.email,
        username: auth.username,
        role: auth.role,
        isAdmin: auth.role === 'admin'
    });
}

export async function POST(request: NextRequest) {
    const auth = await verifyAdminSession(request);
    
    if (!auth.valid) {
        return NextResponse.json({ 
            success: false, 
            error: auth.error || 'Admin access required'
        }, { status: auth.role ? 403 : 401 });
    }
    
    return NextResponse.json({ 
        success: true, 
        message: 'Admin access verified',
        userId: auth.userId,
        username: auth.username
    });
}
