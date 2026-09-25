import { test, expect } from "@playwright/test";
import { DEMO, bestEffortDelete, createProjectViaApi, orgApi, uid } from "./support";

test.describe("audit log", () => {
  test("records the org changes just made", async ({ page }) => {
    const slug = uid("e2e-audit");
    const name = `E2E ${slug}`;
    const team = uid("e2e-audit-team");

    // Take a few real actions through the gateway, as the demo user.
    await createProjectViaApi(page, name, slug);
    const patched = await page.request.patch(orgApi(`/projects/${slug}`), {
      data: { description: "audited edit" },
    });
    expect(patched.ok(), await patched.text()).toBe(true);
    const deleted = await page.request.delete(orgApi(`/projects/${slug}`));
    expect(deleted.ok(), await deleted.text()).toBe(true);
    const createdTeam = await page.request.post(orgApi("/teams"), {
      data: { name: `E2E ${team}`, slug: team, description: "" },
    });
    expect(createdTeam.status(), await createdTeam.text()).toBe(201);

    try {
      await page.goto(`/${DEMO.org}/settings/audit`);
      await expect(page.getByRole("tab", { name: "events" })).toHaveAttribute("aria-selected", "true");

      // Narrow to this run's project: created, updated, then deleted, newest first.
      await page.getByPlaceholder("Search audit logs...").fill(slug);
      const rows = page.getByRole("row").filter({ hasText: name });
      await expect(rows.filter({ hasText: "project.deleted" })).toBeVisible();
      await expect(rows.filter({ hasText: "project.updated" })).toBeVisible();
      await expect(rows.filter({ hasText: "project.created" })).toBeVisible();
      await expect(rows.filter({ hasText: `created project ${name}` })).toBeVisible();
      await expect(rows.first()).toContainText("project.deleted");
      // Attributed to the acting user.
      await expect(rows.first()).toContainText(DEMO.username);

      await page.getByPlaceholder("Search audit logs...").fill(team);
      await expect(
        page.getByRole("row").filter({ hasText: "team.created" }).filter({ hasText: team }),
      ).toBeVisible();
    } finally {
      await bestEffortDelete(page, orgApi(`/teams/${team}`));
    }
  });
});
