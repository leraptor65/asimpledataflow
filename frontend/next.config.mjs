/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    turbopack: {},
    allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS ? process.env.ALLOWED_DEV_ORIGINS.split(',') : ['localhost', '127.0.0.1'],
    async rewrites() {
        return [
            {
                source: '/notes/:path*',
                destination: '/',
            },
            {
                source: '/api/:path*',
                destination: `${process.env.BACKEND_URL || 'http://localhost:8080'}/api/:path*`,
            },
            {
                source: '/images/:path*',
                destination: `${process.env.BACKEND_URL || 'http://localhost:8080'}/images/:path*`,
            },
        ]
    },
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                path: false,
            };
        }
        return config;
    },
};

export default nextConfig;
