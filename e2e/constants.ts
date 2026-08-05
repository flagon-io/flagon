/** Shared identity + fixtures for the E2E suite. */
export const E2E = {
  email: process.env.PW_EMAIL ?? "pw+e2e@flagon.test",
  password: process.env.PW_PASSWORD ?? "pw-e2e-password-123",
  name: process.env.PW_NAME ?? "Playwright E2E",
  orgSlug: process.env.PW_ORG_SLUG ?? "pw-e2e",
  orgName: process.env.PW_ORG_NAME ?? "Playwright E2E",
};

/** The Flagon API origin (Hono), for E2E that inject OFREP data like an SDK would. */
export const API_URL = process.env.PW_API_URL ?? "http://localhost:3002";

/** Where the authenticated session is persisted by e2e/auth.setup.ts. */
export const authFile = "e2e/.auth/app.json";

/** A short, unique-ish suffix for entities a test creates (so runs don't collide). */
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(performance.now() % 1000)}`;
}
