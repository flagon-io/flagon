/**
 * Backfill existing Pro subscriptions for metered billing: add the metered events
 * item and grant the current period's $20 credit. Run ONCE at launch for every
 * subscription created before metered billing (the flat-price subs + the comped
 * flagon sub). Metering starts here — NO historical usage is reported, so there is
 * no surprise back-bill. Idempotent: re-running adds nothing (ensureMeteredItem and
 * grantPeriodCredit both no-op when already done).
 *
 *   # dry run (default): show what would change for every entitled Pro org
 *   node --env-file=.env --import tsx scripts/backfill-metered.ts
 *   # one org
 *   node --env-file=.env --import tsx scripts/backfill-metered.ts --org flagon
 *   # write
 *   node --env-file=.env --import tsx scripts/backfill-metered.ts --apply
 *
 * Requires STRIPE_SECRET_KEY + a database connection.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { organizations } from "../src/db/auth-tables.js";
import { getStripe } from "../src/lib/stripe.js";
import { ensureMeteredItem, type BillingOrg } from "../src/lib/billing.js";
import { grantPeriodCredit, subscriptionPeriod } from "../src/lib/billing-credits.js";

const ENTITLING = ["active", "trialing", "past_due"];
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function processOrg(org: BillingOrg, apply: boolean): Promise<void> {
  if (!org.stripeSubscriptionId || !org.stripeCustomerId) {
    console.log(`  ${org.slug}: no Stripe subscription/customer — skip`);
    return;
  }
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
  console.log(`  ${org.slug}: subscription ${sub.id} (${sub.status})`);
  if (!apply) {
    console.log("    would: add metered item (if missing) + grant this period's $20 credit");
    return;
  }
  await ensureMeteredItem(sub);
  const period = subscriptionPeriod(sub);
  if (period) {
    const r = await grantPeriodCredit(org, period);
    console.log(`    metered item ensured; credit ${r.granted ? "granted" : "already present"}`);
  }
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("Set STRIPE_SECRET_KEY to run this.");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const slug = arg("org");
  console.log(apply ? "APPLY mode\n" : "DRY RUN (pass --apply to write)\n");

  const cols = {
    id: organizations.id,
    name: organizations.name,
    slug: organizations.slug,
    plan: organizations.plan,
    stripeCustomerId: organizations.stripeCustomerId,
    stripeSubscriptionId: organizations.stripeSubscriptionId,
    subscriptionStatus: organizations.subscriptionStatus,
  };

  const orgs = slug
    ? await db.select(cols).from(organizations).where(eq(organizations.slug, slug))
    : await db
        .select(cols)
        .from(organizations)
        .where(
          and(
            eq(organizations.plan, "pro"),
            inArray(organizations.subscriptionStatus, ENTITLING),
            isNotNull(organizations.stripeSubscriptionId),
          ),
        );

  if (orgs.length === 0) {
    console.log("No matching orgs.");
    return;
  }
  console.log(`Processing ${orgs.length} org(s):`);
  for (const org of orgs) await processOrg(org, apply);
  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
