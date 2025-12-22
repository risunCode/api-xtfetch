/**
 * Media Proxy API v1
 * Proxies media downloads from CDN domains (SSRF protected)
 */

import { NextRequest, NextResponse } from 'next/server';
import { type PlatformId } from '@/core/config';
import { getRotatingHeaders } from '@/lib/http/anti-ban';

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
    // YouTube external download API
    'ccproject.serv00.net',
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
        const originalUrl = url;
        url = fullyDecodeUrl(url);
        console.log('[Proxy] Original URL:', originalUrl.substring(0, 100) + '...');
        console.log('[Proxy] Decoded URL:', url.substring(0, 100) + '...');

        // SSRF Prevention
        if (!isAllowedProxyUrl(url)) {
            console.log('[Proxy] URL not allowed:', url.substring(0, 100));
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

        console.log('[Proxy] Fetch response:', response.status, 'for:', url.substring(0, 80) + '...');

        if (!response.ok) {
            console.log('[Proxy] Fetch failed:', response.status, response.statusText);
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