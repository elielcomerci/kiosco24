import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  transpilePackages: ["geist"],
  serverExternalPackages: ["@prisma/client", "@neondatabase/serverless", "pg", "@prisma/adapter-pg"],
};

export default nextConfig;
