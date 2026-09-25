import { test, expect } from "@playwright/test";
import { DEMO, uid } from "./support";

// The in-product agent against the API's offline MOCK provider
// (FLAGON_AI_PROVIDER=mock), which is deterministic: a message containing
// "create" is routed to the first registered tool whose name contains "create"
// (create_organization), with the name taken from the first quoted phrase.
// create_organization is Mutating, so the agent must PROPOSE it and the UI must
// hold it for confirmation (human in the loop) instead of running it.
//
// A real model is not deterministic, so this only runs when the suite is told
// the API is on the mock provider (CI sets E2E_AI_PROVIDER=mock).
const MOCK = process.env.E2E_AI_PROVIDER === "mock";

test.describe("AI assistant", () => {
  test.skip(!MOCK, "needs the API on FLAGON_AI_PROVIDER=mock (set E2E_AI_PROVIDER=mock)");

  test("proposes a mutation and waits for the user to confirm it", async ({ page }) => {
    const orgName = `E2E Agent ${uid("org")}`;

    await page.goto(`/${DEMO.org}`);
    await page.getByPlaceholder("Ask Flagon to do something, or search...").fill(
      `Create an organization named "${orgName}"`,
    );
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    // The launcher hands off to the Ask AI panel, which shows the conversation.
    const composer = page.getByRole("textbox", { name: "Message the assistant" });
    await expect(composer).toBeVisible();

    // The mutation is proposed, not executed: a confirmation card with the exact
    // action, and the mock's reply pointing the user at it.
    const proposal = page.getByText(`Confirm: Create organization "${orgName}"`);
    await expect(proposal).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled();
    await expect(page.getByText(/Review the confirmation and choose Confirm/)).toBeVisible();
    await expect(page.getByText(/^Done:/)).toHaveCount(0);

    // Nothing happened on the platform: the org it would create does not exist.
    // (The API slugs the name: lowercase, non-alphanumeric runs become "-".)
    const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const orgPage = await page.request.get(`/${orgSlug}`);
    expect(orgPage.status()).toBe(404);

    // Discarding the conversation drops the proposal without running it.
    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(proposal).toBeHidden();
    expect((await page.request.get(`/${orgSlug}`)).status()).toBe(404);
  });
});
