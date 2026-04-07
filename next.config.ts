import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Suppress Mongoose model-compilation warnings in dev HMR
  serverExternalPackages: ['mongoose'],
  // Optimize for Vercel
  productionBrowserSourceMaps: false,
  // Use Turbopack configuration (Next.js 16 default)
  turbopack: {},
};

export default nextConfig;
