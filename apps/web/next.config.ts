import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@cs/api", "@cs/core", "@cs/db"],
  // PGlite loads its WASM + data files from disk at runtime, so don't bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
