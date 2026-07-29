import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs";

// Baseline security headers on every response, matching the marketing site.
// No Content-Security-Policy yet: a correct CSP for Next's inline hydration
// needs per-request nonces; everything here is safe to apply unconditionally.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Author docs as .mdx pages alongside .tsx.
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  // @flagon/design ships raw TS/TSX (no build step), so Next compiles it here.
  transpilePackages: ["@flagon/design"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// First-party MDX. No remark/rehype plugins: the component mapping in
// src/mdx-components.tsx does the styling, and the custom CodeBlock/CodeTabs
// components (not a build-time highlighter) handle code — so the pipeline stays
// plugin-free and builds cleanly under Turbopack.
const withMDX = createMDX({});

const config = withMDX(nextConfig);

/**
 * Sentry only touches the build when a DSN is configured (see the marketing
 * site for the rationale). Set NEXT_PUBLIC_SENTRY_DSN to activate.
 */
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : config;
