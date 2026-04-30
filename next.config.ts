import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	// Optimize for Vercel
	productionBrowserSourceMaps: false,
	// Use Turbopack configuration (Next.js 16 default)
	turbopack: {},
	// Google profile / Drive-hosted uploads (user avatar, signature, print assets)
	images: {
		minimumCacheTTL: 60 * 60 * 24 * 30,
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'lh3.googleusercontent.com',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: '*.googleusercontent.com',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: 'drive.google.com',
				pathname: '/**',
			},
		],
	},
	allowedDevOrigins: ['10.255.254.20'],
};

export default nextConfig;
