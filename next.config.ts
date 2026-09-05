import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["exceljs"],
  experimental: { cpus: 2 },
  // LAN / hotspot hostname (Windows often binds 192.168.137.1). Needed so
  // Turbopack HMR is not blocked when the page is opened on that origin.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.137.1"],
};

export default nextConfig;
