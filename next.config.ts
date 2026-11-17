import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    if (process.env.NODE_ENV === 'development' || !process.env.VERCEL) {
      const hubOrigin = process.env.HUB_API_ORIGIN ?? 'http://127.0.0.1:8000';
      return [
        {
          source: '/api/hub/:path*',
          destination: `${hubOrigin}/api/hub/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
