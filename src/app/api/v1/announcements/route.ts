/**
 * Announcements API v1 (Public Read Only)
 * GET - Get active announcements for a page
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/core/database';

export async function GET(request: NextRequest) {
    try {
        if (!supabase) {
            return NextResponse.json({ 
                success: false, 
                error: 'Database not configured',
                meta: {
                    endpoint: '/api/v1/announcements'
                }
            }, { status: 500 });
        }

        const page = request.nextUrl.searchParams.get('page') || 'home';

        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('enabled', true)
            .contains('pages', [page])
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ 
                success: false, 
                error: error.message,
                meta: {
                    endpoint: '/api/v1/announcements'
                }
            }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            data,
            meta: {
                endpoint: '/api/v1/announcements',
                page: page,
                count: data?.length || 0
            }
        }, {
            headers: {
                // Cache for 60 seconds, allow stale for 2 minutes while revalidating
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            },
        });
    } catch (error) {
        return NextResponse.json({ 
            success: false, 
            error: 'Failed to fetch announcements',
            meta: {
                endpoint: '/api/v1/announcements'
            }
        }, { status: 500 });
    }
}

// Support OPTIONS for CORS
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}