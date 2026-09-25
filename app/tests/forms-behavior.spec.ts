import { test, expect, type Page } from "@playwright/test";

async function arrow(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(50);
  await page.keyboard.up(key);
}

test.describe("date field", () => {
  test("parses a typed date, and rejects one outside min", async ({ page }) => {
    await page.goto("/ui/components/date-field");
    const field = page.getByRole("textbox", { name: "Pick a date" });

    // A future weekday: parsed, echoed in long form, and emitted to onChange.
    await field.fill("2030-01-15");
    await expect(field).toHaveValue("2030-01-15");
    await expect(page.getByText("Tuesday, January 15, 2030")).toBeVisible();
    await expect(page.getByText("Value: Tue Jan 15 2030")).toBeVisible();

    // The example sets min = today, so a past date is flagged and cleared.
    await field.fill("2020-01-01");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("That date is out of range.")).toBeVisible();
    await expect(page.getByText("Value: none yet")).toBeVisible();

    // Nonsense is called out, not silently accepted.
    await field.fill("not a date");
    await expect(page.getByText("Unrecognized date.")).toBeVisible();
  });

  test("picking a day from the calendar fills the field and closes the popover", async ({ page }) => {
    await page.goto("/ui/components/date-field");
    const field = page.getByRole("textbox", { name: "Pick a date" });
    await page.getByRole("button", { name: "Open calendar" }).click();
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible();
    // Next month is always fully in the future, so it has enabled weekdays.
    await page.getByRole("button", { name: /next month/i }).click();
    const day = grid.locator("button:not([disabled])").first();
    await day.click();
    await expect(grid).toBeHidden();
    await expect(field).not.toHaveValue("");
    await expect(page.getByText("Value: none yet")).toHaveCount(0);
  });
});

test.describe("input otp", () => {
  test("fills slot by slot and accepts only digits", async ({ page }) => {
    await page.goto("/ui/components/input-otp");
    const input = page.getByRole("textbox", { name: "Verification code" });
    await input.click();
    await page.keyboard.type("12a3");
    // The digits-only pattern drops the letter.
    await expect(page.getByText("Entered: 123")).toBeVisible();
    await page.keyboard.type("456");
    await expect(page.getByText("Entered: 123456")).toBeVisible();
    // Six slots, each showing its character.
    const slots = page.locator('[data-slot="input-otp-slot"]');
    await expect(slots).toHaveCount(6);
    await expect(slots.nth(5)).toHaveText("6");

    await page.keyboard.press("Backspace");
    await expect(page.getByText("Entered: 12345", { exact: true })).toBeVisible();
  });
});

test.describe("toggle group", () => {
  test("multiple selection toggles each item independently", async ({ page }) => {
    await page.goto("/ui/components/toggle-group");
    const group = page.getByRole("toolbar", { name: "Text formatting" });
    const bold = group.getByRole("button", { name: "Bold" });
    const italic = group.getByRole("button", { name: "Italic" });

    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await bold.click();
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    await italic.click();
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    await expect(italic).toHaveAttribute("aria-pressed", "true");
    await bold.click();
    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await expect(italic).toHaveAttribute("aria-pressed", "true");
  });

  test("arrow keys rove focus between items", async ({ page }) => {
    await page.goto("/ui/components/toggle-group");
    const group = page.getByRole("toolbar", { name: "Text formatting" });
    await group.getByRole("button", { name: "Bold" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("button", { name: "Italic" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(group.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("checkbox, switch, radio group", () => {
  test("checkbox toggles by click and via its label", async ({ page }) => {
    await page.goto("/ui/components/checkbox");
    const box = page.getByRole("checkbox", { name: "Email me about deployments" });
    await expect(box).toBeChecked();
    await box.click();
    await expect(box).not.toBeChecked();
    await page.getByText("Email me about deployments").click();
    await expect(box).toBeChecked();
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box).not.toBeChecked();
  });

  test("switch toggles by click and keyboard", async ({ page }) => {
    await page.goto("/ui/components/switch");
    const sw = page.getByRole("switch", { name: "Require two-factor authentication" });
    await expect(sw).toBeChecked();
    await sw.click();
    await expect(sw).not.toBeChecked();
    await expect(sw).toHaveAttribute("data-state", "unchecked");
    await page.keyboard.press("Space");
    await expect(sw).toBeChecked();
  });

  test("radio group keeps exactly one choice and moves it with arrow keys", async ({ page }) => {
    await page.goto("/ui/components/radio-group");
    const compact = page.getByRole("radio", { name: "compact" });
    const comfortable = page.getByRole("radio", { name: "comfortable" });
    const spacious = page.getByRole("radio", { name: "spacious" });
    await expect(comfortable).toBeChecked();

    await compact.click();
    await expect(compact).toBeChecked();
    await expect(comfortable).not.toBeChecked();

    // Roving focus moves on the next tick, and a radio checks when focus arrives
    // while the arrow is still held - so hold the key like a person does.
    await arrow(page, "ArrowDown");
    await expect(comfortable).toBeChecked();
    await arrow(page, "ArrowDown");
    await expect(spacious).toBeChecked();
    await expect(compact).not.toBeChecked();
  });
});
