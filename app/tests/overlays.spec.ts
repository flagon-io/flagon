import { test, expect } from "@playwright/test";

test.describe("overlay components", () => {
  test("sheet opens from the side named by its trigger", async ({ page }) => {
    await page.goto("/ui/components/sheet");
    // The Directions example has one trigger per edge.
    await page.getByRole("button", { name: "right", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-side", "right");
    await expect(page.getByText("right sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "bottom", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveAttribute("data-side", "bottom");
  });

  test("alert dialog with dismissible closes on a backdrop click", async ({ page }) => {
    await page.goto("/ui/components/alert-dialog");
    await page.getByRole("button", { name: "Dismissible alert" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    // Escape closes it (the accessible path)...
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // ...and so does a click on the decorative backdrop. It's a full-screen
    // element behind the centered panel, so click near a corner.
    await page.getByRole("button", { name: "Dismissible alert" }).click();
    await expect(dialog).toBeVisible();
    await page.locator('[data-slot="alert-dialog-overlay"]').click({ position: { x: 8, y: 8 } });
    await expect(dialog).toBeHidden();
  });
});
