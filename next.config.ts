import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["exceljs"],
  experimental: { cpus: 2 },
};

export default nextConfig;
