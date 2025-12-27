/**
 * Media Proxy API v1
 * Proxies media downloads from CDN domains (SSRF protected)
 */

import { NextRequest, NextResponse } from 'next/server';
import { isIP } from 'net';
import dns from 'dns/promises';
import { type PlatformId } from '@/core/config';
import { httpGetRotatingHeaders as getRotatingHeaders } from '@/lib/http';

// Allowed CDN domains for proxy (SSRF prevention)
// Subdomains are automatically allowed (e.g., *.googlevideo.com)
const ALLOWED_PROXY_DOMAINS = [
    // Facebook/Instagram CDN
    'fbcdn.net', 'cdninstagram.com',
    // Twitter CDN
    'twimg.com',
    // TikTok CDN
    'tiktokcdn.com', 'tiktokcdn-us.com', 'muscdn.com', 'byteoversea.com',
    // Weibo CDN
    'sinaimg.cn', 'weibocdn.com',
    // YouTube CDN (covers all *.googlevideo.com including manifest, rr1---, etc.)
    'googlevideo.com', 'ytimg.com', 'ggpht.com',
];

// Comprehensive private IP detection
function isPrivateIP(ip: string): boolean {
    // IPv4 private/reserved ranges
    const ipv4Patterns = [
        /^127\./,                              // Loopback
        /^10\./,                               // Class A private
        /^172\.(1[6-9]|2\d|3[01])\./,          // Class B private
        /^192\.168\./,                         // Class C private
        /^169\.254\./,                         // Link-local
        /^0\./,                                // Current network
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT
        /^192\.0\.0\./,                        // IETF Protocol
        /^192\.0\.2\./,                        // TEST-NET-1
        /^198\.51\.100\./,                     // TEST-NET-2
        /^203\.0\.113\./,                      // TEST-NET-3
        /^224\./,                              // Multicast
        /^240\./,                              // Reserved
        /^255\.255\.255\.255$/,                // Broadcast
    ];

    // IPv6 private/reserved ranges
    const ipv6Patterns = [
        /^::1$/i,                              // Loopback
        /^fe80:/i,                             // Link-local
        /^fc00:/i,                             // Unique local
        /^fd00:/i,                             // Unique local
        /^ff00:/i,                             // Multicast
        /^::$/,                                // Unspecified
        /^::ffff:(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.)/i, // IPv4-mapped private
    ];

    return [...ipv4Patterns, ...ipv6Patterns].some(pattern => pattern.test(ip));
}

// SSRF-safe URL validation with DNS resolution
async function isAllowedProxyUrl(url: string): Promise<boolean> {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();

        // 1. Block non-http(s) protocols
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }

        // 2. Block obvious localhost variations
        if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
            return false;
        }

        // 3. Resolve DNS to get actual IPs (prevents DNS rebinding)
        let resolvedIPs: string[] = [];

        if (isIP(hostname)) {
            // Direct IP address
            resolvedIPs = [hostname];
        } else {
            // Resolve hostname to IPs
            try {
                const ipv4 = await dns.resolve4(hostname).catch(() => []);
                const ipv6 = await dns.resolve6(hostname).catch(() => []);
                resolvedIPs = [...ipv4, ...ipv6];
            } catch {
                return false; // DNS resolution failed
            }
        }

        // 4. Check ALL resolved IPs - block if ANY is private
        if (resolvedIPs.length === 0) {
            return false;
        }

        for (const ip of resolvedIPs) {
            if (isPrivateIP(ip)) {
                return false;
            }
        }

        // 5. Check against allowed CDN domains whitelist
        return ALLOWED_PROXY_DOMAINS.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}

