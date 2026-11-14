import "dotenv/config";
import type { NextConfig } from "next";

// Silence baseline-browser-mapping stale data warnings during build.
process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= "1";
process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA ??= "1";

const nextConfig: NextConfig = {
  // Explicitly configure Turbopack to silence Next.js 16 warning about having a webpack config
  // without a turbopack config. We don't need any special Turbopack options right now.
  turbopack: {},
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion'],
  },
  env: {
    BROWSERSLIST_IGNORE_OLD_DATA: "1",
    BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA: "1",
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent AWS Amplify from trying to build node-canvas
      config.resolve.alias["canvas"] = false;
    }
    return config;
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    qualities: [100, 75],
  },

  redirects: async () => {
    return [
      // Consolidate legacy URL variants to a single, crawlable canonical URL.
      {
        source: "/index.html",
        destination: "/",
        permanent: true,
      },
      {
        source: "/docusign-alternative",
        destination: "/alternatives/docusign",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.signworkflow.com",
          },
        ],
        destination: "https://signworkflow.com/:path*",
        permanent: true,
      },
    ];
  },

  // 👇 Fix for COOP/COEP blocking Google OAuth popup
  headers: async () => {
    return [
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "unsafe-none",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
