import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Brand lives in the handbook now (like PostHog's /brand). Keep the short
      // URL working and point it at the brand section's front door.
      {
        source: "/brand",
        destination: "/handbook/brand-overview",
        permanent: true,
      },
      // The pricing chapter's earlier URL.
      {
        source: "/handbook/priced-below-cost",
        destination: "/handbook/priced-close-to-cost",
        permanent: true,
      },
      // g1t was retired; its old page lands on the portfolio.
      { source: "/products/g1t", destination: "/products", permanent: false },
      // Product pages live on each product's own site, so these old paths land
      // on the portfolio instead of a 404. Not permanent: they may be reused.
      ...["/pricing", "/docs", "/docs/:path*", "/roadmap", "/changelog", "/customers"].map(
        (source) => ({ source, destination: "/products", permanent: false }),
      ),
    ];
  },
};

export default nextConfig;