// Helper to fully decode URL - handle edge cases
function fullyDecodeUrl(url: string): string {
    let decoded = url;
    let maxDecodes = 10;

    // Keep decoding until stable
    while (maxDecodes-- > 0) {
        try {
            const newDecoded = decodeURIComponent(decoded);
            if (newDecoded === decoded) break; // No change, fully decoded
            decoded = newDecoded;
        } catch {
            // If decode fails, try to decode only the encoded parts
            // This handles partially encoded URLs
            break;
        }
    }

    // Extra pass: replace any remaining %25XX sequences (triple+ encoded)
    let extraPass = 5;
    while (extraPass-- > 0 && decoded.includes('%25')) {
        decoded = decoded.replace(/%25([0-9A-Fa-f]{2})/g, '%$1');
        try {
            decoded = decodeURIComponent(decoded);
        } catch {
            break;
        }
    }

    return decoded;
}

// Rewrite m3u8 playlist to proxy all segment URLs (for iOS native HLS)
function rewriteM3u8Playlist(content: string, baseUrl: string, platform: string, proxyBaseUrl: string): string {
    const lines = content.split('\n');
    const rewritten: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments (but keep them in output)
        if (!trimmed || trimmed.startsWith('#')) {
            rewritten.push(line);
            continue;
        }

        // This is a segment URL - make it absolute and wrap in proxy
        let segmentUrl = trimmed;
        if (!segmentUrl.startsWith('http')) {
            // Relative URL - make absolute
            if (segmentUrl.startsWith('/')) {
                const base = new URL(baseUrl);
                segmentUrl = `${base.protocol}//${base.host}${segmentUrl}`;
            } else {
                const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                segmentUrl = baseDir + segmentUrl;
            }
        }

        // Wrap in proxy URL
        const proxiedSegment = `${proxyBaseUrl}?url=${encodeURIComponent(segmentUrl)}&platform=${platform}&inline=1`;
        rewritten.push(proxiedSegment);
    }

    return rewritten.join('\n');
}

