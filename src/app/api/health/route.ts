/**
 * Health Check Endpoint
 * Used by Railway/Render for health monitoring
 * 
 * Usage:
 * - GET /api/health         → Fast simple check (for Railway/Docker)
 * - GET /api/health?full=true → Full check including yt-dlp (for debugging)
 * 
 * @module health
 */

import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const fullCheck = searchParams.get('full') === 'true';

    // Base health response - always fast
    const health: Record<string, unknown> = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        node: process.version,
    };

    // Full check: include yt-dlp version (slower, spawns Python)
    if (fullCheck) {
        try {
            const { stdout } = await execAsync('python3 -c "import yt_dlp; print(yt_dlp.version.__version__)"', {
                timeout: 10000, // 10s timeout for cold containers
            });
            health.ytdlp = stdout.trim();
        } catch {
            health.ytdlp = 'not available';
        }
    }

    return NextResponse.json(health);
}
