/**
 * Public Service Status API
 * Returns platform status for client-side display
 */

import { NextResponse } from 'next/server';
import { getServiceConfigAsync, loadConfigFromDB } from '@/lib/services/helper/service-config';
import { supabase } from '@/lib/supabase';

export async function GET() {
    await loadConfigFromDB();
    const config = await getServiceConfigAsync();
    
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

    const status = platforms.map(p => ({
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
        },
    }, {
        headers: {
            'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
    });
}
