import { test, expect } from "@playwright/test";
import { E2E, uniq } from "../constants";

/**
 * End-to-end proof that the reliability product (incidents + on-call) works for a
 * real user, driven entirely through the CONSOLE — the counterpart to the flags and
 * experiment lifecycle specs. Covers on-call resolution ("who's on now"), escalation
 * policy CRUD, and the full incident lifecycle (declare -> acknowledge -> post update
 * -> resolve) with the server actions + revalidatePath refresh path.
 *
 * The escalation CLIMB (escalated_level 0 -> N) runs on a cron with no HTTP trigger,
 * so it stays covered by the API integration test; here we prove the console surface.
 * A fresh Hobby org has a SINGLE member (the E2E user, as owner => canManage), so the
 * rotation asserts the single-member on-call case.
 */

test("on-call: create a schedule and resolve who is on-call now", async ({ page }) => {
  const name = uniq("pw-sched");
  await page.goto(`/${E2E.orgSlug}/incidents/on-call`);

  await page.getByRole("button", { name: /new schedule/i }).click();
  // exact: the Name ("Primary") and Key ("primary") placeholders differ only by case.
  await page.getByPlaceholder("Primary", { exact: true }).fill(name);
  await page.getByRole("button", { name: /^create$/i }).click();

  // The card renders; add the only member to the rotation and save.
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: E2E.name, pressed: false }).click();
  await page.getByRole("button", { name: /save rotation/i }).click();

  // "who's on now" resolves to the single member.
  await expect(page.getByText(new RegExp(`${E2E.name}\\s+on-call`))).toBeVisible();
});

test("escalation: create an escalation policy", async ({ page }) => {
  const name = uniq("pw-policy");
  await page.goto(`/${E2E.orgSlug}/incidents/escalation`);

  await page.getByRole("button", { name: /new policy/i }).click();
  await page.getByPlaceholder("Sev1 response").fill(name);
  await page.getByRole("button", { name: /^create$/i }).click();

  await expect(page.getByText(name, { exact: true })).toBeVisible();
});

test("incident lifecycle: declare -> acknowledge -> post update -> resolve", async ({ page }) => {
  const title = uniq("pw-incident");
  await page.goto(`/${E2E.orgSlug}/incidents`);

  // Declare (no affected service needed; a fresh org has no projects).
  await page.getByRole("button", { name: /declare incident/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Checkout is failing").fill(title);
  await dialog.getByRole("button", { name: /^declare$/i }).click();

  // Landed on the incident detail.
  await expect(page).toHaveURL(new RegExp(`/${E2E.orgSlug}/incidents/\\d+`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Acknowledge -> the button is replaced by an "Acknowledged" marker.
  await page.getByRole("button", { name: /acknowledge/i }).click();
  await expect(page.getByText("Acknowledged", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /acknowledge/i })).toHaveCount(0);

  // Post a timeline update.
  const update = "Rolling back the bad deploy.";
  await page.getByPlaceholder("What changed?").fill(update);
  await page.getByRole("button", { name: /post update/i }).click();
  await expect(page.getByText(update)).toBeVisible();

  // Resolve -> the resolved state shows (the header status pill) and the
  // "Post an update" card disappears.
  await page.getByRole("button", { name: /^resolve$/i }).click();
  await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();
  await expect(page.getByPlaceholder("What changed?")).toHaveCount(0);
});
