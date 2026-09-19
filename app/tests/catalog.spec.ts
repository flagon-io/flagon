import { test, expect } from "@playwright/test";
import { components } from "../src/components/docs/registry";

// Baseline coverage for the whole library: every stable component's docs page
// (its live example) must render without runtime errors and show a preview. New
// components are covered automatically the moment they're flipped to "stable".
const stable = components.filter((c) => c.status === "stable");

test.describe("every stable component page renders", () => {
  for (const c of stable) {
    test(c.slug, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(`/ui/components/${c.slug}`);
      await expect(page.getByRole("heading", { name: c.name, level: 1 })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Preview" }).first()).toBeVisible();

      expect(errors, `runtime errors on ${c.slug}:\n${errors.join("\n")}`).toHaveLength(0);
    });
  }
});
