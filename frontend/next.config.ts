import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Proyek ini tidak memakai ESLint; pemeriksaan tipe tetap berjalan saat build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
