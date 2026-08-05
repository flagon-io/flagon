import { test, expect } from "@playwright/test";
import { E2E, API_URL, uniq } from "../constants";

/** The ⌘K palette searches REAL records (not just static destinations): a freshly
 *  created flag is findable by name and navigates to its detail.
 *
 *  The flag is created via the API (cookie-shared) rather than the flags-list UI —
 *  the shared E2E org accumulates many flags across runs and the list render is slow,
 *  which is orthogonal to what this test proves (that ⌘K finds real records). */
test("Cmd-K palette finds a real flag record", async ({ page }) => {
  const key = uniq("pw-cmdk");

  // Create a flag through the management API (an SDK/CI would do the same).
  const created = await page.request.post(`${API_URL}/v1/orgs/${E2E.orgSlug}/flags`, {
    data: { slug: key, type: "boolean" },
  });
  expect(created.ok()).toBeTruthy();

  // Open the palette from the workspace and search for the flag by key.
  await page.goto(`/${E2E.orgSlug}`);
  await page.getByRole("button", { name: /^search$/i }).click();
  const input = page.getByPlaceholder(/find/i);
  await expect(input).toBeVisible();
  await input.fill(key);

  // The record appears as a palette item and selecting it navigates to the flag.
  const item = page.getByRole("option", { name: new RegExp(key) }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/${E2E.orgSlug}/flags/${key}`));
});
