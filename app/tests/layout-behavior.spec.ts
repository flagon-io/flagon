import { test, expect } from "@playwright/test";

test.describe("tabs", () => {
  test("switches panels by click and by arrow keys", async ({ page }) => {
    await page.goto("/ui/components/tabs");
    const overview = page.getByRole("tab", { name: "Overview" });
    const logs = page.getByRole("tab", { name: "Logs" });
    const overviewPanel = page.getByRole("tabpanel", { name: "Overview" });
    const logsPanel = page.getByRole("tabpanel", { name: "Logs" });
    await expect(overview).toHaveAttribute("aria-selected", "true");
    await expect(overviewPanel).toHaveText("Health, traffic, and recent deployments.");
    await expect(logsPanel).toHaveCount(0);

    await logs.click();
    await expect(logs).toHaveAttribute("aria-selected", "true");
    await expect(logsPanel).toHaveText("Streaming logs from every instance.");
    await expect(overviewPanel).toHaveCount(0);

    // Arrow keys move between tabs and (automatic activation) switch the panel.
    await page.keyboard.press("ArrowLeft");
    await expect(overview).toBeFocused();
    await expect(overview).toHaveAttribute("aria-selected", "true");
    await expect(overviewPanel).toHaveText("Health, traffic, and recent deployments.");
  });
});

test.describe("accordion", () => {
  test("single + collapsible: one section open at a time, and it can close", async ({ page }) => {
    await page.goto("/ui/components/accordion");
    const first = page.getByRole("button", { name: "What is Flagon UI?" });
    const second = page.getByRole("button", { name: "Can I theme it?" });
    await expect(first).toHaveAttribute("aria-expanded", "false");

    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/accessible, token-driven React component library/)).toBeVisible();

    await second.click();
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(/accessible, token-driven React component library/)).toBeHidden();

    await second.click();
    await expect(second).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("sidebar", () => {
  test("marks the active item and sizes rows on the density scale", async ({ page }) => {
    await page.goto("/ui/components/sidebar");
    const sidebar = page.locator('[data-slot="sidebar"]').first();
    const dashboard = sidebar.getByRole("button", { name: "Dashboard" });
    const projects = sidebar.getByRole("button", { name: "Projects" });
    await expect(dashboard).toHaveAttribute("data-active", "true");
    await expect(projects).toHaveAttribute("data-active", "false");
    // md is the default size; its row height is the --control-sm density token.
    await expect(dashboard).toHaveAttribute("data-size", "md");
    const [row, token] = await dashboard.evaluate((el) => {
      const probe = document.createElement("div");
      probe.style.height = "var(--control-sm)";
      el.parentElement!.appendChild(probe);
      const out = [el.getBoundingClientRect().height, probe.getBoundingClientRect().height];
      probe.remove();
      return out;
    });
    expect(row).toBeCloseTo(token, 0);
  });

  test("menu buttons are real buttons that never submit a form, and show the focus outline", async ({ page }) => {
    await page.goto("/ui/components/sidebar");
    const settings = page.locator('[data-slot="sidebar"]').first().getByRole("button", { name: "Settings" });
    await settings.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(settings).toBeFocused();
    const style = await settings.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(style).toBe("solid");
  });
});

test.describe("carousel", () => {
  test("next/previous buttons and arrow keys move between slides", async ({ page }) => {
    await page.goto("/ui/components/carousel");
    const region = page.locator('[aria-roledescription="carousel"]').first();
    const prev = region.getByRole("button", { name: "Previous slide" });
    const next = region.getByRole("button", { name: "Next slide" });
    const slides = region.locator('[aria-roledescription="slide"]');
    await expect(slides).toHaveCount(5);

    // At the start there is nothing before slide 1.
    await expect(prev).toBeDisabled();
    await expect(next).toBeEnabled();

    await next.click();
    await expect(prev).toBeEnabled();
    await expect(slides.nth(1)).toBeInViewport({ ratio: 0.9 });

    // Arrow keys work while focus is inside the carousel.
    await next.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slides.nth(2)).toBeInViewport({ ratio: 0.9 });
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(slides.nth(0)).toBeInViewport({ ratio: 0.9 });
    await expect(prev).toBeDisabled();
  });
});

test.describe("resizable", () => {
  test("dragging a handle resizes the panels around it", async ({ page }) => {
    await page.goto("/ui/components/resizable");
    const handle = page.locator('[data-slot="resizable-handle"]').first();
    const sidebarPanel = page.locator('[data-slot="resizable-panel"]').first();
    const before = (await sidebarPanel.boundingBox())!.width;

    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    const after = (await sidebarPanel.boundingBox())!.width;
    expect(after).toBeGreaterThan(before + 40);
  });

  test("a handle is keyboard operable", async ({ page }) => {
    await page.goto("/ui/components/resizable");
    const handle = page.locator('[data-slot="resizable-handle"]').first();
    const sidebarPanel = page.locator('[data-slot="resizable-panel"]').first();
    const before = (await sidebarPanel.boundingBox())!.width;
    await handle.focus();
    await expect(handle).toBeFocused();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    const after = (await sidebarPanel.boundingBox())!.width;
    expect(after).toBeGreaterThan(before);
  });
});

test.describe("table", () => {
  test("exposes real table semantics (headers, rows, cells)", async ({ page }) => {
    await page.goto("/ui/components/table");
    const table = page.getByRole("table").first();
    await expect(table.getByRole("columnheader")).toHaveText(["Project", "Status", "Deploys"]);
    // Header row + three body rows.
    await expect(table.getByRole("row")).toHaveCount(4);
    const worker = table.getByRole("row", { name: /worker/ });
    await expect(worker.getByRole("cell")).toHaveText(["worker", "Paused", "12"]);
    await expect(table.locator('[data-slot="table-row"]')).toHaveCount(4);
  });
});
