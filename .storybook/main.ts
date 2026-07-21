import type { StorybookConfig } from "@storybook/nextjs-vite";

/**
 * Storybook, as a workbench for the presentational layer.
 *
 * Scoped deliberately. Most of this codebase is async server components that
 * query Postgres behind row-level security, and there is nothing Storybook can
 * usefully do with those: mocking a tenant-scoped query to render a page is
 * building a second, lying implementation of the app. The components worth
 * having here are the ones with no data dependency at all, where the only
 * question is how they look at their edges (empty, long, overflowing) - and
 * those edges are exactly what is tedious to reach by clicking through the
 * real app.
 *
 * Kept off the critical path on purpose: it is a devDependency with its own
 * scripts, and neither `npm run build` nor `npm test` knows it exists. A
 * broken Storybook must never be able to block a deploy.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["../public"],
  // No phoning home from a build that runs on contributors' machines.
  core: { disableTelemetry: true },
};

export default config;
