import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // yahoo-finance2 uses dynamic requires; keep it out of the bundle.
  serverExternalPackages: ['yahoo-finance2'],
};

export default config;
