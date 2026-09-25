import { test, expect, type Locator } from "@playwright/test";

// Resolve a color token (e.g. "--overlay") to its computed rgb() in the scope of
// `near`, so a Brand-scoped token resolves exactly as the component sees it.
async function tokenColor(near: Locator, token: string): Promise<string> {
  return near.evaluate((el, t) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${t})`;
    el.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, token);
}

test.describe("dialog", () => {
  test("opens, traps focus, closes on Escape and returns focus to the trigger", async ({ page }) => {
    await page.goto("/ui/components/dialog");
    const trigger = page.getByRole("button", { name: "Delete project" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Delete project" })).toBeVisible();

    // Focus is inside the dialog and stays there however far you tab.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("paints the shared --overlay backdrop and closes on a backdrop click", async ({ page }) => {
    await page.goto("/ui/components/dialog");
    await page.getByRole("button", { name: "Delete project" }).click();
    const overlay = page.locator('[data-slot="dialog-overlay"]');
    await expect(overlay).toBeVisible();
    const bg = await overlay.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(await tokenColor(page.locator("body"), "--overlay"));

    await overlay.click({ position: { x: 8, y: 8 } });
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("an action button inside the dialog does not act as a form submit", async ({ page }) => {
    await page.goto("/ui/components/dialog");
    await page.getByRole("button", { name: "Delete project" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Delete" })).toHaveAttribute("type", "button");
  });
});

test.describe("modal backdrops are one system", () => {
  test("sheet and alert dialog share the dialog's overlay color", async ({ page }) => {
    await page.goto("/ui/components/sheet");
    await page.getByRole("button", { name: "right", exact: true }).click();
    const sheetBg = await page
      .locator('[data-slot="sheet-overlay"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const expected = await tokenColor(page.locator("body"), "--overlay");
    expect(sheetBg).toBe(expected);

    await page.goto("/ui/components/alert-dialog");
    await page.getByRole("button", { name: "Dismissible alert" }).click();
    const alertBg = await page
      .locator('[data-slot="alert-dialog-overlay"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alertBg).toBe(expected);
  });
});

test.describe("dropdown menu", () => {
  test("opens, navigates with the keyboard, and closes on select", async ({ page }) => {
    await page.goto("/ui/components/dropdown-menu");
    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(3);

    // Arrow keys move the highlight between items (Radix roving focus).
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Settings" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "New project" })).toBeFocused();

    // Escape closes and returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    // Choosing an item closes the menu.
    await trigger.click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("menu")).toBeHidden();
  });
});

test.describe("tooltip", () => {
  test("shows on hover and on keyboard focus, hides when pointer leaves", async ({ page }) => {
    await page.goto("/ui/components/tooltip");
    const trigger = page.getByRole("button", { name: "Hover me" });
    await trigger.hover();
    const tip = page.getByRole("tooltip");
    await expect(tip).toHaveText("Helpful context");
    // The trigger is described by the tooltip for assistive tech.
    await expect(trigger).toHaveAttribute("aria-describedby", /.+/);

    // Leave the trigger, then keep moving (the tooltip's hover grace area
    // closes on the next pointer move outside it).
    await page.mouse.move(5, 5, { steps: 4 });
    await page.mouse.move(10, 10);
    await expect(tip).toBeHidden();

    await trigger.focus();
    await expect(page.getByRole("tooltip")).toHaveText("Helpful context");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toBeHidden();
  });
});

test.describe("popover", () => {
  test("opens with focus inside, and Escape closes it back to the trigger", async ({ page }) => {
    await page.goto("/ui/components/popover");
    const trigger = page.getByRole("button", { name: "Invite" });
    await trigger.click();
    const field = page.getByPlaceholder("email@company.com");
    await expect(field).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await field.fill("dev@example.com");
    await expect(field).toHaveValue("dev@example.com");

    await page.keyboard.press("Escape");
    await expect(field).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  test("closes on an outside click", async ({ page }) => {
    await page.goto("/ui/components/popover");
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByPlaceholder("email@company.com")).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.getByPlaceholder("email@company.com")).toBeHidden();
  });
});

test.describe("command", () => {
  test("filters as you type, moves the selection with arrows, and shows an empty state", async ({ page }) => {
    await page.goto("/ui/components/command");
    const input = page.getByPlaceholder("Type a command or search…");
    const options = page.getByRole("option");
    await expect(options).toHaveCount(4);

    // The first item starts selected; ArrowDown moves the selection.
    await input.click();
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options.first()).toHaveAttribute("aria-selected", "false");

    await input.fill("settings");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText("Open settings");

    await input.fill("zzzz-nothing");
    await expect(options).toHaveCount(0);
    await expect(page.getByText("No results found.")).toBeVisible();
  });

  test("the search input sits on the shared control scale", async ({ page }) => {
    await page.goto("/ui/components/command");
    const input = page.getByPlaceholder("Type a command or search…");
    const [h, lg] = await input.evaluate((el) => {
      const probe = document.createElement("div");
      probe.style.height = "var(--control-lg)";
      el.parentElement!.appendChild(probe);
      const out = [el.getBoundingClientRect().height, probe.getBoundingClientRect().height];
      probe.remove();
      return out;
    });
    expect(h).toBeCloseTo(lg, 0);
  });
});
