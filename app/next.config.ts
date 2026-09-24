import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output keeps the self-host Docker image small (see app/Dockerfile,
  // which sets NEXT_BUILD_STANDALONE and runs `node server.js`). It's gated to that
  // build alone: Vercel doesn't consume it, and enabling it for a plain `next start`
  // (our CI e2e server) warns "next start does not work with output: standalone".
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Compile the workspace design system from source (no separate build step).
  transpilePackages: ["@flagon-io/ui"],
  env: {
    // Expose "is this provider configured" (not secrets) to the client so
    // social sign-in buttons can render always-present but enabled/disabled.
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    ).toString(),
    NEXT_PUBLIC_GITHUB_AUTH_ENABLED: Boolean(
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
    ).toString(),
  },
};

export default nextConfig;
