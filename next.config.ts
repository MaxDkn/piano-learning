import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // basePath uniquement en CI pour GitHub Pages (MaxDkn/piano-learning)
  basePath: process.env.GITHUB_ACTIONS ? "/piano-learning" : "",
  images: { unoptimized: true },
};

export default nextConfig;
