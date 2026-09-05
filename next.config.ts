import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["exceljs"],
  experimental: { cpus: 2 },
  async redirects() {
    return [
      { source: "/catalog", destination: "/products", permanent: false },
      { source: "/settings/subscriptions", destination: "/settings/plans", permanent: false },
    ];
  },
  // LAN / hotspot hosts. Next blocks /_next/hmr unless the page origin is listed.
  // Extra hosts: ALLOWED_DEV_ORIGINS=172.20.10.11,10.0.0.5
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.137.1",
    "172.20.10.11",
    ...(process.env.ALLOWED_DEV_ORIGINS?.split(",").map((host) => host.trim()).filter(Boolean) ?? []),
  ],
};

export default nextConfig;
