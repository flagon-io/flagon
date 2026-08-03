/**
 * Console QA screenshot harness.
 *
 * Drives the *real* running dev server (never starts/stops it) as an
 * authenticated user and writes full-page screenshots to `qa/shots/` so the UI
 * can be reviewed visually — including the auth-gated `/<org>` console that a
 * plain `curl` can't reach.
 *
 * How it authenticates (no BetterAuth internals, no cookie forging):
 *   1. Idempotently sign a stable QA user up (or in) through the auth API on the
 *      dev server — the `Set-Cookie` it returns is already server-signed, so it
 *      is a genuine session.
 *   2. Ensure that user is a member of the target org (a direct, ON CONFLICT
 *      DO NOTHING insert against the same Postgres the app uses). Membership,
 *      not `active_organization_id`, is what gates the `/<slug>` pages.
 *
 * The QA user is STABLE (default qa+screenshot@flagon.test) and the grant is
 * idempotent, so runs are repeatable and need no teardown. It only ever touches
 * a local/dev database — point it at production and it will refuse (see GUARD).
 *
 * Browser: playwright-core drives the *installed* Chrome via `channel: "chrome"`
 * — no bundled-browser download, works the same on macOS/Windows/Linux.
 *
 * Usage:
 *   npm run qa                       # capture the default route set (qa/routes.mjs)
 *   npm run qa -- /acme/flags /x     # capture just these paths instead
 *   QA_ORG_SLUG=acme npm run qa      # against a different org
 *
 * Env (all optional, sensible defaults):
 *   APP_URL          console base URL           (default http://localhost:3001)
 *   QA_ORG_SLUG      org slug to view           (default flagon)
 *   QA_EXP / QA_FLAG seeded experiment/flag key (defaults from seed:experiments)
 *   QA_EMAIL / QA_PASSWORD / QA_NAME   the QA user
 *   QA_OUT           output dir                 (default qa/shots)
 *   CHROME_CHANNEL   chrome | msedge | chrome-beta ...  (default chrome)
 */
import { chromium } from "playwright-core";
import postgres from "postgres";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defaultRoutes } from "./routes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const APP_URL = (process.env.APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
const ORG_SLUG = process.env.QA_ORG_SLUG ?? "flagon";
const EXP = process.env.QA_EXP ?? "qa-checkout-color";
const FLAG = process.env.QA_FLAG ?? "qa-checkout-button";
const EMAIL = process.env.QA_EMAIL ?? "qa+screenshot@flagon.test";
const PASSWORD = process.env.QA_PASSWORD ?? "qa-screenshot-pw-123";
const NAME = process.env.QA_NAME ?? "QA Screenshot";
const OUT = process.env.QA_OUT ?? join(HERE, "shots");
const CHANNEL = process.env.CHROME_CHANNEL ?? "chrome";
const COOKIE = "flagon.session_token";

const DB_URL = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;

// GUARD: this inserts a membership row, so never let it touch a prod database.
function assertLocalDb(url) {
  if (!url) {
    fail("APP_DATABASE_URL / DATABASE_URL is not set. Run with the app env loaded (npm run qa loads .env.local).");
  }
  const looksProd = /neon\.tech|amazonaws|supabase|\.render\.com|sslmode=require/i.test(url);
  const forced = process.env.QA_ALLOW_REMOTE_DB === "1";
  if (looksProd && !forced) {
    fail(
      `Refusing to run against what looks like a remote/prod database (${redactHost(url)}). ` +
        "This harness grants a QA membership and is for LOCAL dev only. " +
        "Set QA_ALLOW_REMOTE_DB=1 only if you are certain.",
    );
  }
}

function redactHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}
function fail(msg) {
  console.error(`\n  qa: ${msg}\n`);
  process.exit(1);
}

// BetterAuth rejects state-changing requests without a trusted Origin (CSRF
// protection), so send the app's own origin — the dev server trusts itself.
const AUTH_HEADERS = { "content-type": "application/json", origin: APP_URL };

/** Sign the QA user up; if they already exist, sign in. Returns the session cookie value. */
async function authenticate() {
  const signUp = await fetch(`${APP_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: NAME }),
  });
  let cookie = readSessionCookie(signUp);
  if (cookie) return cookie;

  // Already registered (or auto-sign-in disabled) — sign in for the cookie.
  const signIn = await fetch(`${APP_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  cookie = readSessionCookie(signIn);
  if (cookie) return cookie;

  const body = await signIn.text().catch(() => "");
  fail(
    `could not obtain a session for ${EMAIL} (sign-up ${signUp.status}, sign-in ${signIn.status}). ` +
      `Is the dev server up at ${APP_URL}? ${body.slice(0, 200)}`,
  );
}

function readSessionCookie(res) {
  const jar = res.headers.getSetCookie?.() ?? [];
  for (const c of jar) {
    if (c.startsWith(`${COOKIE}=`)) return c.slice(COOKIE.length + 1).split(";")[0];
  }
  return null;
}

/** Make the QA user an admin of the target org (idempotent). */
async function ensureMembership(sql) {
  const [org] = await sql`select id from organizations where slug = ${ORG_SLUG} limit 1`;
  if (!org) fail(`org "${ORG_SLUG}" not found. Seed it first (npm run seed) or set QA_ORG_SLUG.`);
  const [user] = await sql`select id from users where email = ${EMAIL} limit 1`;
  if (!user) fail(`QA user ${EMAIL} not found after auth — unexpected.`);
  await sql`
    insert into members (id, organization_id, user_id, role)
    values (${crypto.randomUUID()}, ${org.id}, ${user.id}, 'admin')
    on conflict (organization_id, user_id) do nothing
  `;
  return org.id;
}

async function main() {
  assertLocalDb(DB_URL);
  const paths = process.argv.slice(2);
  const routes = paths.length
    ? paths.map((p) => ({ name: p.replace(/[^\w-]+/g, "_").replace(/^_|_$/g, "") || "root", path: p }))
    : defaultRoutes({ slug: ORG_SLUG, exp: EXP, flag: FLAG });

  console.log(`  qa: authenticating ${EMAIL} against ${APP_URL} …`);
  const cookie = await authenticate();

  const sql = postgres(DB_URL, { max: 1 });
  try {
    await ensureMembership(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }

  await mkdir(OUT, { recursive: true });
  console.log(`  qa: launching ${CHANNEL} …`);
  const browser = await chromium.launch({ channel: CHANNEL, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const host = new URL(APP_URL).hostname;
  await ctx.addCookies([
    { name: COOKIE, value: cookie, domain: host, path: "/", httpOnly: true, sameSite: "Lax" },
  ]);

  const page = await ctx.newPage();
  let ok = 0;
  for (const r of routes) {
    const url = `${APP_URL}${r.path.startsWith("/") ? "" : "/"}${r.path}`;
    try {
      const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(400); // let client transitions settle
      const file = join(OUT, `${r.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  qa: ✓ ${r.path}  (${resp?.status() ?? "?"})  → ${file}`);
      ok++;
    } catch (err) {
      console.log(`  qa: ✗ ${r.path}  — ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\n  qa: ${ok}/${routes.length} captured → ${OUT}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
