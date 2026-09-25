import { test, expect } from "@playwright/test";
import { DEMO, bestEffortDelete, createProjectViaApi, orgApi, uid } from "./support";

// One project's whole lifecycle through the UI: create -> list -> edit -> delete
// -> Deleted projects -> restore. The steps share state, so they run in order.
test.describe.serial("project lifecycle", () => {
  const slug = uid("e2e-proj");
  const name = `E2E ${slug}`;
  const renamed = `${name} renamed`;
  const description = "Created by the product e2e suite";

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: "tests/product/.auth/demo.json" });
    const page = await context.newPage();
    // Leave the org tidy: soft delete whatever this run left live.
    await bestEffortDelete(page, orgApi(`/projects/${slug}`));
    await context.close();
  });

  test("create a project from the New project page", async ({ page }) => {
    await page.goto(`/${DEMO.org}/projects`);
    await page.getByRole("link", { name: "New project" }).first().click();
    await expect(page).toHaveURL(`/${DEMO.org}/projects/new`);

    await page.getByLabel("Project name").fill(name);
    const slugField = page.getByLabel("Slug");
    await slugField.fill(slug);
    await expect(slugField).toHaveValue(slug);
    await page.getByLabel("Description").fill(description);
    await page.getByLabel("Repository URL").fill("https://example.com/acme/e2e");
    await page.getByRole("button", { name: "Create project" }).click();

    // Lands on the new project's page, rendered from the API.
    await expect(page).toHaveURL(`/${DEMO.org}/projects/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.locator("header").getByText(description)).toBeVisible();
  });

  test("the new project appears in the projects list", async ({ page }) => {
    await page.goto(`/${DEMO.org}/projects`);
    // Search server-side so the assertion holds however many projects exist.
    await page.getByRole("textbox", { name: "Search projects" }).fill(slug);
    const card = page.getByRole("link", { name: new RegExp(name) });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("href", `/${DEMO.org}/projects/${slug}`);
  });

  test("edit the project's settings", async ({ page }) => {
    await page.goto(`/${DEMO.org}/projects/${slug}/settings`);
    const nameField = page.getByLabel("Project name");
    await expect(nameField).toHaveValue(name);
    await nameField.fill(renamed);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    // Persisted by the API, not just local state.
    await page.reload();
    await expect(page.getByLabel("Project name")).toHaveValue(renamed);
    await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();
  });

  test("delete the project from the danger zone", async ({ page }) => {
    await page.goto(`/${DEMO.org}/projects/${slug}/settings`);
    await page.getByRole("button", { name: "Delete project" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Delete project" });
    // Guarded: nothing happens until the slug is typed.
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/to confirm/).fill(slug);
    await confirm.click();

    await expect(page).toHaveURL(`/${DEMO.org}/projects`);
    // Gone from the live list and from its URL.
    const res = await page.request.get(orgApi(`/projects/${slug}`));
    expect(res.status()).toBe(404);
  });

  test("restore it from Settings > Deleted projects", async ({ page }) => {
    await page.goto(`/${DEMO.org}/settings/deleted-projects`);
    await page.getByRole("textbox", { name: "Search deleted projects" }).fill(slug);
    const row = page.getByRole("row").filter({ hasText: slug });
    await expect(row).toBeVisible();
    await expect(row).toContainText(renamed);

    await row.getByRole("button", { name: "Restore" }).click();
    await expect(row).toBeHidden();

    // Live again at its URL.
    await page.goto(`/${DEMO.org}/projects/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();
  });
});

test.describe("project validation", () => {
  test("a duplicate slug shows the API's conflict message", async ({ page }) => {
    const slug = uid("e2e-dup");
    await createProjectViaApi(page, `E2E ${slug}`, slug);
    try {
      await page.goto(`/${DEMO.org}/projects/new`);
      await page.getByLabel("Project name").fill(`E2E ${slug} again`);
      await page.getByLabel("Slug").fill(slug);

      const [res] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().endsWith(orgApi("/projects")) && r.request().method() === "POST",
        ),
        page.getByRole("button", { name: "Create project" }).click(),
      ]);
      // The gateway passes the API's real status through rather than flattening it.
      expect(res.status()).toBe(409);
      await expect(
        page.getByRole("alert").filter({ hasText: /a project with that slug already exists/i }),
      ).toBeVisible();
      // Still on the form: nothing was created.
      await expect(page).toHaveURL(`/${DEMO.org}/projects/new`);
    } finally {
      await bestEffortDelete(page, orgApi(`/projects/${slug}`));
    }
  });
});
