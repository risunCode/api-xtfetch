/**
 * Media Proxy API
 * Proxies media downloads from CDN domains (SSRF protected)
 */

import { NextRequest, NextResponse } from 'next/server';
import { type PlatformId } from '@/core/config';
import { getRotatingHeaders } from '@/lib/http/anti-ban';

// Allowed CDN domains for proxy (SSRF prevention)
const ALLOWED_PROXY_DOMAINS = [
    // Facebook/Instagram CDN
    'fbcdn.net', 'cdninstagram.com',
    // Twitter CDN
    'twimg.com', 'video.twimg.com', 'pbs.twimg.com',
    // TikTok CDN
    'tiktokcdn.com', 'tiktokcdn-us.com', 'muscdn.com', 'byteoversea.com',
    // Weibo CDN
    'sinaimg.cn', 'weibocdn.com',
    // YouTube CDN
    'googlevideo.com', 'ytimg.com', 'ggpht.com',
];

function isAllowedProxyUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();

        // Block private IPs and localhost
        if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.|localhost|::1)/i.test(hostname)) {
            return false;
        }

        // Block non-http(s) protocols
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }

        // Check against allowed CDN domains
        return ALLOWED_PROXY_DOMAINS.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}

export async function GET(request: NextRequest) {
    try {
        let url = request.nextUrl.searchParams.get('url');
        const filename = request.nextUrl.searchParams.get('filename') || 'download.mp4';
        const platform = (request.nextUrl.searchParams.get('platform') || 'facebook') as PlatformId;
        const headOnly = request.nextUrl.searchParams.get('head') === '1';
        const inline = request.nextUrl.searchParams.get('inline') === '1';

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Fix double-encoded URLs
        if (url.includes('%25')) {
            try { url = decodeURIComponent(url); } catch { /* ignore */ }
        }

        // SSRF Prevention
        if (!isAllowedProxyUrl(url)) {
            return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
        }

        // Build headers
        const headers = getRotatingHeaders({ platform, includeReferer: false });
        headers['Accept-Encoding'] = 'identity';

        // HEAD request - just get file size
        if (headOnly) {
            try {
                const headRes = await fetch(url, { method: 'HEAD', headers, redirect: 'follow' });
                const size = headRes.headers.get('content-length') || '0';
                return new NextResponse(null, { status: 200, headers: { 'x-file-size': size } });
            } catch {
                return new NextResponse(null, { status: 200, headers: { 'x-file-size': '0' } });
            }
        }

        // Check Range header for video seeking
        const rangeHeader = request.headers.get('range');
        if (rangeHeader) {
            headers['Range'] = rangeHeader;
        }

        const response = await fetch(url, { headers, redirect: 'follow' });

        if (!response.ok) {
            return NextResponse.json({ error: `Download failed: ${response.status}` }, { status: response.status });
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const contentLength = response.headers.get('content-length');
        const acceptRanges = response.headers.get('accept-ranges');
        const contentRange = response.headers.get('content-range');

        const responseHeaders = new Headers({ 'Content-Type': contentType });

        if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);
        else responseHeaders.set('Accept-Ranges', 'bytes');

        if (contentRange) responseHeaders.set('Content-Range', contentRange);

        if (inline || contentType.startsWith('video/')) {
            responseHeaders.set('Content-Disposition', 'inline');
            responseHeaders.set('Cache-Control', 'public, max-age=3600');
        } else {
            const safeFilename = filename.replace(/[^\w\s.-]/g, '_');
            const encodedFilename = encodeURIComponent(filename).replace(/'/g, '%27');
            responseHeaders.set('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);
            responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        }

        if (contentLength) responseHeaders.set('Content-Length', contentLength);

        responseHeaders.set('X-Content-Type-Options', 'nosniff');
        responseHeaders.set('X-Download-Options', 'noopen');

        const status = response.status === 206 ? 206 : 200;
        return new NextResponse(response.body, { status, headers: responseHeaders });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Download failed' }, { status: 500 });
    }
}
