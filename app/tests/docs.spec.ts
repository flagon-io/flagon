import { test, expect } from "@playwright/test";

// The /ui docs are the live surface for the component library, so they double as
// the integration-test target: every example on a component page is the real
// component running.

test.describe("docs shell", () => {
  test("home renders and the top nav routes", async ({ page }) => {
    await page.goto("/ui");
    await expect(page.getByRole("heading", { name: "Introduction", level: 1 })).toBeVisible();

    await page.locator("header").getByRole("link", { name: "Components", exact: true }).click();
    await expect(page).toHaveURL(/\/ui\/components$/);
    await expect(page.getByRole("heading", { name: "Components", level: 1 })).toBeVisible();
  });

  test("the catalog is grouped by type", async ({ page }) => {
    await page.goto("/ui/components");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Forms & inputs" })).toBeVisible();
    await expect(main.getByRole("link", { name: /Money Input/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /Color Input/ })).toBeVisible();
  });

  test("a component page shows a live preview and code", async ({ page }) => {
    await page.goto("/ui/components/button");
    await expect(page.getByRole("heading", { name: "Button", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Preview" }).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "Code" }).first()).toBeVisible();
  });

  test("llms.txt is served for agents", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("Flagon UI (@flagon-io/ui)");
    expect(body).toContain("BrandProvider");
  });
});
