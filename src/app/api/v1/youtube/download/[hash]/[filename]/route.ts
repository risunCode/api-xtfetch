/**
 * YouTube Download Serve Route
 * GET /api/v1/youtube/download/{hash}/{filename}
 */

import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { logger } from '@/lib/services/helper/logger';

const DOWNLOAD_BASE = path.join(tmpdir(), 'xtfetch-yt-api');

interface DownloadMeta {
    hash: string;
    filepath: string;
    filename: string;
    size: number;
    title: string;
    quality: string;
    createdAt: number;
    expiresAt: number;
}

function getDownloadMeta(hash: string): DownloadMeta | null {
    try {
        const metaPath = path.join(DOWNLOAD_BASE, hash, 'meta.json');
        if (!existsSync(metaPath)) {
            logger.debug('youtube', `Meta not found: ${hash}`);
            return null;
        }
        const data = JSON.parse(readFileSync(metaPath, 'utf8'));
        if (Date.now() > data.expiresAt) {
            logger.debug('youtube', `Meta expired: ${hash}`);
            try { rmSync(path.join(DOWNLOAD_BASE, hash), { recursive: true, force: true }); } catch {}
            return null;
        }
        return data;
    } catch (e) {
        logger.error('youtube', e);
        return null;
    }
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ hash: string; filename: string }> }
) {
    try {
        const { hash, filename } = await params;
        logger.debug('youtube', `Download request: ${hash}`);

        // Get meta from file
        const meta = getDownloadMeta(hash);

        if (!meta) {
            return NextResponse.json({
                success: false,
                error: 'Download not found or expired',
                hint: 'Request a new download URL from /api/v1/youtube'
            }, { status: 404 });
        }

        // Check file exists
        if (!existsSync(meta.filepath)) {
            logger.warn('youtube', `File not found: ${meta.filepath}`);
            return NextResponse.json({
                success: false,
                error: 'File not found',
                hint: 'Request a new download URL from /api/v1/youtube'
            }, { status: 404 });
        }

        const stats = statSync(meta.filepath);
        const decodedFilename = decodeURIComponent(filename);

        logger.debug('youtube', `Streaming: ${stats.size} bytes`);

        // Stream file to response
        const stream = createReadStream(meta.filepath);

        const webStream = new ReadableStream({
            start(ctrl) {
                stream.on('data', (chunk) => ctrl.enqueue(chunk));
                stream.on('end', () => ctrl.close());
                stream.on('error', (e) => ctrl.error(e));
            },
            cancel() {
                stream.destroy();
            }
        });

        return new NextResponse(webStream, {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': String(stats.size),
                'Content-Disposition': `attachment; filename="${decodedFilename}"`,
                'Cache-Control': 'private, max-age=600',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error) {
        logger.error('youtube', error);
        return NextResponse.json({
            success: false,
            error: 'Download failed'
        }, { status: 500 });
    }
}
