/**
 * API Middleware
 * Handles CORS, rate limiting, and security headers
 */

import { NextResponse, type NextRequest } from 'next/server';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
    'https://xt-fetch.vercel.app',
    'https://xtfetch.com',
    'https://www.xtfetch.com',
    process.env.ALLOWED_ORIGIN,
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null,
].filter(Boolean) as string[];

// Security headers
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

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

    // Add request ID for tracing
    const requestId = crypto.randomUUID();
    response.headers.set('X-Request-ID', requestId);

    // Log API requests (optional, for debugging)
    if (pathname.startsWith('/api')) {
        console.log(`[${requestId}] ${request.method} ${pathname}`);
    }

    return response;
}

export const config = {
    matcher: [
        // Match all API routes
        '/api/:path*',
    ],
};
