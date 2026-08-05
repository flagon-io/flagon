import { test, expect } from "@playwright/test";
import { E2E, uniq } from "../constants";

/** Metric creation exercising the value-field selector: choosing Sum enables the
 *  value-field input (the "most correct" value model wired this session). */
test("create a sum metric with a value field", async ({ page }) => {
  const name = uniq("pw-metric");
  await page.goto(`/${E2E.orgSlug}/experiments/metrics`);

  await page.getByRole("button", { name: /create metric/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByPlaceholder("Checkout completed").fill(name);
  await dialog.getByPlaceholder("checkout_completed").fill("purchase");

  // Value field is disabled for conversion; switching to Sum enables it.
  await expect(dialog.getByPlaceholder("amount")).toBeDisabled();
  await dialog.getByLabel("Metric type").click();
  await page.getByRole("option", { name: /^sum$/i }).click();
  await expect(dialog.getByPlaceholder("amount")).toBeEnabled();
  await dialog.getByPlaceholder("amount").fill("amount");

  await dialog.getByRole("button", { name: /^create$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
});

/** The confirm dialog (ConfirmDialog/useConfirm) appears for a destructive action
 *  and cancels cleanly without deleting. */
test("deleting a metric asks for confirmation and Cancel aborts", async ({ page }) => {
  const name = uniq("pw-confirm");
  await page.goto(`/${E2E.orgSlug}/experiments/metrics`);
  await page.getByRole("button", { name: /create metric/i }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Checkout completed").fill(name);
  await dialog.getByPlaceholder("checkout_completed").fill("signup");
  await dialog.getByRole("button", { name: /^create$/i }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByText(name, { exact: false }).first();
  await expect(row).toBeVisible();
  // Trigger delete (icon button with an accessible name) on the metric's row.
  await page.getByRole("button", { name: /delete/i }).first().click();

  // The house confirm dialog appears; Cancel leaves the metric intact.
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/delete metric/i);
  await dialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
});
