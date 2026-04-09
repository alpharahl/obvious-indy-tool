import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ hostname: "images.evetech.net" }],
  },
};

export default nextConfig;
