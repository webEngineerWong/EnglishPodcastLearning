/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@elp/icons', '@elp/types', '@elp/api-client', '@elp/learning-core', '@elp/player', '@elp/ui'],
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true }
};
export default nextConfig;
