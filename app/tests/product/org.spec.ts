import { test, expect } from "@playwright/test";
import { DEMO, uid } from "./support";

test.describe("organization shell", () => {
  test("the org dashboard loads for the signed-in user", async ({ page }) => {
    await page.goto(`/${DEMO.org}`);
    // The dashboard leads with the agent surface, not a wall of stats.
    await expect(page.getByPlaceholder("Ask Flagon to do something, or search...")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The org sidebar is live and links into the org's areas.
    await expect(page.getByRole("link", { name: "Projects", exact: true }).first()).toHaveAttribute(
      "href",
      `/${DEMO.org}/projects`,
    );
  });

  test("an unauthenticated visitor is sent to log in", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto(`/${DEMO.org}`);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
    await context.close();
  });

  test("the people page lists the demo user", async ({ page }) => {
    await page.goto(`/${DEMO.org}/people`);
    const row = page.getByRole("row").filter({ hasText: DEMO.email });
    await expect(row).toBeVisible();
  });

  test("an org the user is not a member of is a generic 404", async ({ page }) => {
    // A slug nobody owns: the answer must be identical to "does not exist", so it
    // never reveals whether an org is real.
    const res = await page.goto(`/${uid("no-such-org")}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /This page can.t be found/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to your dashboard" })).toBeVisible();
  });
});
