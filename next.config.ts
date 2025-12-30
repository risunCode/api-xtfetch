import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // API-only mode - no pages needed
  // All routes are in /api/*
  
  // Custom headers for all responses
  // NOTE: CORS is handled dynamically by middleware.ts for security
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Powered-By', value: 'XT-Fetch-Engine-RC' },
          // Access-Control-Allow-Origin removed - handled by middleware for strict CORS
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          // Security headers
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
  
  // Disable default X-Powered-By: Next.js
  poweredByHeader: false,
  
  // Allow grammy to use Node.js specific features
  // Required for Telegram bot webhook handling
  serverExternalPackages: ['grammy'],
};

export default nextConfig;
