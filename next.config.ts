import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lean, self-contained server bundle for the single-container self-host image.
  output: 'standalone',
  // Keep DB drivers out of bundling; they run in Node route handlers.
  serverExternalPackages: ['postgres', '@neondatabase/serverless'],

  async headers() {
    // CORS is handled centrally in src/proxy.ts. These are just surface markers.
    return [
      { source: '/api/v1/:path*', headers: [{ key: 'X-Flagon-Surface', value: 'management' }] },
      { source: '/api/ofrep/:path*', headers: [{ key: 'X-Flagon-Surface', value: 'evaluation' }] },
    ];
  },
};

export default nextConfig;
