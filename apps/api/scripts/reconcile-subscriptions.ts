/**
 * Replay Stripe subscription state into the LOCAL database — the webhook backfill.
 *
 * When your Stripe webhook listener isn't running (a very common local-dev case:
 * you upgrade an org to Pro in the Stripe sandbox, but nothing was forwarding
 * `customer.subscription.*` to your API), the org's billing columns go stale and
 * the org stays locked even though Stripe says it's paying. This walks every
 * subscription in the Stripe account `STRIPE_SECRET_KEY` points at and applies it
 * to its org using the EXACT functions the webhook uses (billing.ts
 * `syncSubscription` / `handleSubscriptionDeleted`) — one source of truth, so the
 * result is identical to having received the events live.
 *
 * It is idempotent (a no-op once the DB already matches Stripe) and safe to re-run
 * any time your local billing state drifts. Because it only mirrors Stripe -> DB
 * (never the reverse), it is the same operation the webhook performs; it does not
 * touch Stripe.
 *
 * Usage (from apps/api):
 *   npm run stripe:reconcile              # sync every subscription
 *   node --env-file=.env --import tsx scripts/reconcile-subscriptions.ts --org acme
 *
 * Requires STRIPE_SECRET_KEY and a DB connection (APP_DATABASE_URL / DATABASE_URL),
 * exactly like running the API itself.
 */
import { getStripe } from "../src/lib/stripe.js";
import {
  handleSubscriptionDeleted,
  syncSubscription,
} from "../src/lib/billing.js";

// A subscription in one of these terminal states is treated like a deletion (the
// org keeps its plan but locks); everything else is applied as live state.
const TERMINAL = new Set(["canceled", "incomplete_expired"]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log(
      "stripe:reconcile — STRIPE_SECRET_KEY not set; nothing to do (billing not configured).",
    );
    return;
  }
  const stripe = getStripe();
  const onlyOrg = arg("org");
  const live = process.env.STRIPE_SECRET_KEY.startsWith("sk_live");
  console.log(
    `stripe:reconcile — ${live ? "LIVE" : "test"} mode${onlyOrg ? `, filtering to org "${onlyOrg}"` : ""}`,
  );

  let synced = 0;
  let unmatched = 0;
  let skipped = 0;

  for await (const sub of stripe.subscriptions.list({
    status: "all",
    limit: 100,
  })) {
    // --org filters by the org slug stamped into checkout subscription metadata.
    if (onlyOrg && sub.metadata?.flagon_org_slug !== onlyOrg) {
      skipped++;
      continue;
    }

    const orgId = TERMINAL.has(sub.status)
      ? await handleSubscriptionDeleted(sub)
      : await syncSubscription(sub);

    if (orgId) {
      synced++;
      console.log(`  ✓ ${sub.id} (${sub.status}) -> org ${orgId}`);
    } else {
      unmatched++;
      const customer =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      console.log(
        `  – ${sub.id} (${sub.status}) has no local org (customer ${customer}); skipped`,
      );
    }
  }

  console.log(
    `stripe:reconcile done — ${synced} synced, ${unmatched} with no local org${onlyOrg ? `, ${skipped} other orgs skipped` : ""}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("stripe:reconcile FAILED:", err);
    process.exit(1);
  });
