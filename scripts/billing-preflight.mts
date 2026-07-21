// READ-ONLY. What happens to each organization the moment billing turns on.
//
// Enabling billing is a single environment variable, and its effect is not
// obvious: every organization created while STRIPE_SECRET_KEY was unset sits
// on plan "free", and Hobby is the only plan that is hard-capped or
// seat-limited (src/lib/quota.ts, src/lib/plans.ts). Orgs that have been
// running unmetered can therefore be instantly over a limit they have never
// been subject to - evaluations start being refused, and the console starts
// reporting them over on projects and members.
//
// This answers that question before the switch is thrown, rather than after:
//
//   node --env-file=.env.production --import tsx scripts/billing-preflight.mts
//
// Every statement is a SELECT. Nothing is written, and no credential is
// printed - only the database host, so it is obvious which one was read.
//
// The thresholds are IMPORTED from the same modules the app enforces with, so
// this cannot drift from the real limits the way a hardcoded copy would.
import { config } from "dotenv";
import postgres from "postgres";
import { resolveOwnerUrl, resolveOwnerUrlSource } from "./db-urls.mjs";
import { PLANS } from "../src/lib/plans";
import { EVALUATION_METER, evaluationAllowance } from "../src/lib/quota";

// --no-dotenv skips .env.local/.env entirely, so a run started with
// `node --env-file=<file>` uses THAT file and nothing else. Without it, a
// local DATABASE_URL_OWNER silently outranks a differently-named production
// variable and the script reads the wrong database.
if (!process.argv.includes("--no-dotenv")) {
  config({ path: [".env.local", ".env"] });
}

const url = resolveOwnerUrl();
if (!url) {
  console.error("No owner database URL configured.");
  process.exit(1);
}

const target = new URL(url);
console.log(
  `Reading ${target.hostname}${target.port ? `:${target.port}` : ""}${target.pathname}` +
    ` (from ${resolveOwnerUrlSource()})\n`,
);

const cap = evaluationAllowance("free");
const { projects: projectLimit, members: memberLimit } = PLANS.free.limits;
const syncCap = (PLANS.free.hardCaps as Record<string, number>)["flags.syncs"];

const sql = postgres(url, { max: 1 });

type Row = {
  slug: string;
  name: string;
  plan: string;
  projects: number;
  members: number;
  evaluations: number;
  syncs: number;
};

try {
  // Usage is measured over the org's own billing window when it has one, and
  // the calendar month otherwise - the same rule currentPeriodFor applies, so
  // the numbers here match what the usage page shows.
  const rows = (await sql`
    SELECT
      o.slug,
      o.name,
      o.plan,
      (SELECT count(*) FROM projects p WHERE p.organization_id = o.id)::int AS projects,
      (SELECT count(*) FROM members m WHERE m.organization_id = o.id)::int AS members,
      COALESCE((
        SELECT sum(r.quantity) FROM usage_rollups r
        WHERE r.organization_id = o.id
          AND r.meter = ${EVALUATION_METER}
          AND r.day >= COALESCE(o.current_period_start::date, date_trunc('month', now())::date)
      ), 0)::bigint AS evaluations,
      COALESCE((
        SELECT sum(r.quantity) FROM usage_rollups r
        WHERE r.organization_id = o.id
          AND r.meter = 'flags.syncs'
          AND r.day >= COALESCE(o.current_period_start::date, date_trunc('month', now())::date)
      ), 0)::bigint AS syncs
    FROM organizations o
    ORDER BY o.created_at
  `) as unknown as Row[];

  if (!rows.length) {
    console.log("No organizations.");
    process.exit(0);
  }

  const number = (value: number) => Number(value).toLocaleString("en-US");
  const breaches: string[] = [];

  for (const row of rows) {
    const evaluations = Number(row.evaluations);
    const syncs = Number(row.syncs);
    const free = row.plan === "free";
    const over: string[] = [];
    if (free) {
      if (cap !== null && evaluations > cap)
        over.push(
          `evaluations ${number(evaluations)} > ${number(cap)} (REFUSED once billing is on)`,
        );
      if (syncCap && syncs > syncCap)
        over.push(`syncs ${number(syncs)} > ${number(syncCap)} (REFUSED)`);
      if (row.projects > projectLimit)
        over.push(`projects ${row.projects} > ${projectLimit}`);
      if (row.members > memberLimit)
        over.push(`members ${row.members} > ${memberLimit}`);
    }

    console.log(
      `${over.length ? "OVER " : "ok   "} /${row.slug}  [${row.plan}]  ` +
        `projects ${row.projects}  members ${row.members}  ` +
        `evaluations ${number(evaluations)}`,
    );
    for (const item of over) console.log(`         - ${item}`);
    if (over.length) breaches.push(row.slug);
  }

  console.log(
    `\nHobby ceilings: ${number(cap ?? 0)} evaluations, ` +
      `${number(syncCap ?? 0)} syncs, ${projectLimit} projects, ${memberLimit} member(s).`,
  );

  if (breaches.length) {
    console.log(
      `\n${breaches.length} organization(s) would be over a Hobby limit the moment billing is enabled:\n` +
        breaches.map((slug) => `  /${slug}`).join("\n") +
        `\n\nMove the ones you own off Hobby first:\n` +
        `  node scripts/org-plan.mjs <slug> enterprise --yes\n` +
        `Anything that belongs to a real customer needs a conversation, not a plan change.`,
    );
  } else {
    console.log("\nNothing is over a Hobby limit. Safe to enable billing.");
  }
} finally {
  await sql.end();
}
