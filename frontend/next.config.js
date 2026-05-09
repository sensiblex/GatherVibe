/** @type {import('next').NextConfig} */
const rewriteTarget = process.env.NEXT_REWRITE_TARGET || 'http://localhost:8000';

const nextConfig = {
  devIndicators: false,
  reactStrictMode: false,
  images: {
    unoptimized: true,
    domains: ['media.kudago.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'media.kudago.com',
        pathname: '/images/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/socket.io/:path*',
        destination: `${rewriteTarget}/socket.io/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${rewriteTarget}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
