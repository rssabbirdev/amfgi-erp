import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	// Optimize for Vercel
	productionBrowserSourceMaps: false,
	// Keep Prisma on Node resolution so Turbopack does not bundle a stale generated client.
	serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
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
	allowedDevOrigins: ['10.255.254.55'],
	async headers() {
		return [
			{
				source: '/:path*',
				headers: [
					{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet, noimageindex' },
				],
			},
		];
	},
};

export default nextConfig;
