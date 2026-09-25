import { defineConfig, devices } from "@playwright/test";

// Integration tests run against the real app. Locally they reuse the dev server
// you already have running (or start `next dev`); in CI they run against a
// production build (`next start`), which CI builds in a prior step.
//
// Two suites share this config:
//   - "chromium": the design system, driven through its live /ui docs. Needs no
//     API or database, so it runs anywhere the app boots.
//   - "product": the real product end to end (app gateway -> Go API -> Postgres),
//     signed in as the seeded demo user. Needs the API up and `npm run db:seed`
//     run; its "setup" dependency logs in once and saves the session.
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Specs are read-only against the /ui docs, so they parallelize safely. The
  // a11y sweep is split into one test per page (see tests/_a11y.spec.ts) so it
  // fans out across these workers instead of running as one serial marathon.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ["product/**"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup",
      testDir: "./tests/product",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "product",
      testDir: "./tests/product",
      dependencies: ["setup"],
      // Spec files run in parallel across workers; the steps of one flow inside
      // a file run in order. Every spec creates uniquely named resources, so the
      // suite is rerunnable against a persistent local database.
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], storageState: "tests/product/.auth/demo.json" },
    },
  ],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
