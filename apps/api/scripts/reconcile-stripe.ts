/**
 * Reconcile an existing organization with a Stripe customer/subscription.
 *
 * Use this ONCE per org that already exists in Stripe but predates the billing
 * code: the flagon org whose customer + discounted subscription were created in
 * the dashboard, and any org sitting on `plan='pro'` from the old free
 * self-grant. It links the three billing columns onto the org row so the
 * webhook, billing portal, and plan gates all agree with Stripe going forward.
 * The existing coupon/discount lives on the Stripe subscription and is left
 * untouched — this only records the mapping.
 *
 * Read-only by default; pass --apply to write. Runs as the OWNER DB role (it
 * writes the organizations auth table, which has no RLS), so use DATABASE_URL /
 * DATABASE_URL_UNPOOLED, not the restricted APP_DATABASE_URL.
 *
 * Usage (from apps/api):
 *   # inspect: show the org row + the customer's Stripe subscriptions
 *   node --env-file=.env --import tsx scripts/reconcile-stripe.ts \
 *     --org <org-slug> [--customer cus_xxx]
 *
 *   # write the mapping (and set plan=pro if a live subscription exists)
 *   node --env-file=.env --import tsx scripts/reconcile-stripe.ts \
 *     --org <org-slug> --customer cus_xxx --apply
 *
 * If --customer is omitted, the org's existing stripe_customer_id is used.
 * Requires STRIPE_SECRET_KEY (and DATABASE_URL) in the environment.
 */
import postgres from "postgres";
import Stripe from "stripe";

const ENTITLING = new Set(["active", "trialing", "past_due"]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const slug = arg("org");
  const customerArg = arg("customer");
  const apply = hasFlag("apply");

  if (!slug) {
    console.error("Missing --org <slug>. See the header of this file for usage.");
    process.exit(1);
  }
  const dbUrl =
    process.env.MIGRATE_DATABASE_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Set DATABASE_URL (owner role) to run this.");
    process.exit(1);
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("Set STRIPE_SECRET_KEY to run this.");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { max: 1 });
  const stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });

  try {
    const orgs = await sql`
      SELECT id, name, slug, plan, stripe_customer_id, stripe_subscription_id, subscription_status
      FROM organizations WHERE slug = ${slug} LIMIT 1
    `;
    const org = orgs[0];
    if (!org) {
      console.error(`No organization with slug "${slug}".`);
      process.exit(1);
    }
    console.log("Organization (current):", org);

    const customerId = customerArg ?? org.stripe_customer_id;
    if (!customerId) {
      console.error(
        "No Stripe customer known. Pass --customer cus_xxx (find it in the Stripe dashboard).",
      );
      process.exit(1);
    }

    // List the customer's subscriptions and choose the one that entitles Pro.
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    console.log(
      `\nStripe subscriptions for ${customerId}:`,
      subs.data.map((s) => ({
        id: s.id,
        status: s.status,
        discounts: s.discounts,
      })),
    );

    const live =
      subs.data.find((s) => ENTITLING.has(s.status)) ?? subs.data[0] ?? null;
    if (!live) {
      console.warn(
        "\nThis customer has no subscriptions. Will link the customer id only; plan left as-is.",
      );
    }

    const entitled = live ? ENTITLING.has(live.status) : false;
    const nextPlan =
      org.plan === "enterprise" ? "enterprise" : entitled ? "pro" : org.plan;

    const plan = {
      stripe_customer_id: customerId,
      stripe_subscription_id: live?.id ?? org.stripe_subscription_id ?? null,
      subscription_status: live?.status ?? org.subscription_status ?? null,
      plan: nextPlan,
    };
    console.log("\nWould set:", plan);

    if (!apply) {
      console.log("\nDry run. Re-run with --apply to write these values.");
      return;
    }

    await sql`
      UPDATE organizations SET
        stripe_customer_id = ${plan.stripe_customer_id},
        stripe_subscription_id = ${plan.stripe_subscription_id},
        subscription_status = ${plan.subscription_status},
        plan = ${plan.plan}
      WHERE id = ${org.id}
    `;
    console.log("\nApplied. Org is now reconciled with Stripe.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
