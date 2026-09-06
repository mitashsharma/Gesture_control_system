/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // The live preview is served through a *.e2b.app proxy origin.
  allowedDevOrigins: ['*.e2b.app', 'localhost', '127.0.0.1'],
  experimental: {
    // Keep lucide-react / framer-motion barrel imports out of the bundle.
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
};

export default nextConfig;
