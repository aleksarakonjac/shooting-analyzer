import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // Sharing moved onto each coach link (Veze); old bookmarks land there.
  async redirects() {
    return [{ source: '/profil/deljenje', destination: '/profil/veze', permanent: false }];
  },
};

export default nextConfig;
