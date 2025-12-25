/**
 * Public Settings API
 * GET: Get public app settings (no auth required)
 * 
 * Returns only public-safe settings like:
 * - update_prompt_mode: 'auto' | 'prompt' | 'silent'
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/database';

// Public settings keys that can be exposed without auth
const PUBLIC_SETTINGS = [
    'update_prompt_mode',
    'maintenance_mode',
    'maintenance_message',
];

export async function GET() {
    if (!supabase) {
        // Return defaults if DB not configured
        return NextResponse.json({
            success: true,
            data: {
                update_prompt_mode: 'prompt',
            }
        });
    }

    try {
        const { data, error } = await supabase
            .from('system_config')
            .select('key, value')
            .in('key', PUBLIC_SETTINGS);

        if (error) {
            console.error('[public-settings] Error:', error);
            // Return defaults on error
            return NextResponse.json({
                success: true,
                data: {
                    update_prompt_mode: 'prompt',
                }
            });
        }

        // Transform to key-value object
        const settings: Record<string, unknown> = {
            update_prompt_mode: 'prompt', // default
        };
        
        for (const item of data || []) {
            settings[item.key] = item.value;
        }

        return NextResponse.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('[public-settings] Error:', error);
        return NextResponse.json({
            success: true,
            data: {
                update_prompt_mode: 'prompt',
            }
        });
    }
}
