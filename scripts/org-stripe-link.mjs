// Links an organization to a Stripe customer it did not reach through Checkout.
//
// Self-serve Pro sets stripe_customer_id as a side effect of paying. A
// contract customer never touches Checkout: their customer and subscription
// are created in Stripe by hand, which leaves the organization with no link to
// them - and that link is what the billing portal is opened by. Without it,
// an enterprise customer cannot see an invoice, change a card, or download a
// receipt, no matter what the contract says.
//
//   node scripts/org-stripe-link.mjs <org-slug> --create [--email a@b] [--yes]
//   node scripts/org-stripe-link.mjs <org-slug> <cus_...> [sub_...] [--yes]
//
// --create makes the customer too, named after the organization and addressed
// to its owner, so onboarding a contract customer is one command rather than a
// dashboard visit and a copied id. It is IDEMPOTENT: a customer already
// carrying this organization's id in its metadata is reused rather than
// duplicated, because two customers for one organization means two billing
// histories and only one of them reaches the portal.
//
// With a subscription, the org also picks up that subscription's CYCLE, so
// the usage page and any true-up read the same window Stripe bills on.
//
// Refuses to steal a customer already linked to another organization, and
// verifies every object exists in the Stripe account the key points at - the
// cheapest way to catch a test-mode id pasted into a live deployment.
import { config } from "dotenv";
import postgres from "postgres";
import Stripe from "stripe";
import { resolveOwnerUrl, resolveOwnerUrlSource } from "./db-urls.mjs";

if (!process.argv.includes("--no-dotenv")) {
  config({ path: [".env.local", ".env"] });
}

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const [slug, customerId, subscriptionId] = args;
const create = process.argv.includes("--create");
const emailFlag = process.argv
  .find((arg) => arg.startsWith("--email="))
  ?.slice("--email=".length);

if (!slug || (!customerId && !create)) {
  console.error(
    "Usage:\n" +
      "  node scripts/org-stripe-link.mjs <org-slug> --create [--email=a@b] [--yes]\n" +
      "  node scripts/org-stripe-link.mjs <org-slug> <cus_...> [sub_...] [--yes]",
  );
  process.exit(1);
}
if (customerId && !customerId.startsWith("cus_")) {
  console.error("The customer id should look like cus_...");
  process.exit(1);
}
if (create && customerId) {
  console.error("Pass --create OR a customer id, not both.");
  process.exit(1);
}
if (subscriptionId && !subscriptionId.startsWith("sub_")) {
  console.error("The subscription id should look like sub_...");
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set; nothing to verify against.");
  process.exit(1);
}

const url = resolveOwnerUrl();
if (!url) {
  console.error("No owner database URL configured.");
  process.exit(1);
}

const target = new URL(url);
const isLocal = ["localhost", "127.0.0.1", "::1", "postgres"].includes(
  target.hostname,
);
console.log(
  `Target database: ${target.hostname}${target.port ? `:${target.port}` : ""}${target.pathname}` +
    `${isLocal ? " (local)" : ""} (from ${resolveOwnerUrlSource()})`,
);
console.log(`Stripe mode: ${key.startsWith("sk_test_") ? "TEST" : "LIVE"}\n`);

if (!isLocal && !process.argv.includes("--yes")) {
  console.error("Not a local database. Re-run with --yes to confirm.");
  process.exit(1);
}

const stripe = new Stripe(key);
const sql = postgres(url, { max: 1 });

/**
 * A missing object is the EXPECTED failure here, not a crash: the usual cause
 * is a test-mode id pasted into a live run (or the reverse), and a Stripe
 * stack trace buries that.
 */
