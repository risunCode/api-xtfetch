/**
 * Public Service Status API v1
 * Returns platform status for client-side display
 */

import { NextResponse } from 'next/server';
import { serviceConfigGetAsync, serviceConfigLoad } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        await serviceConfigLoad();
        const config = await serviceConfigGetAsync();
        
        const platforms = Object.values(config.platforms);
        const maintenance = config.maintenanceType !== 'off' && config.maintenanceMode;
        const maintenanceMessage = config.maintenanceMessage;

        let maintenanceContent: string | null = null;
        let maintenanceLastUpdated: string | null = null;
        
        if (maintenance && supabase) {
            const { data } = await supabase
                .from('global_settings')
                .select('key, value')
                .in('key', ['maintenance_content', 'maintenance_last_updated']);
            
            if (data) {
                for (const row of data) {
                    if (row.key === 'maintenance_content') maintenanceContent = row.value;
                    if (row.key === 'maintenance_last_updated') maintenanceLastUpdated = row.value;
                }
            }
        }

        const status = platforms.map((p: { id: string; name: string; enabled: boolean }) => ({
            id: p.id,
            name: p.name,
            enabled: p.enabled,
            status: !p.enabled ? 'offline' : maintenance ? 'maintenance' : 'active',
        }));

        return NextResponse.json({
            success: true,
            data: {
                maintenance,
                maintenanceMessage: maintenance ? maintenanceMessage : null,
                maintenanceContent: maintenance ? maintenanceContent : null,
                maintenanceLastUpdated: maintenance ? maintenanceLastUpdated : null,
                platforms: status,
                apiVersion: 'v1',
                endpoints: {
                    premium: '/api/v1?key={API_KEY}&url={URL}',
                    playground: '/api/v1/playground?url={URL}',
                    publicservices: '/api/v1/publicservices (POST)',
                    proxy: '/api/v1/proxy?url={URL}',
                    status: '/api/v1/status'
                }
            },
            meta: {
                endpoint: '/api/v1/status',
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            }
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch service status',
            meta: {
                endpoint: '/api/v1/status',
                timestamp: new Date().toISOString()
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