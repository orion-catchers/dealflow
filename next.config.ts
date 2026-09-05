import type { NextConfig } from 'next';
const config: NextConfig = { agentRules: false, devIndicators: false, poweredByHeader: false, serverExternalPackages: ['exceljs'], experimental: { cpus: 2 } };
export default config;
