/** @type {import('next').NextConfig} */

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
let backendHost = 'localhost';
let backendPort = '4001';
let backendProtocol = 'http';

try {
  const u = new URL(apiUrl.replace(/\/$/, '\u0000').replace(/\u0000$/, ''));
  backendHost = u.hostname;
  backendPort = u.port;
  backendProtocol = u.protocol.replace(':', '') || 'http';
  if (backendPort === '80' || backendPort === '443') backendPort = '';
} catch {
  // fall back to defaults above
}

const remotePatterns = [
  {
    protocol: backendProtocol,
    hostname: backendHost,
    ...(backendPort ? { port: backendPort } : {}),
    pathname: '/uploads/**',
  },
];

// Always allow the common dev origin regardless of env override.
remotePatterns.push({
  protocol: 'http',
  hostname: 'localhost',
  port: '4001',
  pathname: '/uploads/**',
});

const nextConfig = {
  outputFileTracingRoot: __dirname,
  output: 'standalone',
  images: {
    remotePatterns,
  },
};

module.exports = nextConfig;
