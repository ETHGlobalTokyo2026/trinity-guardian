import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.env.DOCKER_BUILD ? __dirname : path.join(__dirname, "../.."),
};

export default nextConfig;
