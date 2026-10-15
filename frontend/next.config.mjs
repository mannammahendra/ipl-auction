/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.INTERNAL_API_URL || 'http://localhost:4000'}/api/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${process.env.INTERNAL_API_URL || 'http://localhost:4000'}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;

