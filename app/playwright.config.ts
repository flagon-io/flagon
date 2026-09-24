import { defineConfig, devices } from "@playwright/test";

// Integration tests run against the real app. Locally they reuse the dev server
// you already have running (or start `next dev`); in CI they run against a
// production build (`next start`), which CI builds in a prior step.
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // In CI there's no .env.local, so give Better Auth an explicit origin; without
    // it the server warns that the base URL is unset and derives it per-request.
    // Locally we leave env alone so .env.local governs the real dev values.
    env: process.env.CI ? { BETTER_AUTH_URL: baseURL } : undefined,
  },
});
