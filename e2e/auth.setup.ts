import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import postgres from "postgres";
import { E2E, authFile } from "./constants";

/**
 * Authenticate a stable E2E user and provision an isolated Hobby org, then persist
 * the session as storageState for the `app` project.
 *
 * Mirrors apps/app/qa/capture.mjs: sign up (or sign in) through the REAL auth API
 * so the cookie is genuinely server-signed — no BetterAuth internals, no forging.
 * The org is created through the real org-creation endpoint (Hobby = free, no
 * checkout); creation is idempotent across runs (a repeat "already exists" is fine).
 */
const APP_URL = process.env.PW_APP_URL ?? "http://localhost:3001";
const COOKIE = "flagon.session_token";
// BetterAuth requires a trusted Origin on state-changing requests (CSRF); the dev
// server trusts its own origin.
const HEADERS = { "content-type": "application/json", origin: APP_URL };

function sessionCookie(res: Response): string | null {
  const jar = res.headers.getSetCookie?.() ?? [];
  for (const c of jar) {
    if (c.startsWith(`${COOKIE}=`)) return c.slice(COOKIE.length + 1).split(";")[0];
  }
  return null;
}

async function authenticate(): Promise<string> {
  const signUp = await fetch(`${APP_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ email: E2E.email, password: E2E.password, name: E2E.name }),
  });
  let cookie = sessionCookie(signUp);
  if (cookie) return cookie;
  // Already registered — sign in for the cookie.
  const signIn = await fetch(`${APP_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ email: E2E.email, password: E2E.password }),
  });
  cookie = sessionCookie(signIn);
  if (cookie) return cookie;
  throw new Error(
    `Could not obtain a session for ${E2E.email} (sign-up ${signUp.status}, sign-in ${signIn.status}). Is the app dev server up at ${APP_URL}?`,
  );
}

setup("authenticate and provision the E2E org", async ({ page }) => {
  const cookie = await authenticate();

  // Provision the isolated Hobby org (idempotent — a repeat run just fails "exists").
  await fetch(`${APP_URL}/api/auth/organization/create`, {
    method: "POST",
    headers: { ...HEADERS, cookie: `${COOKIE}=${cookie}` },
    body: JSON.stringify({ name: E2E.orgName, slug: E2E.orgSlug, plan: "hobby" }),
  }).catch(() => {});

  await page.context().addCookies([
    {
      name: COOKIE,
      value: cookie,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 86_400,
    },
  ]);

  // Prove the session + membership actually work: the workspace must load (not
  // bounce to /login or /new). This fails setup loudly if provisioning didn't take.
  await page.goto(`${APP_URL}/${E2E.orgSlug}`);
  await expect(page).toHaveURL(new RegExp(`/${E2E.orgSlug}(/|$|\\?)`));

  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: authFile });

  // Purge the E2E org's accumulated flags/experiments/metrics so list-heavy pages
  // (the flags list fetches usage per row; the experiment dialog lists every flag)
  // stay fast across repeated runs — otherwise data piles up and slow renders flake
  // the UI-create tests. Best-effort: needs a DB URL (present when the API env is
  // sourced / in CI); skipped otherwise. Deletes are RLS-scoped via app.current_org_id;
  // flags/experiments cascade their children, metric events are org-scoped.
  const dbUrl = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;
  if (dbUrl) {
    const sql = postgres(dbUrl, { max: 1 });
    try {
      const [org] = await sql`select id from organizations where slug = ${E2E.orgSlug} limit 1`;
      if (org) {
        await sql`select set_config('app.current_org_id', ${org.id}, false)`;
        await sql`delete from experiment_metric_events where organization_id = ${org.id}`;
        await sql`delete from experiments where organization_id = ${org.id}`;
        await sql`delete from experiment_metrics where organization_id = ${org.id}`;
        await sql`delete from flags where organization_id = ${org.id}`;
        // Reliability: incidents (cascade their services/updates/checklist/rcca),
        // then the on-call config. Incidents first so a policy delete never SET-NULLs
        // a live one mid-purge.
        await sql`delete from incidents where organization_id = ${org.id}`;
        await sql`delete from oncall_escalation_policies where organization_id = ${org.id}`;
        await sql`delete from oncall_schedules where organization_id = ${org.id}`;
      }
    } catch {
      // Non-fatal: a purge failure just leaves prior data; tests still run.
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
});
