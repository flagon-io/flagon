import { test, expect } from "@playwright/test";
import { OWNER_STORAGE_STATE, uid } from "./support";

// Deleting and restoring a whole organization, as its owner. Runs as the seeded
// OWNER (no org of their own), not the demo user: the demo user already owns
// their one free org. Every run ends with its org deleted again, and deleted
// orgs don't count toward the owned-org limit, so the suite stays rerunnable.
test.use({ storageState: OWNER_STORAGE_STATE });

test.describe.configure({ mode: "serial" });

test("an owner can delete an org and restore it from Recently deleted", async ({ page }) => {
  const slug = uid("e2e-org");
  const created = await page.request.post("/api/orgs", { data: { name: slug, slug } });
  expect(created.status(), await created.text()).toBe(201);

  try {
    // Delete through the Danger zone: the confirm button stays disabled until
    // the slug is typed exactly.
    await page.goto(`/${slug}/settings`);
    await page.getByRole("button", { name: "Delete organization" }).click();
    const dialog = page.getByRole("alertdialog");
    const confirm = dialog.getByRole("button", { name: "Delete organization" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/to confirm/).fill(slug);
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await page.waitForURL((url) => !url.pathname.startsWith(`/${slug}`));

    // Gone for everyone: the org page and its API both 404.
    expect((await page.goto(`/${slug}`))?.status()).toBe(404);
    expect((await page.request.get(`/api/orgs/${slug}/teams`)).status()).toBe(404);

    // Restore from personal Settings > Organizations.
    await page.goto("/settings/organizations");
    const row = page.getByRole("row").filter({ hasText: slug });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Restore" }).click();
    // It leaves Recently deleted and is back among the live orgs, still owned.
    await expect(row.getByRole("button", { name: "Restore" })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Leave" })).toBeVisible();
    await expect(row).toContainText("owner");

    expect((await page.goto(`/${slug}`))?.status()).toBe(200);
  } finally {
    // Leave the owner with no live org so the next run can create one.
    await page.request.delete(`/api/orgs/${slug}`).catch(() => undefined);
  }
});
