import { test, expect } from "@playwright/test";
import { E2E, uniq } from "../constants";

/** Core flag CRUD wiring: the create dialog submits and lands on the new flag's
 *  detail, and the detail renders. Proves the Modal + Select + server-action path. */
test("create a boolean flag and land on its detail", async ({ page }) => {
  const key = uniq("pw-flag");
  await page.goto(`/${E2E.orgSlug}/flags`);

  await page.getByRole("button", { name: /create flag/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("my-flag").fill(key);
  await dialog.getByRole("button", { name: /^create$/i }).click();

  await expect(page).toHaveURL(new RegExp(`/${E2E.orgSlug}/flags/${key}`));
  await expect(page.getByRole("heading", { name: key })).toBeVisible();
});

test("the flag list shows a newly created flag", async ({ page }) => {
  const key = uniq("pw-listed");
  await page.goto(`/${E2E.orgSlug}/flags`);
  await page.getByRole("button", { name: /create flag/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("my-flag").fill(key);
  await dialog.getByRole("button", { name: /^create$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/${E2E.orgSlug}/flags/${key}`));

  await page.goto(`/${E2E.orgSlug}/flags`);
  await expect(page.getByText(key, { exact: false })).toBeVisible();
});
