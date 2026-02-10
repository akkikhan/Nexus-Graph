/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ["@nexus/ui", "@nexus/core"],
    images: {
        domains: ["avatars.githubusercontent.com", "gitlab.com"],
    },
    async redirects() {
        return [
            {
                source: "/",
                destination: "/inbox",
                permanent: false,
            },
        ];
    },
};

export default nextConfig;
