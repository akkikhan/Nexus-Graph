/** @type {import('next').NextConfig} */
const apiProxyTarget = (process.env.API_PROXY_TARGET || "http://localhost:3001").replace(
  /\/+$/,
  ""
);

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  pageExtensions: ["tsx", "ts"],
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
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
