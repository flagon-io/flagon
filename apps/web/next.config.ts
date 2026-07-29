import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs";

// Baseline security headers on every response. Deliberately NOT including a
// Content-Security-Policy: a correct CSP for Next's inline hydration needs
// per-request nonces, and a wrong one breaks the app — worth doing, but not as
// a rushed pre-launch change. Everything here is safe to apply unconditionally.
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
  // Author the /docs section as .mdx pages alongside the marketing .tsx pages.
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  // @flagon/design ships raw TS/TSX (no build step), so Next has to compile it
  // alongside the app rather than treating it as a prebuilt dependency.
  transpilePackages: ["@flagon/design"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// First-party MDX for the docs. No remark/rehype plugins: the mapping in
// src/mdx-components.tsx does the styling and the custom CodeBlock/CodeTabs
// components handle code, so the pipeline builds cleanly under Turbopack.
const withMDX = createMDX({});

/**
 * Sentry only touches the build when a DSN is configured. Without it — local
 * dev, CI, any deploy not yet wired — we export the plain config untouched, so
 * the production build is exactly what it was before Sentry was added and
 * cannot be broken by it. Set NEXT_PUBLIC_SENTRY_DSN to activate; add
 * SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN to also upload source maps.
 */
const config = withMDX(nextConfig);

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
