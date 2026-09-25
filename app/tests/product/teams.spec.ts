import { test, expect } from "@playwright/test";
import { DEMO, bestEffortDelete, orgApi, uid } from "./support";

test.describe("teams", () => {
  test("create a team and add a member", async ({ page }) => {
    const slug = uid("e2e-team");
    const name = `E2E ${slug}`;
    try {
      await page.goto(`/${DEMO.org}/teams`);
      await page.getByRole("link", { name: "New team" }).first().click();
      await expect(page).toHaveURL(`/${DEMO.org}/teams/new`);

      await page.getByLabel("Team name").fill(name);
      await page.getByLabel("Slug").fill(slug);
      await page.getByLabel("Description").fill("Created by the product e2e suite");
      await page.getByRole("button", { name: "Create team" }).click();

      await expect(page).toHaveURL(`/${DEMO.org}/teams/${slug}`);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

      // The creator is the team's first maintainer.
      const members = page.getByRole("tabpanel");
      const me = members.getByRole("row").filter({ hasText: DEMO.email });
      await expect(me).toBeVisible();

      // The demo org has one member (the demo user), so exercise "add member" by
      // taking the demo user off the team and adding them back as a member.
      await me.getByRole("button", { name: /^Actions for / }).click();
      await page.getByRole("menuitem", { name: "Remove from team" }).click();
      await expect(members.getByText("No members yet")).toBeVisible();

      await members.getByRole("button", { name: "Add member" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add member" });
      await dialog.getByLabel("Email or username").fill(DEMO.email);
      await dialog.getByRole("button", { name: "Add member" }).click();
      await expect(dialog).toBeHidden();

      const added = members.getByRole("row").filter({ hasText: DEMO.email });
      await expect(added).toBeVisible();
      // Added with the dialog's default role.
      await expect(added.getByRole("combobox")).toHaveText(/member/i);
      await expect(page.getByRole("tab", { name: /Members/ })).toContainText("1");

      // Persisted by the API.
      const res = await page.request.get(orgApi(`/teams/${slug}/members`));
      expect(res.ok()).toBe(true);
      const body = await res.json();
      const items = body.items as { email: string; role: string }[];
      expect(items.find((m) => m.email === DEMO.email)?.role).toBe("member");
    } finally {
      await bestEffortDelete(page, orgApi(`/teams/${slug}`));
    }
  });
});
