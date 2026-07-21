// Sets an EXISTING organization's plan, as the DB owner.
//
// org-claim.mjs can only stamp a plan at creation time, which leaves no way to
// move an organization that already exists - and there is one moment where
// that matters a great deal: turning billing on. Every organization created
// while STRIPE_SECRET_KEY was unset carries plan "free", and Hobby is the only
// plan that is hard-capped (src/lib/quota.ts). The instant billing is enabled,
// those organizations start being refused at 10M evaluations and are over the
// 2-project / 1-member limits. Operator-owned organizations have to be moved
// off Hobby FIRST.
//
//   node scripts/org-plan.mjs <slug> <free|pro|enterprise>
//   node scripts/org-plan.mjs flagon enterprise
//
// Runs against whatever DATABASE_URL_OWNER (or the Neon-injected vars) point
// at - local by default, production if you export the prod owner URL first.
//
// This writes the plan column ONLY. It does not create, modify, or cancel a
// Stripe subscription, so use it for contract ("enterprise") and internal
// organizations. Moving a self-serve customer to "pro" this way would give
// them Pro without a subscription to pay for it.
import { config } from "dotenv";
import postgres from "postgres";
import { resolveOwnerUrl, resolveOwnerUrlSource } from "./db-urls.mjs";

// --no-dotenv skips .env.local/.env, so a run started with
// `node --env-file=<file>` uses THAT file alone. Without it a local
// DATABASE_URL_OWNER outranks a differently-named production variable, and the
// write lands on the wrong database while looking like it worked.
if (!process.argv.includes("--no-dotenv")) {
  config({ path: [".env.local", ".env"] });
}

const [slug, plan] = process.argv.slice(2);

if (!slug || !plan) {
  console.error(
    "Usage: node scripts/org-plan.mjs <slug> <free|pro|enterprise>",
  );
  process.exit(1);
}
if (!["free", "pro", "enterprise"].includes(plan)) {
  console.error("Plan must be one of: free, pro, enterprise.");
  process.exit(1);
}

const url = resolveOwnerUrl();
if (!url) {
  console.error("No owner database URL configured.");
  process.exit(1);
}

/**
 * Say which database is about to be written to, and make production explicit.
 *
 * This script loads .env.local and .env - NOT .env.production - so credentials
 * left in that file are ignored and the connection quietly falls back to
 * whatever local URL is configured. The failure that produces is the bad kind:
 * "no organization with that slug" against a local database, read as "prod is
 * fine", or a local org silently moved instead of the real one. Printing the
 * host turns that into something you can see, and requiring --yes off-localhost
 * means reaching production is a thing you said, not a thing you defaulted to.
 *
 * Only host and database name are printed. Never the user, never the password.
 */
const target = new URL(url);
const isLocal = ["localhost", "127.0.0.1", "::1", "postgres"].includes(
  target.hostname,
);
const label = `${target.hostname}${target.port ? `:${target.port}` : ""}${target.pathname}`;
console.log(
  `Target database: ${label}${isLocal ? " (local)" : ""} (from ${resolveOwnerUrlSource()})`,
);

if (!isLocal && !process.argv.includes("--yes")) {
  console.error(
    `\nThat is not a local database. Re-run with --yes to confirm:\n` +
      `  node scripts/org-plan.mjs ${slug} ${plan} --yes\n\n` +
      "If you meant to hit production, note that .env.production is NOT read by\n" +
      "this script - pass the URL for the one command instead:\n" +
      "  DATABASE_URL_OWNER='...' node scripts/org-plan.mjs <slug> <plan> --yes",
  );
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  const [org] = await sql`
    SELECT id, name, plan, stripe_subscription_id
    FROM organizations
    WHERE slug = ${slug}
  `;
  if (!org) {
    console.error(`No organization with the slug "${slug}".`);
    process.exit(1);
  }
  if (org.plan === plan) {
    console.log(
      `"${org.name}" (/${slug}) is already on ${plan}. Nothing to do.`,
    );
    process.exit(0);
  }
  // Downgrading an organization that pays through Stripe here would leave the
  // subscription billing against a plan the app no longer thinks it has. The
  // subscription has to be cancelled in Stripe (or through the portal), which
  // fires customer.subscription.deleted and drops the plan on its own.
  if (org.stripe_subscription_id && plan !== "pro") {
    console.error(
      `"${org.name}" has an active Stripe subscription (${org.stripe_subscription_id}).\n` +
        "Cancel it in Stripe instead; the webhook moves the plan. Refusing to\n" +
        "leave the subscription and the plan column disagreeing.",
    );
    process.exit(1);
  }

  const [updated] = await sql`
    UPDATE organizations
    SET plan = ${plan}, updated_at = now()
    WHERE id = ${org.id}
    RETURNING slug, name, plan
  `;

  console.log(
    `"${updated.name}" (/${updated.slug}): ${org.plan} -> ${updated.plan}.`,
  );
  if (plan !== "free") {
    console.log(
      "Hard caps and Hobby limits no longer apply to this organization.",
    );
  }
} finally {
  await sql.end();
}
