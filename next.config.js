/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        domains: ['localhost'],
    },
    webpack: (config) => {
        // Exclude supabase functions folder from build
        config.module.rules.push({
            test: /supabase\/functions\//,
            loader: 'ignore-loader'
        });
        return config;
    }
}

module.exports = nextConfig
