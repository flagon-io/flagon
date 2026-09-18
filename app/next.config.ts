import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output keeps the Docker image small (see app/Dockerfile)
  output: "standalone",
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
