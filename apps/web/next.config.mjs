import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const apiProxyTarget = (process.env.API_PROXY_TARGET || "http://localhost:3001").replace(
  /\/+$/,
  ""
);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  // output: "standalone",
  reactStrictMode: true,
  pageExtensions: ["tsx", "ts"],
  transpilePackages: ["@nexus/ui", "@nexus/core"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
