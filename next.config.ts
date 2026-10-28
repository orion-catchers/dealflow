import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["exceljs"],
  experimental: { cpus: 2 },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
      // Framing, plugin, base-URL and form-target restrictions; script sources are left to Next.js defaults.
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
    ];
    if (process.env.NODE_ENV === "production") {
      security.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers: security }];
  },
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
