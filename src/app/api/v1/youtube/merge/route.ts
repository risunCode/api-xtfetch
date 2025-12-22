/**
 * YouTube Video + Audio Merge API
 * POST /api/v1/youtube/merge
 * 
 * Merges video-only and audio-only streams using FFmpeg
 * Required because YouTube separates high-quality video from audio
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { Readable } from 'stream';

interface MergeRequest {
    videoUrl: string;
    audioUrl: string;
    filename?: string;
}

// Allowed YouTube CDN domains
const ALLOWED_DOMAINS = ['googlevideo.com', 'youtube.com', 'ytimg.com'];

function isAllowedUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        return ALLOWED_DOMAINS.some(domain => 
            hostname === domain || hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}

// YouTube headers for CDN access
const YOUTUBE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.youtube.com',
    'Referer': 'https://www.youtube.com/',
};

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    
    try {
        const body: MergeRequest = await request.json();
        const { videoUrl, audioUrl, filename = 'youtube_merged.mp4' } = body;

        // Validate required fields
        if (!videoUrl || !audioUrl) {
            return NextResponse.json({
                success: false,
                error: 'Both videoUrl and audioUrl are required',
                meta: { endpoint: '/api/v1/youtube/merge' }
            }, { status: 400 });
        }

        // SSRF Prevention - only allow YouTube CDN
        if (!isAllowedUrl(videoUrl) || !isAllowedUrl(audioUrl)) {
            return NextResponse.json({
                success: false,
                error: 'Only YouTube CDN URLs are allowed',
                meta: { endpoint: '/api/v1/youtube/merge', allowedDomains: ALLOWED_DOMAINS }
            }, { status: 403 });
        }

        // Use FFmpeg to merge video + audio streams directly from URLs
        // -i: input (video first, audio second)
        // -c:v copy: copy video codec (no re-encoding)
        // -c:a aac: encode audio to AAC (compatible with MP4)
        // -movflags frag_keyframe+empty_moov: enable streaming output
        // -f mp4: output format
        // pipe:1: output to stdout
        const ffmpeg = spawn('ffmpeg', [
            '-hide_banner',
            '-loglevel', 'error',
            // Video input with headers
            '-headers', Object.entries(YOUTUBE_HEADERS).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n',
            '-i', videoUrl,
            // Audio input with headers
            '-headers', Object.entries(YOUTUBE_HEADERS).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n',
            '-i', audioUrl,
            // Mapping
            '-map', '0:v:0',  // First video stream from first input
            '-map', '1:a:0',  // First audio stream from second input
            // Codec settings
            '-c:v', 'copy',   // Copy video (no re-encode)
            '-c:a', 'aac',    // Encode audio to AAC
            '-b:a', '192k',   // Audio bitrate
            // Output settings for streaming
            '-movflags', 'frag_keyframe+empty_moov+faststart',
            '-f', 'mp4',
            'pipe:1'          // Output to stdout
        ]);

        // Collect stderr for debugging
        let stderrData = '';
        ffmpeg.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        // Create readable stream from FFmpeg stdout
        const stream = new ReadableStream({
            start(controller) {
                ffmpeg.stdout.on('data', (chunk) => {
                    controller.enqueue(chunk);
                });

                ffmpeg.stdout.on('end', () => {
                    controller.close();
                });

                ffmpeg.on('error', (err) => {
                    console.error('[YouTube Merge] FFmpeg error:', err);
                    controller.error(err);
                });

                ffmpeg.on('close', (code) => {
                    if (code !== 0) {
                        console.error('[YouTube Merge] FFmpeg exited with code:', code, stderrData);
                    }
                });
            },
            cancel() {
                ffmpeg.kill('SIGTERM');
            }
        });

        // Sanitize filename
        const safeFilename = filename.replace(/[^\w\s.-]/g, '_');
        const encodedFilename = encodeURIComponent(filename).replace(/'/g, '%27');

        return new NextResponse(stream, {
            status: 200,
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'X-Content-Type-Options': 'nosniff',
                'Access-Control-Allow-Origin': '*',
            }
        });

    } catch (error) {
        console.error('[YouTube Merge] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Merge failed',
            meta: { endpoint: '/api/v1/youtube/merge' }
        }, { status: 500 });
    }
}

// Support OPTIONS for CORS
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
