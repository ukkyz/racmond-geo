import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.e2b.app'],
  serverExternalPackages: ['@opentelemetry/sdk-node', '@opentelemetry/auto-instrumentations-node', 'import-in-the-middle', 'require-in-the-middle'],
};

export default nextConfig;
