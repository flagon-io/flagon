import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @flagon/design ships raw TS/TSX (no build step), so Next has to compile it
  // alongside the app rather than treating it as a prebuilt dependency.
  transpilePackages: ["@flagon/design"],
};

export default nextConfig;
