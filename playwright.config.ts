import { defineConfig, devices } from "@playwright/test";

/**
 * Repo-wide end-to-end tests across the running dev servers (web :3000, app :3001).
 *
 * These drive the REAL dev servers — they do not start them. Bring the stack up
 * first (`npm run dev`, plus local Postgres) and then `npm run e2e`. We use the
 * INSTALLED Chrome via `channel: "chrome"`, so there is no bundled-browser
 * download (matches apps/app/qa/capture.mjs).
 *
 * Auth: the `setup` project (e2e/auth.setup.ts) signs a stable E2E user in through
 * the real auth API, provisions an isolated Hobby org, and saves the session as
 * storageState; the `app` project reuses it. The `web` project is unauthenticated
 * (public marketing site).
 *
 * Serial by default: the `app` suite mutates one shared local database, so parallel
 * workers would race — same discipline as the Vitest integration suites.
 */
const WEB_URL = process.env.PW_WEB_URL ?? "http://localhost:3000";
const APP_URL = process.env.PW_APP_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    channel: "chrome",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "web",
      testDir: "./e2e/web",
      use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: WEB_URL },
    },
    {
      name: "app",
      testDir: "./e2e/app",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        baseURL: APP_URL,
        storageState: "e2e/.auth/app.json",
      },
    },
  ],
});
