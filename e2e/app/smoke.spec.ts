import { test, expect } from "@playwright/test";
import { E2E } from "../constants";

/** Authenticated console smoke — proves the session works and the workspace shell
 *  renders. The nav is a drill-in: the root shows spaces (Flags, Projects…), and
 *  Experiments/Metrics/Holdouts appear once you're inside the Flags area. */
test("workspace loads for the authenticated user", async ({ page }) => {
  await page.goto(`/${E2E.orgSlug}`);
  // Not bounced to auth/onboarding.
  await expect(page).toHaveURL(new RegExp(`/${E2E.orgSlug}(/|$|\\?)`));
  await expect(page.getByRole("link", { name: /^flags$/i }).first()).toBeVisible();
});

test("drills into Flags and reveals the Experiments sub-nav", async ({ page }) => {
  await page.goto(`/${E2E.orgSlug}`);
  await page.getByRole("link", { name: /^flags$/i }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${E2E.orgSlug}/flags`));
  // Drilled-in nav now surfaces the experiments surfaces.
  await expect(page.getByRole("link", { name: /^experiments$/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^metrics$/i }).first()).toBeVisible();
});
