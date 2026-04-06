import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Suppress Mongoose model-compilation warnings in dev HMR
  serverExternalPackages: ['mongoose'],
};

export default nextConfig;
