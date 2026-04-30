/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'media.kudago.com',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/socket.io/:path*',
        destination: 'http://backend:8000/socket.io/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://backend:8000/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
