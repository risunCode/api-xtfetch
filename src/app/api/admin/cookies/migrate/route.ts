/**
 * Cookie Migration API
 * POST - Migrate unencrypted cookies to encrypted format
 */

import { NextRequest, NextResponse } from 'next/server';
import { authVerifyAdminSession } from '@/core/security';
import { cookiePoolMigrateUnencrypted } from '@/lib/cookies';

export async function POST(req: NextRequest) {
    const auth = await authVerifyAdminSession(req);
    if (!auth.valid) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await cookiePoolMigrateUnencrypted();
        
        return NextResponse.json({ 
            success: true, 
            data: result,
            message: `Migrated ${result.migrated} cookies, ${result.errors} errors`
        });
    } catch (e) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}
