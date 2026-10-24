import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The site opens on the Kaleva article mock-up. app/page.tsx (the match list) is kept but not shown.
  // beforeFiles: without it, app/page.tsx answers "/" before the rewrite is checked.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/kaleva/index.html" }], afterFiles: [], fallback: [] };
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
