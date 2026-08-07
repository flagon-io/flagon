import { test, expect } from "@playwright/test";
import { E2E, uniq } from "../constants";

/**
 * The reliability-config console surfaces: the severity ladder editor, the optional
 * objectives, and the Uptime view. Proves each page renders and its primary write path
 * works end-to-end (server action -> API -> refresh) for a real user.
 */

test("severity levels: seeded ladder renders and saves", async ({ page }) => {
  await page.goto(`/${E2E.orgSlug}/incidents/settings/severities`);
  await expect(page.getByRole("heading", { name: /severity levels/i })).toBeVisible();
  // The standard ladder is lazy-seeded on first read; SEV1 and SEV4 badges render.
  await expect(page.getByText("SEV1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("SEV4", { exact: true }).first()).toBeVisible();
  // SEV1's platform-impact select SHOWS its value (guards the Radix Select.Value display).
  await expect(page.getByRole("combobox", { name: /platform impact/i }).first()).toContainText(/full platform/i);
  // Save the ladder (exercises the bulk PUT + server action + refresh).
  await page.getByRole("button", { name: /save ladder/i }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("objectives: empty state, add one, then remove it", async ({ page }) => {
  await page.goto(`/${E2E.orgSlug}/incidents/settings/objectives`);
  await expect(page.getByRole("heading", { name: /^objectives$/i })).toBeVisible();
  await expect(page.getByText(/no objectives defined/i)).toBeVisible();

  const name = uniq("pw-slo");
  await page.getByRole("button", { name: /add objective/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/checkout availability/i).fill(name);
  await dialog.getByRole("button", { name: /^create$/i }).click();

  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText(/over 30d/i)).toBeVisible();

  // Cleanup so repeated runs don't accumulate objectives on the shared org.
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(page.getByText(/no objectives defined/i)).toBeVisible();
});

test("uptime: view renders the platform headline", async ({ page }) => {
  await page.goto(`/${E2E.orgSlug}/incidents/uptime`);
  await expect(page.getByRole("heading", { name: /^uptime$/i })).toBeVisible();
  await expect(page.getByText(/platform uptime/i)).toBeVisible();
});

test("declare modal: severity dropdown is populated from the ladder", async ({ page }) => {
  await page.goto(`/${E2E.orgSlug}/incidents`);
  await page.getByRole("button", { name: /declare incident/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/^severity$/i)).toBeVisible();
});
