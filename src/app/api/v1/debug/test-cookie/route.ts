/**
 * Test Cookie API
 * POST /api/v1/debug/test-cookie
 * 
 * Test if a cookie works for a platform
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRotatingCookie, getAdminCookie, getCookiesByPlatform } from '@/lib/cookies';
import { supabaseAdmin } from '@/lib/supabase';

type Platform = 'facebook' | 'instagram' | 'twitter' | 'weibo' | 'tiktok' | 'youtube';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { platform } = body as { platform?: Platform };

        if (!platform) {
            return NextResponse.json({
                success: false,
                error: 'Platform is required',
            }, { status: 400 });
        }

        const validPlatforms = ['facebook', 'instagram', 'twitter', 'weibo', 'tiktok', 'youtube'];
        if (!validPlatforms.includes(platform)) {
            return NextResponse.json({
                success: false,
                error: `Invalid platform. Valid: ${validPlatforms.join(', ')}`,
            }, { status: 400 });
        }

        // Check various cookie sources
        const checks = {
            supabaseConnected: false,
            poolCookies: [] as Array<{
                id: string;
                status: string;
                enabled: boolean;
                useCount: number;
                lastError: string | null;
            }>,
            rotatingCookie: null as string | null,
            legacyCookie: null as string | null,
            errors: [] as string[],
        };

        // Check Supabase connection
        if (supabaseAdmin) {
            checks.supabaseConnected = true;
            
            // Direct query to admin_cookie_pool
            const { data: poolData, error: poolError } = await supabaseAdmin
                .from('admin_cookie_pool')
                .select('id, status, enabled, use_count, last_error')
                .eq('platform', platform);
            
            if (poolError) {
                checks.errors.push(`Pool query error: ${poolError.message}`);
            } else if (poolData) {
                checks.poolCookies = poolData.map(c => ({
                    id: c.id.substring(0, 8) + '...',
                    status: c.status,
                    enabled: c.enabled,
                    useCount: c.use_count,
                    lastError: c.last_error,
                }));
            }

            // Check legacy admin_cookies table
            const { data: legacyData, error: legacyError } = await supabaseAdmin
                .from('admin_cookies')
                .select('cookie, enabled')
                .eq('platform', platform)
                .single();
            
            if (legacyError && legacyError.code !== 'PGRST116') {
                checks.errors.push(`Legacy query error: ${legacyError.message}`);
            } else if (legacyData?.cookie && legacyData.enabled) {
                checks.legacyCookie = `[FOUND: ${legacyData.cookie.length} chars]`;
            }
        } else {
            checks.errors.push('Supabase admin client not configured');
        }

        // Try getRotatingCookie
        try {
            const cookie = await getRotatingCookie(platform);
            checks.rotatingCookie = cookie ? `[FOUND: ${cookie.length} chars]` : null;
        } catch (e) {
            checks.errors.push(`getRotatingCookie error: ${e instanceof Error ? e.message : 'unknown'}`);
        }

        // Try getAdminCookie (combines pool + legacy)
        let adminCookie: string | null = null;
        try {
            adminCookie = await getAdminCookie(platform as 'facebook' | 'instagram' | 'twitter' | 'weibo');
        } catch (e) {
            checks.errors.push(`getAdminCookie error: ${e instanceof Error ? e.message : 'unknown'}`);
        }

        // Also get pool via utility function
        const poolViaUtil = await getCookiesByPlatform(platform);

        return NextResponse.json({
            success: true,
            platform,
            result: {
                hasCookie: !!adminCookie || !!checks.rotatingCookie,
                cookieSource: checks.rotatingCookie ? 'pool' : checks.legacyCookie ? 'legacy' : 'none',
            },
            checks: {
                ...checks,
                poolViaUtilCount: poolViaUtil.length,
            },
            meta: {
                endpoint: '/api/v1/debug/test-cookie',
                timestamp: new Date().toISOString(),
                env: {
                    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL || !!process.env.SUPABASE_URL,
                    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
                    hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
                },
            },
        });

    } catch (error) {
        console.error('[Debug Test Cookie] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal error',
        }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
