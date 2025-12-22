/**
 * Health Check Endpoint
 * Used by Railway/Render for health monitoring
 */

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
    const health: Record<string, any> = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        node: process.version,
    };

    // Check yt-dlp availability
    try {
        const { stdout } = await execAsync('python3 -c "import yt_dlp; print(yt_dlp.version.__version__)"', {
            timeout: 5000,
        });
        health.ytdlp = stdout.trim();
    } catch {
        health.ytdlp = 'not available';
    }

    return NextResponse.json(health);
}
