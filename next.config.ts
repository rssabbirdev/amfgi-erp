import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Suppress Mongoose model-compilation warnings in dev HMR
  serverExternalPackages: ['mongoose'],
  // Optimize for Vercel
  productionBrowserSourceMaps: false,
  // Use Turbopack configuration (Next.js 16 default)
  turbopack: {},
  // Allow Google Drive images via lh3.googleusercontent.com
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
