import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.e2b.app'],
  serverExternalPackages: ['@opentelemetry/api', '@opentelemetry/core', '@opentelemetry/resources', '@opentelemetry/sdk-node', '@opentelemetry/auto-instrumentations-node', '@opentelemetry/exporter-trace-otlp-http', 'import-in-the-middle', 'require-in-the-middle'],
};

export default nextConfig;
