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
      // The pricing chapter was retitled when pricing moved to cost plus a
      // stated markup.
      {
        source: "/handbook/priced-below-cost",
        destination: "/handbook/priced-close-to-cost",
        permanent: true,
      },
      // Pages from when Flagon was itself the product. Each product now has its
      // own site, so old links land on the portfolio instead of a 404. Not
      // permanent: these paths may be reused.
      ...["/pricing", "/docs", "/docs/:path*", "/roadmap", "/changelog", "/customers"].map(
        (source) => ({ source, destination: "/products", permanent: false }),
      ),
    ];
  },
};

export default nextConfig;
