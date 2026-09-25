import { test, expect } from "@playwright/test";

test.describe("scroll area", () => {
  test("scrolls natively, so the scrollbar moves in the same frame as the content", async ({ page }) => {
    await page.goto("/ui/components/scroll-area");
    const area = page.locator('[data-slot="scroll-area"][aria-label="Regions"]');
    await expect(area).toBeVisible();

    // The container itself is the scroller (no JS-positioned thumb to lag behind).
    const styles = await area.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { overflowY: cs.overflowY, children: el.querySelectorAll("[data-radix-scroll-area-thumb]").length };
    });
    expect(styles.overflowY).toBe("auto");
    expect(styles.children).toBe(0);

    await area.hover();
    await page.mouse.wheel(0, 240);
    await expect.poll(() => area.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test("is keyboard-scrollable only while it overflows", async ({ page }) => {
    await page.goto("/ui/components/scroll-area");
    const area = page.locator('[data-slot="scroll-area"][aria-label="Regions"]');
    await expect(area).toHaveAttribute("tabindex", "0");

    await area.focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => area.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    // Shrink the content so nothing overflows: it should leave the tab order.
    await area.evaluate((el) => {
      el.innerHTML = "<p>Short</p>";
    });
    await expect(area).not.toHaveAttribute("tabindex", /.*/);
  });

  test("horizontal orientation scrolls sideways", async ({ page }) => {
    await page.goto("/ui/components/scroll-area");
    const area = page.locator('[data-slot="scroll-area"][aria-label="Releases"]');
    await expect(area).toHaveAttribute("data-orientation", "horizontal");
    await area.evaluate((el) => el.scrollBy({ left: 200 }));
    await expect.poll(() => area.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });
});
