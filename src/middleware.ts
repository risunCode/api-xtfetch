/**
 * API Middleware
 * Handles CORS, rate limiting, service tier detection, and security headers
 */

import { NextResponse, type NextRequest } from 'next/server';

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
// CORS: Allowed origins
// ═══════════════════════════════════════════════════════════════

// Parse ALLOWED_ORIGINS from env (comma-separated)
const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
    'https://xt-fetch.vercel.app',
    'https://xtfetch.com',
    'https://www.xtfetch.com',
    'https://xtfetch-api-production.up.railway.app',
    ...envOrigins,
    // Development origins
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
].filter(Boolean) as string[];

// Rate limits per service tier
const RATE_LIMITS = {
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

// Security headers
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

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

function getCorsHeaders(origin: string | null): Record<string, string> {
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Requested-With',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
    };

    // Check if origin is allowed
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    } else if (process.env.NODE_ENV === 'development') {
        // Allow all in development
        headers['Access-Control-Allow-Origin'] = origin || '*';
    }

    return headers;
}

export function middleware(request: NextRequest) {
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
    // CORS: Handle preflight
    // ═══════════════════════════════════════════════════════════════

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, {
            status: 204,
            headers: {
                ...getCorsHeaders(origin),
                ...SECURITY_HEADERS,
            },
        });
    }

    // Detect service tier
    const serviceTier = getServiceTier(pathname, request);
    
    // Create response
    const response = NextResponse.next();

    // Add CORS headers
    const corsHeaders = getCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Add security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    // Add service tier info to headers
    response.headers.set('X-Service-Tier', serviceTier);
    response.headers.set('X-API-Version', pathname.startsWith('/api/v1') ? 'v1' : 'legacy');

    // Add request ID for tracing
    const requestId = crypto.randomUUID();
    response.headers.set('X-Request-ID', requestId);

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
