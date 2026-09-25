import { test as setup, expect } from "@playwright/test";
import { DEMO, DEMO_STORAGE_STATE, OWNER, OWNER_STORAGE_STATE } from "./support";

// Log in once through the real login form as the seeded demo user and save the
// session, so every product spec starts signed in. Fills the fields explicitly:
// the dev-only demo autofill is absent from the production build CI runs.
setup("log in as the demo user", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(DEMO.email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();

  // "/" routes a signed-in user to their org; the login page must be left behind.
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });

  // The session must actually be good for the gateway: the org page renders.
  await page.goto(`/${DEMO.org}`);
  await expect(page.getByPlaceholder("Ask Flagon to do something, or search...")).toBeVisible();

  await page.context().storageState({ path: DEMO_STORAGE_STATE });
});

// The org owner (a seeded user with no org, see OWNER) logs in once here too, so
// the org delete/restore spec reuses a session instead of hitting the sign-in
// rate limit on every run.
setup("log in as the org owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  await page.context().storageState({ path: OWNER_STORAGE_STATE });
});
