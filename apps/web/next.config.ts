import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@cs/api", "@cs/core", "@cs/db"],
};

export default nextConfig;