async function fetchOrExit(what, load) {
  try {
    return await load();
  } catch (error) {
    console.error(
      `${what} could not be read from Stripe (${key.startsWith("sk_test_") ? "test" : "live"} mode): ` +
        `${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

try {
  const [org] = await sql`
    SELECT id, name, plan, stripe_customer_id FROM organizations
    WHERE slug = ${slug}
  `;
  if (!org) {
    console.error(`No organization with the slug "${slug}".`);
    process.exit(1);
  }

  let linkCustomerId = customerId;

  if (create) {
    if (org.stripe_customer_id) {
      console.error(
        `/${slug} is already linked to ${org.stripe_customer_id}.\n` +
          "Nothing to create. Pass that id explicitly if you meant to re-link it.",
      );
      process.exit(1);
    }

    // The organization's OWNER is the billing contact by default: they are the
    // one account guaranteed to exist, and Stripe needs an address to send a
    // receipt or a dunning email to.
    const [owner] = await sql`
      SELECT u.email FROM members m
      JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ${org.id} AND m.role = 'owner'
      LIMIT 1
    `;
    const email = emailFlag ?? owner?.email ?? null;
    if (!email) {
      console.error(
        "No billing email: the organization has no owner, so pass --email=someone@example.com.",
      );
      process.exit(1);
    }

    // Re-running must not mint a second customer for the organization: two
    // customers means two billing histories and only one of them is reachable
    // from the portal. TWO mechanisms, because neither covers the whole range
    // on its own.
    //
    // 1. Search on the metadata join key. Stripe's search index is EVENTUALLY
    //    consistent - a customer created seconds ago is not in it yet - so
    //    this catches older duplicates but not a re-run seconds later. That
    //    exact gap produced a second customer the first time this was tested.
    const existing = await fetchOrExit("customer search", () =>
      stripe.customers.search({
        query: `metadata['flagon_organization_id']:'${org.id}'`,
        limit: 1,
      }),
    );
    if (existing.data[0]) {
      linkCustomerId = existing.data[0].id;
      console.log(
        `Reusing ${linkCustomerId}, which already carries this organization's id.`,
      );
    } else {
      // 2. An idempotency key derived from the organization id. Stripe replays
      //    the original response for a repeated key, so a re-run inside the
      //    key's 24-hour lifetime returns the SAME customer instead of making
      //    another - which is precisely the window the search index misses.
      const created = await fetchOrExit("customer creation", () =>
        stripe.customers.create(
          {
            name: org.name,
            email,
            metadata: {
              flagon_organization_id: org.id,
              flagon_organization_slug: slug,
            },
          },
          { idempotencyKey: `flagon-customer-${org.id}` },
        ),
      );
      linkCustomerId = created.id;
      console.log(`Created (or replayed) ${linkCustomerId} for ${email}.`);
    }
  } else {
    const customer = await fetchOrExit(customerId, () =>
      stripe.customers.retrieve(customerId),
    );
    if (customer.deleted) {
      console.error(`${customerId} is a deleted customer.`);
      process.exit(1);
    }
  }

  let cycle = null;
  if (subscriptionId) {
    const subscription = await fetchOrExit(subscriptionId, () =>
      stripe.subscriptions.retrieve(subscriptionId),
    );
    const subscriptionCustomer =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    if (subscriptionCustomer !== linkCustomerId) {
      console.error(
        `${subscriptionId} belongs to ${subscriptionCustomer}, not ${linkCustomerId}.`,
      );
      process.exit(1);
    }
    const item = subscription.items?.data?.[0];
    if (item?.current_period_start && item?.current_period_end) {
      cycle = {
        start: new Date(item.current_period_start * 1000),
        end: new Date(item.current_period_end * 1000),
      };
    }
  }

  const [conflict] = await sql`
    SELECT slug FROM organizations
    WHERE stripe_customer_id = ${linkCustomerId} AND id <> ${org.id}
  `;
  if (conflict) {
    console.error(
      `${linkCustomerId} is already linked to /${conflict.slug}. One customer, one organization.`,
    );
    process.exit(1);
  }

  await sql`
    UPDATE organizations
    SET stripe_customer_id = ${linkCustomerId},
        stripe_subscription_id = ${subscriptionId ?? null},
        current_period_start = ${cycle?.start ?? null},
        current_period_end = ${cycle?.end ?? null},
        updated_at = now()
    WHERE id = ${org.id}
  `;

  console.log(`Linked /${slug} (${org.plan}) to ${linkCustomerId}.`);
  if (subscriptionId) console.log(`Subscription: ${subscriptionId}`);
  if (cycle) {
    console.log(
      `Cycle: ${cycle.start.toISOString().slice(0, 10)} -> ${cycle.end.toISOString().slice(0, 10)}`,
    );
  }
  console.log(
    "\nThe billing portal is now reachable from this organization's Billing page.",
  );
  if (org.plan === "enterprise") {
    console.log(
      "Plan is enterprise, so usage is NOT attached to its invoices automatically\n" +
        "(src/lib/plans.ts, usageIsAutoInvoiced). Bill the contract in Stripe.",
    );
  }
} finally {
  await sql.end();
}
