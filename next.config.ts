import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // API-only mode - no pages needed
  // All routes are in /api/*
  
  // Custom headers for all responses
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'X-Powered-By',
            value: 'XT-Fetch-Engine-RC',
          },
        ],
      },
    ];
  },
  
  // Disable default X-Powered-By: Next.js
  poweredByHeader: false,
};

export default nextConfig;
