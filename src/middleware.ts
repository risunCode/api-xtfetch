/**
 * API Middleware
 * Handles CORS, rate limiting, service tier detection, and security headers
 */

import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit } from '@/lib/database';

// ═══════════════════════════════════════════════════════════════
// SECURITY: Blocked paths and patterns
// ═══════════════════════════════════════════════════════════════

const BLOCKED_PATHS = [
    '/.env',
    '/.git',
    '/.gitignore',
    '/.htaccess',
    '/wp-admin',
    '/wp-login',
    '/wp-content',
    '/phpinfo',
    '/phpmyadmin',
    '/config.php',
    '/admin.php',
    '/shell',
    '/cmd',
    '/eval',
    '/.aws',
    '/.docker',
    '/node_modules',
    '/package.json',
    '/tsconfig.json',
];

const SUSPICIOUS_PATTERNS = [
    /\.\.\//,              // Directory traversal
    /\.\.%2f/i,            // Encoded traversal
    /%2e%2e/i,             // Double encoded
    /\x00/,                // Null bytes
    /<script/i,            // XSS attempts
    /javascript:/i,        // JS protocol
    /union\s+select/i,     // SQL injection
    /select\s+.*\s+from/i, // SQL injection
    /insert\s+into/i,      // SQL injection
    /drop\s+table/i,       // SQL injection
    /exec\s*\(/i,          // Command injection
    /eval\s*\(/i,          // Eval injection
];

// ═══════════════════════════════════════════════════════════════
// SECURITY: Anti-Crawl / Bot Detection
// ═══════════════════════════════════════════════════════════════

// Known crawler/scanner User-Agents
const BOT_USER_AGENTS = [
    /nikto/i,
    /sqlmap/i,
    /nmap/i,
    /masscan/i,
    /zgrab/i,
    /gobuster/i,
    /dirbuster/i,
    /wfuzz/i,
    /ffuf/i,
    /nuclei/i,
    /httpx/i,
    /burpsuite/i,
    /zaproxy/i,
    /acunetix/i,
    /nessus/i,
    /openvas/i,
    /w3af/i,
    /arachni/i,
    /skipfish/i,
    /whatweb/i,
    /wpscan/i,
    /joomscan/i,
    /crawler/i,
    /spider/i,
    /scanner/i,
    /exploit/i,
    /attack/i,
    /hack/i,
    /pentest/i,
    /security.*test/i,
    /^python-requests/i,
    /^curl\//i,
    /^wget\//i,
    /^Go-http-client/i,
    /^Java\//i,
    /^libwww-perl/i,
    /^PHP\//i,
];

// Honeypot paths - if accessed, immediately block
const HONEYPOT_PATHS = [
    '/admin.php',
    '/administrator',
    '/backup',
    '/config.bak',
    '/database.sql',
    '/dump.sql',
    '/.env.backup',
    '/secrets',
    '/credentials',
    '/passwords',
    '/api/debug',
    '/api/test/rce',
    '/api/shell',
    '/actuator',
    '/debug/vars',
    '/elmah.axd',
    '/trace.axd',
];

// Crawler rate limit (much stricter)
const CRAWLER_RATE_LIMIT = { requests: 3, window: 10000 }; // 3 requests per 10 seconds

// ═══════════════════════════════════════════════════════════════
// CORS: Allowed origins
// ═══════════════════════════════════════════════════════════════

// Parse ALLOWED_ORIGINS from env (comma-separated)
const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
    // Production - DownAria
    'https://downaria.vercel.app',        // Frontend
    'https://xtfetch-api-production.up.railway.app', // Backend direct
    ...envOrigins,
    // Development origins
    'http://localhost:3001',              // Frontend dev
    'http://localhost:3002',              // Backend dev
].filter(Boolean) as string[];

// Rate limits per service tier
const RATE_LIMITS: Record<string, Record<string, { requests: number; window: number }>> = {
    premium: {
        '/api/v1': { requests: 100, window: 60000 }, // 100/min with API key
    },
    free: {
        '/api/v1/publicservices': { requests: 10, window: 60000 }, // 10/min no key
        '/api/v1/playground': { requests: 5, window: 120000 }, // 5/2min (GET & POST)
        '/api/v1/proxy': { requests: 30, window: 60000 },
        '/api/v1/status': { requests: 30, window: 60000 },
        '/api/v1/announcements': { requests: 10, window: 60000 },
        '/api/v1/push/subscribe': { requests: 5, window: 60000 },
    },
    admin: {
        '/api/admin/*': { requests: 200, window: 60000 }, // Higher limits for admin
    },
    legacy: {
        '/api': { requests: 60, window: 60000 }, // Legacy endpoint
        '/api/playground': { requests: 5, window: 120000 },
        '/api/proxy': { requests: 30, window: 60000 },
    }
};

// ═══════════════════════════════════════════════════════════════
// SECURITY: Auth Brute Force Protection
// ═══════════════════════════════════════════════════════════════

// Stricter rate limits for authentication endpoints
const AUTH_RATE_LIMITS: Record<string, { requests: number; window: number }> = {
    '/api/admin/session': { requests: 5, window: 900000 },  // 5 attempts per 15 minutes
    '/api/admin/login': { requests: 5, window: 900000 },    // 5 attempts per 15 minutes
    '/api/v1/auth': { requests: 10, window: 1800000 },      // 10 attempts per 30 minutes
};

// Get rate limit config for a given path and tier
// Checks AUTH_RATE_LIMITS first (stricter) for brute force protection
function getRateLimitConfig(pathname: string, tier: string): { requests: number; window: number } | null {
    // SECURITY: Check auth endpoints first - stricter limits for brute force protection
    if (AUTH_RATE_LIMITS[pathname]) {
        return AUTH_RATE_LIMITS[pathname];
    }

    // Check for partial auth path matches (e.g., /api/admin/session matches /api/admin/session)
    for (const [authPath, config] of Object.entries(AUTH_RATE_LIMITS)) {
        if (pathname.startsWith(authPath)) {
            return config;
        }
    }

    const tierLimits = RATE_LIMITS[tier];
    if (!tierLimits) return null;

    // Check for exact match first
    if (tierLimits[pathname]) {
        return tierLimits[pathname];
    }

    // Check for wildcard match (e.g., '/api/admin/*')
    for (const [path, config] of Object.entries(tierLimits)) {
        if (path.endsWith('/*')) {
            const basePath = path.slice(0, -2);
            if (pathname.startsWith(basePath)) {
                return config;
            }
        }
    }

    return null;
}

// Security headers
// NOTE: CSP relaxed for homepage to allow external fonts/icons (Google Fonts, FontAwesome)
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Stricter CSP for API routes only
const API_CSP = "default-src 'none'; frame-ancestors 'none'";

// Relaxed CSP for homepage (needs external fonts/icons)
const PAGE_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'";

// Service tier detection
function getServiceTier(pathname: string, request: NextRequest): string {
    // Admin endpoints
    if (pathname.startsWith('/api/admin/')) return 'admin';

    // v1 endpoints
    if (pathname.startsWith('/api/v1')) {
        const apiKey = request.nextUrl.searchParams.get('key') ||
            request.headers.get('X-API-Key');

        // Premium tier (API key required)
        if (pathname === '/api/v1' && apiKey) return 'premium';

        // Free tier (no API key)
        return 'free';
    }

    // Legacy endpoints
    return 'legacy';
}

/**
 * Get CORS origin for a request
 * Returns the origin if it's in the allowed list, null otherwise
 */
function getCorsOrigin(request: NextRequest): string | null {
    const origin = request.headers.get('Origin');
    if (!origin) return null;

    // Check if origin is in allowed list
    if (ALLOWED_ORIGINS.includes(origin)) {
        return origin;
    }

    // Allow localhost in development
    if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost:')) {
        return origin;
    }

    return null;
}