export async function GET(request: NextRequest) {
    try {
        let url = request.nextUrl.searchParams.get('url');
        const filename = request.nextUrl.searchParams.get('filename') || 'download.mp4';
        const platform = (request.nextUrl.searchParams.get('platform') || 'facebook') as PlatformId;
        const headOnly = request.nextUrl.searchParams.get('head') === '1';
        const inline = request.nextUrl.searchParams.get('inline') === '1';
        const hlsRewrite = request.nextUrl.searchParams.get('hls') === '1'; // Rewrite m3u8 for native HLS

        if (!url) {
            return NextResponse.json({
                success: false,
                error: 'URL parameter is required',
                meta: {
                    endpoint: '/api/v1/proxy',
                    example: 'https://api-xtfetch.vercel.app/api/v1/proxy?url=https://video.twimg.com/...'
                }
            }, { status: 400 });
        }

        // Fix double/triple-encoded URLs - decode aggressively until stable
        url = fullyDecodeUrl(url);

        // SSRF Prevention
        if (!await isAllowedProxyUrl(url)) {
            return NextResponse.json({
                success: false,
                error: 'URL not allowed - only CDN domains are supported',
                meta: {
                    endpoint: '/api/v1/proxy',
                    allowedDomains: ALLOWED_PROXY_DOMAINS
                }
            }, { status: 403 });
        }

        // Build headers - use YouTube-specific headers for googlevideo.com
        const isYouTubeCDN = url.includes('googlevideo.com') || url.includes('youtube.com');
        let headers: Record<string, string>;

        if (isYouTubeCDN) {
            // YouTube - use iOS/macOS Safari headers + cookie for better compatibility
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://www.youtube.com',
                'Referer': 'https://www.youtube.com/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site',
                // YouTube cookies for authenticated access
                'Cookie': 'HSID=AYUEBFWhl1zgagYbZ; SSID=AJpqiHjjTpf3Wq1OL; SID=g.a0004QhQ6Q49BdfuAbQVcn1l3ZpVtb14IyKU9O5PjqpMOT6VQJadqE-YQgVNJKoNGtSiIg9eCQACgYKAV8SARMSFQHGX2Miol4n7KEoMF4eQLOt45bLZRoVAUF8yKpBQXMrKWEzLHusr481aXMs0076; LOGIN_INFO=AFmmF2swRQIgU1faSsNJ7UcHMXtyeViEVhLSAo04U1lsXNOyCR_Ywj8CIQCD3j8akvfMnBz6DyY2Rivd8Mp0nvHSbWSyZzk0cEk4rA:QUQ3MjNmd2JkSkQzRGxtdV9ZWk5aSUdfd0JFNHNFXzhUcHc5cHFtclg5Q2NJQ1pwSmU1SkExRjNzRGZXU0dhdXU1WGFmbW1fNzdJcmZDS1ptWkVwbl9IZFllS0lxVGdMQlFIbkxsZi1GRXVtUElNOW1JY3NwMVc4ZkRLQVFnS3kyNzM4VENPWlp2Sk5vajc1N19wUlNsSVA3bHpXMkhSMEFR; PREF=tz=Asia.Jakarta',
            };
        } else {
            headers = getRotatingHeaders({ platform, includeReferer: false });
        }
        headers['Accept-Encoding'] = 'identity';

        // HEAD request - just get file size
        if (headOnly) {
            try {
                const headRes = await fetch(url, { method: 'HEAD', headers, redirect: 'follow' });
                const size = headRes.headers.get('content-length') || '0';
                return new NextResponse(null, {
                    status: 200,
                    headers: {
                        'x-file-size': size,
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Expose-Headers': 'x-file-size',
                    }
                });
            } catch {
                return new NextResponse(null, {
                    status: 200,
                    headers: {
                        'x-file-size': '0',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Expose-Headers': 'x-file-size',
                    }
                });
            }
        }

        // Check Range header for video seeking
        const rangeHeader = request.headers.get('range');
        if (rangeHeader) {
            headers['Range'] = rangeHeader;
        }

        // CDNs often redirect, allow redirects for all media CDNs
        const response = await fetch(url, { headers, redirect: 'follow' });

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: `Download failed: ${response.status}`,
                meta: {
                    endpoint: '/api/v1/proxy',
                    statusCode: response.status
                }
            }, { status: response.status });
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const contentLength = response.headers.get('content-length');
        const acceptRanges = response.headers.get('accept-ranges');
        const contentRange = response.headers.get('content-range');

        // If this is an m3u8 playlist and hls=1, rewrite segment URLs to use proxy
        // This enables native HLS playback on iOS which doesn't support HLS.js
        if (hlsRewrite && (url.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('x-mpegURL'))) {
            const m3u8Content = await response.text();

            // Get the proxy base URL from request
            const proxyBaseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}/api/v1/proxy`;

            // Rewrite the playlist
            const rewrittenContent = rewriteM3u8Playlist(m3u8Content, url, platform, proxyBaseUrl);

            return new NextResponse(rewrittenContent, {
                status: 200,
                headers: {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        const responseHeaders = new Headers({ 'Content-Type': contentType });

        if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);
        else responseHeaders.set('Accept-Ranges', 'bytes');

        if (contentRange) responseHeaders.set('Content-Range', contentRange);

        if (inline || contentType.startsWith('video/') || contentType.startsWith('audio/')) {
            responseHeaders.set('Content-Disposition', 'inline');
            responseHeaders.set('Cache-Control', 'public, max-age=3600');
        } else {
            const safeFilename = filename.replace(/[^\w\s.-]/g, '_');
            const encodedFilename = encodeURIComponent(filename).replace(/'/g, '%27');
            responseHeaders.set('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);
            responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        }

        if (contentLength) responseHeaders.set('Content-Length', contentLength);

        // CORS headers for browser playback
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

        responseHeaders.set('X-Content-Type-Options', 'nosniff');
        responseHeaders.set('X-Download-Options', 'noopen');

        const status = response.status === 206 ? 206 : 200;
        return new NextResponse(response.body, { status, headers: responseHeaders });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Download failed',
            meta: {
                endpoint: '/api/v1/proxy'
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
            'Access-Control-Allow-Headers': 'Content-Type, Range',
        },
    });
}