import { test, expect } from "@playwright/test";
import { DEMO, bestEffortDelete, orgApi, uid } from "./support";

type Token = { id: string; name: string; prefix: string };

async function listTokens(page: import("@playwright/test").Page): Promise<Token[]> {
  const res = await page.request.get(orgApi("/tokens"));
  expect(res.ok()).toBe(true);
  return ((await res.json()).tokens ?? []) as Token[];
}

test.describe("organization access tokens", () => {
  test("create a token, see its secret once, then revoke it", async ({ page }) => {
    const name = uid("e2e-token");
    try {
      await page.goto(`/${DEMO.org}/settings/tokens`);
      await page.getByRole("link", { name: "Generate new token" }).click();
      await expect(page).toHaveURL(`/${DEMO.org}/settings/tokens/new`);

      const generate = page.getByRole("button", { name: "Generate token" });
      await page.getByLabel("Token name").fill(name);
      // A token needs at least one permission before it can be generated.
      await expect(generate).toBeDisabled();
      await page.getByRole("checkbox", { name: /read:project/ }).check();
      await generate.click();

      // The secret is shown exactly once, right after creation.
      await expect(page.getByText(/Copy it now/)).toBeVisible();
      const secret = (await page.locator("code").filter({ hasText: /^flagon_oat/ }).innerText()).trim();
      expect(secret).toMatch(/^flagon_oat/);

      await page.getByRole("button", { name: "Done" }).click();
      await expect(page).toHaveURL(`/${DEMO.org}/settings/tokens`);

      const row = page.getByRole("row").filter({ hasText: name });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Read projects");
      // Never again: the list shows only the prefix, not the secret.
      await expect(page.getByText(secret)).toHaveCount(0);
      expect(JSON.stringify(await listTokens(page))).not.toContain(secret);

      await row.getByRole("button", { name: "Revoke" }).click();
      const dialog = page.getByRole("dialog", { name: `Revoke ${name}?` });
      await dialog.getByRole("button", { name: "Revoke token" }).click();
      await expect(dialog).toBeHidden();
      await expect(row).toBeHidden();
      expect((await listTokens(page)).some((t) => t.name === name)).toBe(false);
    } finally {
      // If a step failed before the revoke, revoke by id so tokens don't pile up.
      const leftover = (await listTokens(page).catch(() => [] as Token[])).find((t) => t.name === name);
      if (leftover) await bestEffortDelete(page, orgApi(`/tokens/${leftover.id}`));
    }
  });
});