function getCorsHeaders(origin: string | null, pathname: string = '', request?: NextRequest): Record<string, string> {
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Requested-With',
        'Access-Control-Max-Age': '86400',
    };

    // Special case: /api/v1/proxy needs broader access for media embedding
    // But still validate origin when present
    if (pathname.startsWith('/api/v1/proxy')) {
        if (origin) {
            // If origin is present, validate it
            const validOrigin = request ? getCorsOrigin(request) : (ALLOWED_ORIGINS.includes(origin) ? origin : null);
            if (validOrigin) {
                headers['Access-Control-Allow-Origin'] = validOrigin;
                headers['Access-Control-Allow-Credentials'] = 'true';
            }
            // If origin is present but invalid, don't set CORS headers (browser will block)
        } else {
            // No origin = server-to-server or direct browser navigation (img src, etc.)
            // Allow these for media embedding functionality
            headers['Access-Control-Allow-Origin'] = '*';
        }
        return headers;
    }

    // Strict CORS for other endpoints
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        // Origin is in allowed list - grant access
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
    } else if (origin) {
        // Check for localhost in development
        if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost:')) {
            headers['Access-Control-Allow-Origin'] = origin;
            headers['Access-Control-Allow-Credentials'] = 'true';
        }
        // Browser from unknown origin = NO Access-Control-Allow-Origin = blocked by browser
    }
    // No origin = server-to-server or direct access - no CORS header (blocked by browser)

    return headers;
}

