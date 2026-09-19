import { test, expect, type Locator } from "@playwright/test";

// MoneyInput rewrites its text to the raw number on focus, which races a plain
// `fill`; type it like a user (focus, select-all, key in) for a stable result.
async function retype(field: Locator, value: string) {
  await field.click();
  await field.press("ControlOrMeta+a");
  await field.pressSequentially(value);
}

test.describe("form components", () => {
  test("money input understands shorthand and arithmetic", async ({ page }) => {
    await page.goto("/ui/components/money-input");
    const field = page.getByLabel("Monthly budget");
    await expect(field).toHaveValue("$1,250");

    await retype(field, "35k");
    await field.blur();
    await expect(field).toHaveValue("$35,000");

    await retype(field, "5500 + 7300");
    await field.blur();
    await expect(field).toHaveValue("$12,800");
  });

  test("money input auto-switches currency from a typed symbol", async ({ page }) => {
    await page.goto("/ui/components/money-input");
    const price = page.getByLabel("Price");
    await retype(price, "¥32156");
    await price.blur();
    await expect(page.getByText("32156 JPY")).toBeVisible();
  });

  test("color input accepts a typed hex", async ({ page }) => {
    await page.goto("/ui/components/color-input");
    const hex = page.getByRole("textbox", { name: "Brand color" });
    await hex.fill("#ff0000");
    await expect(hex).toHaveValue("#ff0000");
  });

  test("slider renders single and range thumbs", async ({ page }) => {
    await page.goto("/ui/components/slider");
    await expect(page.getByRole("slider").first()).toBeVisible();
    expect(await page.getByRole("slider").count()).toBeGreaterThanOrEqual(3);
  });

  test("date range field has independent months with dropdown navigation", async ({ page }) => {
    await page.goto("/ui/components/date-range-field");
    await page.getByRole("button", { name: "Reporting period" }).click();
    // Two single-month calendars, each with its own month + year dropdowns.
    await expect(page.getByRole("combobox").nth(3)).toBeVisible();
  });

  test("select can be forced native or radix", async ({ page }) => {
    await page.goto("/ui/components/select");
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await expect(page.locator("select").first()).toBeAttached();
  });

  test("combobox with an async source loads options and selects one", async ({ page }) => {
    await page.goto("/ui/components/combobox");
    // The server-backed example (loadOptions) starts unset and its trigger reads
    // "Find a region"; the static example reads "Select a region".
    await expect(page.getByText("Selected: none")).toBeVisible();
    // Options arrive asynchronously (the demo simulates a server search), so the
    // option only appears after the load resolves.
    await page.getByRole("combobox", { name: /find a region/i }).click();
    const firstOption = page.getByRole("option").first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();
    // Selecting updates the bound value (no longer "none").
    await expect(page.getByText("Selected: none")).toHaveCount(0);
  });
});
