import { test, expect } from "@playwright/test";
import { E2E, API_URL, uniq } from "../constants";

/**
 * The definitive end-to-end proof that experiments work for a real user: drive the
 * CONSOLE to set up a metric + flag + experiment and start it, then push real OFREP
 * exposures + goal events the way an SDK would, and assert the RESULTS panel renders
 * true statistics (lift, chance-to-beat, significance) — finally recording a decision.
 *
 * This exercises the whole spine through the browser: console CRUD + lifecycle -> a
 * minted client key -> OFREP ingest -> per-experiment enrollment + attribution ->
 * the stats engine -> the results UI. Data is sized past the small-sample floor
 * (>=100/arm) with a large effect (10% vs 30%) so significance is unambiguous.
 */
const CONTROL = 250;
const TREATMENT = 250;
const CONTROL_CONV = 25; // 10%
const TREATMENT_CONV = 75; // 30%

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

test("experiment lifecycle: set up in the console, feed OFREP, read real results", async ({ page }) => {
  test.setTimeout(120_000);
  const metricName = uniq("pw-goal");
  const flagKey = uniq("pw-exp-flag");
  const expName = uniq("pw-experiment");

  // 1. Create a conversion metric (console).
  await page.goto(`/${E2E.orgSlug}/experiments/metrics`);
  await page.getByRole("button", { name: /create metric/i }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Checkout completed").fill(metricName);
  await dialog.getByPlaceholder("checkout_completed").fill("purchase");
  await dialog.getByRole("button", { name: /^create$/i }).click();
  await expect(dialog).toBeHidden();

  // 2. Create a boolean flag (console) — its on/off variants are the arms.
  await page.goto(`/${E2E.orgSlug}/flags`);
  await page.getByRole("button", { name: /create flag/i }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("my-flag").fill(flagKey);
  await dialog.getByRole("button", { name: /^create$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/${E2E.orgSlug}/flags/${flagKey}`));

  // 3. Create the experiment (console): flag arms, off = control, primary metric.
  await page.goto(`/${E2E.orgSlug}/experiments`);
  await page.getByRole("button", { name: /create experiment/i }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Checkout button color").fill(expName);
  await dialog.getByLabel("Flag").click();
  await page.getByRole("option", { name: new RegExp(flagKey) }).click();
  await expect(dialog.getByLabel("Control variant")).toBeEnabled();
  await dialog.getByLabel("Control variant").click();
  // Boolean variants render as "Off (off)" (label + key).
  await page.getByRole("option", { name: "Off (off)" }).click();
  await dialog.getByLabel("Primary metric").click();
  await page.getByRole("option", { name: metricName }).click();
  await dialog.getByRole("button", { name: /^create$/i }).click();

  await expect(page).toHaveURL(new RegExp(`/${E2E.orgSlug}/experiments/[a-z0-9-]+`));
  const expKey = page.url().match(/experiments\/([^/?]+)/)![1];

  // 4. Start it — enrollment only happens for a RUNNING experiment.
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByText(/running/i).first()).toBeVisible();

  // 5. Mint a client key (API, cookie-shared) — how an SDK authenticates.
  const keyRes = await page.request.post(`${API_URL}/v1/orgs/${E2E.orgSlug}/client-keys`, {
    data: { name: `e2e-${flagKey}`, environment: "production" },
  });
  expect(keyRes.ok()).toBeTruthy();
  const clientKey = (await keyRes.json()).key.token as string;
  const sdk = { Authorization: `Bearer ${clientKey}` };

  // 6. Push exposures (which arm each unit saw) + goal events, like an SDK.
  const exposures = [
    ...range(CONTROL).map((i) => ({ key: flagKey, variant: "off", targetingKey: `c${i}` })),
    ...range(TREATMENT).map((i) => ({ key: flagKey, variant: "on", targetingKey: `t${i}` })),
  ];
  const expo = await page.request.post(`${API_URL}/ofrep/v1/exposures`, {
    headers: sdk,
    data: { events: exposures },
  });
  expect(expo.status()).toBe(202);

  const goals = [
    ...range(CONTROL_CONV).map((i) => ({ metric: "purchase", targetingKey: `c${i}` })),
    ...range(TREATMENT_CONV).map((i) => ({ metric: "purchase", targetingKey: `t${i}` })),
  ];
  const track = await page.request.post(`${API_URL}/ofrep/v1/track`, {
    headers: sdk,
    data: { events: goals },
  });
  expect(track.status()).toBe(202);

  // 7. Read the RESULTS UI — poll (attribution is written off the hot path).
  await expect(async () => {
    await page.goto(`/${E2E.orgSlug}/experiments/${expKey}?tab=results`);
    // Real numbers rendered: the metric card + a decisive Bayesian readout.
    await expect(page.getByText(metricName).first()).toBeVisible({ timeout: 2000 });
    await expect(page.getByText(">99.9%").first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  // The treatment is a significant winner with a large positive lift.
  await expect(page.getByText(/significant/i).first()).toBeVisible();
  await expect(page.getByText(/\+2\d\d(\.\d)?%/).first()).toBeVisible(); // ~+200%

  // 8. Record a decision (confirmed) and see it reflected.
  await page.getByRole("button", { name: /^ship$/i }).click();
  const confirm = page.getByRole("dialog");
  await confirm.getByRole("button", { name: /record decision/i }).click();
  await expect(page.getByText(/stopped/i).first()).toBeVisible();
});
