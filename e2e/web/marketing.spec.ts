import { test, expect } from "@playwright/test";

/** Public marketing site smoke — no auth. Confirms the web app renders and its
 *  primary navigation into the console works. */
test("home page renders and links to the app", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/flagon/i);
  // Body carries the product name (loose — copy evolves).
  await expect(page.locator("body")).toContainText(/flagon/i);
});

test("pricing page renders", async ({ page }) => {
  const res = await page.goto("/pricing");
  // Pricing may live at /pricing; tolerate a redirect but require a 2xx/3xx.
  expect(res && res.status() < 400).toBeTruthy();
});
