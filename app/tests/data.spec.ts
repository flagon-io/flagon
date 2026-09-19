import { test, expect } from "@playwright/test";

test.describe("data table", () => {
  test("column visibility toggle hides a column", async ({ page }) => {
    await page.goto("/ui/components/data-table");
    // Both examples render a Status column header; only the power demo has the
    // Columns menu, so toggling there drops the count from 2 to 1.
    await expect(page.getByRole("columnheader", { name: "Status" })).toHaveCount(2);
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: "status" }).click();
    await expect(page.getByRole("columnheader", { name: "Status" })).toHaveCount(1);
  });

  test("faceted filter applies and shows a selection count", async ({ page }) => {
    await page.goto("/ui/components/data-table");
    const filter = page.getByRole("button", { name: "Filter by Status" });
    await filter.click();
    await page.getByRole("option", { name: "Paused" }).click();
    // The trigger now carries a badge with the number of active facets.
    await expect(filter).toContainText("1");
  });
});

test.describe("charts", () => {
  for (const slug of ["bar-chart", "area-chart", "line-chart", "pie-chart", "radar-chart", "radial-chart"]) {
    test(`${slug} renders a Recharts surface`, async ({ page }) => {
      await page.goto(`/ui/components/${slug}`);
      await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
    });
  }
});