export async function middleware(request: NextRequest) {
    const origin = request.headers.get('origin');
    const pathname = request.nextUrl.pathname;
    const fullUrl = request.url;

    // ═══════════════════════════════════════════════════════════════
    // SECURITY: Block suspicious requests
    // ═══════════════════════════════════════════════════════════════

    // Block known malicious paths
    const lowerPath = pathname.toLowerCase();
    for (const blocked of BLOCKED_PATHS) {
        if (lowerPath.startsWith(blocked) || lowerPath.includes(blocked)) {
            return new NextResponse(
                JSON.stringify({ success: false, error: 'Not found' }),
                { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
        }
    }

    // Block suspicious patterns in URL
    for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(fullUrl) || pattern.test(pathname)) {
            return new NextResponse(
                JSON.stringify({ success: false, error: 'Bad request' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ANTI-CRAWL: Bot detection and honeypot
    // ═══════════════════════════════════════════════════════════════

    const userAgent = request.headers.get('user-agent') || '';
    const forwarded = request.headers.get('x-forwarded-for');
    const clientIp = forwarded ? forwarded.split(',')[0].trim() :
        request.headers.get('x-real-ip') || 'unknown';

    // Honeypot trap - if accessed, block IP with 500 (hide that it's a trap)
    for (const honeypot of HONEYPOT_PATHS) {
        if (lowerPath === honeypot || lowerPath.startsWith(honeypot)) {
            // Random delay to slow down scanners
            await new Promise(r => setTimeout(r, Math.random() * 2000 + 500));
            return new NextResponse(
                JSON.stringify({ success: false, error: 'Internal server error' }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS } }
            );
        }
    }

    // Bot User-Agent detection - apply stricter rate limits
    const isBot = BOT_USER_AGENTS.some(pattern => pattern.test(userAgent));

    if (isBot) {
        // Check crawler rate limit (very strict: 3 requests per 10 seconds)
        const crawlerKey = `crawler:${clientIp}`;
        const { success: crawlerAllowed } = await rateLimit(
            crawlerKey,
            CRAWLER_RATE_LIMIT.requests,
            Math.ceil(CRAWLER_RATE_LIMIT.window / 1000)
        );

        if (!crawlerAllowed) {
            // Random delay + 429 to slow down
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 1000));
            return new NextResponse(
                JSON.stringify({ success: false, error: 'Too many requests' }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': '60',
                        ...SECURITY_HEADERS
                    }
                }
            );
        }
    }

    // Empty/missing User-Agent is also suspicious
    if (!userAgent || userAgent.length < 10) {
        const suspiciousKey = `suspicious:${clientIp}`;
        const { success: suspiciousAllowed } = await rateLimit(suspiciousKey, 5, 60);

        if (!suspiciousAllowed) {
            return new NextResponse(
                JSON.stringify({ success: false, error: 'Bad request' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS } }
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // CORS: Handle preflight
    // ═══════════════════════════════════════════════════════════════

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, {
            status: 204,
            headers: {
                ...getCorsHeaders(origin, pathname, request),
                ...SECURITY_HEADERS,
            },
        });
    }

    // Detect service tier
    const serviceTier = getServiceTier(pathname, request);

    // ═══════════════════════════════════════════════════════════════
    // RATE LIMITING: Enforce with Redis
    // ═══════════════════════════════════════════════════════════════

    const rateLimitConfig = getRateLimitConfig(pathname, serviceTier);
    if (rateLimitConfig) {
        // Get client IP for rate limit key
        const forwarded = request.headers.get('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0].trim() :
            request.headers.get('x-real-ip') || 'unknown';

        const rateLimitKey = `ratelimit:${ip}:${pathname}`;
        const windowSeconds = Math.ceil(rateLimitConfig.window / 1000);

        const { success, remaining } = await rateLimit(
            rateLimitKey,
            rateLimitConfig.requests,
            windowSeconds
        );

        if (!success) {
            // Check if this is an auth endpoint - return 500 for security
            const isAuthEndpoint = Object.keys(AUTH_RATE_LIMITS).some(
                path => pathname.startsWith(path)
            );

            const statusCode = isAuthEndpoint ? 500 : 429;
            const message = isAuthEndpoint
                ? 'Internal server error'
                : 'Too many requests';

            return new NextResponse(
                JSON.stringify({
                    success: false,
                    error: message,
                    retryAfter: windowSeconds,
                }),
                {
                    status: statusCode,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-RateLimit-Limit': String(rateLimitConfig.requests),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': String(Math.ceil((Date.now() + rateLimitConfig.window) / 1000)),
                        'Retry-After': String(windowSeconds),
                        ...SECURITY_HEADERS,
                    }
                }
            );
        }

        // Add rate limit headers to response later
        // We need to store remaining for the response headers
        request.headers.set('x-ratelimit-remaining', String(remaining));
    }

    // Create response
    const response = NextResponse.next();

    // Add CORS headers
    const corsHeaders = getCorsHeaders(origin, pathname, request);
    Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Add security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Apply appropriate CSP based on route type
    const isApiRoute = pathname.startsWith('/api/');
    response.headers.set('Content-Security-Policy', isApiRoute ? API_CSP : PAGE_CSP);

    // Add service tier info to headers
    response.headers.set('X-Service-Tier', serviceTier);
    response.headers.set('X-API-Version', pathname.startsWith('/api/v1') ? 'v1' : 'legacy');

    // Add request ID for tracing
    const requestId = crypto.randomUUID();
    response.headers.set('X-Request-ID', requestId);

    // Add rate limit headers based on service tier and path
    // Use remaining from enforcement if available, otherwise show full limit
    const storedRemaining = request.headers.get('x-ratelimit-remaining');
    const responseRateLimitConfig = getRateLimitConfig(pathname, serviceTier);
    if (responseRateLimitConfig) {
        const resetTime = Date.now() + responseRateLimitConfig.window;
        response.headers.set('X-RateLimit-Limit', String(responseRateLimitConfig.requests));
        response.headers.set('X-RateLimit-Remaining', storedRemaining || String(responseRateLimitConfig.requests));
        response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000))); // Unix timestamp in seconds
    }

    return response;
}

export const config = {
    matcher: [
        // Match all API routes
        '/api/:path*',
        // Match root for homepage
        '/',
        // Block common attack paths
        '/.env',
        '/.git/:path*',
        '/wp-admin/:path*',
        '/wp-login.php',
    ],
};
