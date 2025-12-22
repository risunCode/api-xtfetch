/**
 * API Middleware
 * Handles CORS, rate limiting, service tier detection, and security headers
 */

import { NextResponse, type NextRequest } from 'next/server';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
    'https://xt-fetch.vercel.app',
    'https://xtfetch.com',
    'https://www.xtfetch.com',
    process.env.ALLOWED_ORIGIN,
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null,
    process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : null, // Frontend dev
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
        '/api/status': { requests: 30, window: 60000 },
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

    // Log API requests with service tier info
    if (pathname.startsWith('/api')) {
        const apiKey = request.nextUrl.searchParams.get('key') || 
                       request.headers.get('X-API-Key');
        const keyInfo = apiKey ? `key=${apiKey.substring(0, 8)}...` : 'no-key';
        console.log(`[${requestId}] ${request.method} ${pathname} [${serviceTier}] [${keyInfo}]`);
    }

    return response;
}

export const config = {
    matcher: [
        // Match all API routes
        '/api/:path*',
    ],
};
