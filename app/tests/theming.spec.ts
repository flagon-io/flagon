import { test, expect } from "@playwright/test";

// The Brand system is the heart of the library, so it gets end-to-end coverage:
// switching a Brand in the top-right must re-skin real components live.

test.describe("brand theming", () => {
  test("switching to Pop gives buttons the elevation shadow", async ({ page }) => {
    await page.goto("/ui");
    await page.getByRole("button", { name: "Brand" }).click();
    await page.getByRole("menuitem", { name: "Pop" }).click();

    const btn = page.getByRole("link", { name: /Get started/ });
    await expect(btn).toBeVisible();
    // The chunky look is a hard 4px offset shadow (no blur) plus a border ring.
    // Poll because the shadow transitions in when the Brand changes.
    await expect
      .poll(() => btn.evaluate((el) => getComputedStyle(el).boxShadow))
      .toContain("4px 4px");
  });

  test("switching Brand changes the body font token", async ({ page }) => {
    await page.goto("/ui");
    await page.getByRole("button", { name: "Brand" }).click();
    await page.getByRole("menuitem", { name: "Nocturne" }).click();

    const font = await page.evaluate(
      () => getComputedStyle(document.querySelector("[data-brand]") as Element).fontFamily,
    );
    expect(font.toLowerCase()).toContain("montserrat");
  });
});
