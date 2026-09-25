import { test, expect, type Locator } from "@playwright/test";

// Resolve a color token to computed rgb() in the scope of `near`.
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

test.describe("status tokens", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`success and warning badges read their tokens (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/ui/components/badge");
      await page.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), theme);
      for (const [label, token] of [
        ["Success", "--success"],
        ["Warning", "--warning"],
      ] as const) {
        const badge = page.locator('[data-slot="badge"]', { hasText: label }).first();
        const color = await badge.evaluate((el) => getComputedStyle(el).color);
        expect(color).toBe(await tokenColor(badge, token));
      }
    });
  }

  test("the destructive button's text is the destructive-foreground token", async ({ page }) => {
    await page.goto("/ui/components/button");
    const btn = page.locator('[data-slot="button"]', { hasText: /^Destructive$/ }).first();
    await expect(btn).toBeVisible();
    const color = await btn.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe(await tokenColor(btn, "--destructive-foreground"));
  });
});

test.describe("focus treatment", () => {
  // One focus-visible treatment across the system: a solid --ring outline (never a
  // box-shadow ring, which would fight the Brand's button elevation).
  for (const [slug, role, name] of [
    ["button", "button", undefined],
    ["input", "textbox", undefined],
    ["checkbox", "checkbox", undefined],
    ["switch", "switch", undefined],
  ] as const) {
    test(`${slug} shows the shared outline on keyboard focus`, async ({ page }) => {
      await page.goto(`/ui/components/${slug}`);
      const el = page.locator("main").getByRole(role, name ? { name } : undefined).first();
      // Focus the element via the keyboard so :focus-visible applies.
      await el.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(el).toBeFocused();
      const outline = (prop: "outlineStyle" | "outlineWidth" | "outlineColor") =>
        el.evaluate((node, p) => getComputedStyle(node)[p], prop);
      expect(await outline("outlineStyle")).toBe("solid");
      expect(await outline("outlineWidth")).toBe("2px");
      // Poll: controls transition their colors, so the outline eases in.
      const ring = await tokenColor(el.locator(".."), "--ring");
      await expect.poll(() => outline("outlineColor")).toBe(ring);
    });
  }
});

test.describe("button type", () => {
  test("design-system buttons default to type=button", async ({ page }) => {
    await page.goto("/ui/components/button");
    const buttons = page.locator('main button[data-slot="button"]');
    expect(await buttons.count()).toBeGreaterThan(0);
    const types = await buttons.evaluateAll((els) => els.map((e) => (e as HTMLButtonElement).type));
    expect(types.every((t) => t === "button" || t === "submit")).toBe(true);
    expect(types.filter((t) => t === "submit")).toHaveLength(0);
  });
});
