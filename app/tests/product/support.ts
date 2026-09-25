import { expect, type Page } from "@playwright/test";

// Shared bits for the product suite. These specs drive the real product (app
// gateway -> Go API -> Postgres) as the seeded demo user, so they need the API
// running and `npm run db:seed` done. Keep the defaults in step with
// app/scripts/seed.mjs.

export const DEMO = {
  email: process.env.SEED_EMAIL ?? "demo@flagon.dev",
  username: process.env.SEED_USERNAME ?? "demo",
  password: process.env.SEED_PASSWORD ?? "password12345",
  org: process.env.SEED_ORG_SLUG ?? "demo",
};

/**
 * A second seeded user who owns NO org, for flows that create and delete a whole
 * organization. The demo user already owns their one free org, so they can't.
 * Seed with SEED_SKIP_ORG=1 (see app/scripts/seed.mjs and the CI e2e-product job).
 */
export const OWNER = {
  email: process.env.E2E_OWNER_EMAIL ?? "owner@flagon.dev",
  username: process.env.E2E_OWNER_USERNAME ?? "e2e-owner",
  password: process.env.E2E_OWNER_PASSWORD ?? "password12345",
};

/** Where the setup project saves the signed-in session (see playwright.config.ts). */
export const DEMO_STORAGE_STATE = "tests/product/.auth/demo.json";

/** Where the setup project saves the org owner's session (see auth.setup.ts). */
export const OWNER_STORAGE_STATE = "tests/product/.auth/owner.json";

/**
 * A unique, slug-safe suffix so every run creates fresh resources and the suite
 * can rerun against a persistent local database without collisions.
 */
export function uid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/** The org-scoped gateway base for API calls made with the page's session. */
export function orgApi(path = ""): string {
  return `/api/orgs/${DEMO.org}${path}`;
}

/**
 * Best-effort cleanup through the app gateway, authenticated by the page's
 * session cookie. Cleanup failures never fail a test: the assertions already ran.
 */
export async function bestEffortDelete(page: Page, path: string): Promise<void> {
  await page.request.delete(path).catch(() => undefined);
}

/** Create a project through the gateway (for specs whose subject is not creation). */
export async function createProjectViaApi(page: Page, name: string, slug: string) {
  const res = await page.request.post(orgApi("/projects"), {
    data: { name, slug, description: "", repository_url: "" },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; slug: string; name: string };
}
