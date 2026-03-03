/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    async rewrites() {
        return [
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
