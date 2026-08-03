/**
 * Metered-billing tie-out: prove that what we reported to Stripe matches Stripe's own
 * meter aggregation, for an org this month. Extends the receipts->rollups reconcile
 * one link further (rollups->Stripe). Read-only.
 *
 *   node --env-file=.env --import tsx scripts/reconcile-meter.ts --org flagon
 *
 * Compares:
 *   ours   = sum(usage_meter_reports.quantity WHERE status='sent', this period)
 *   stripe = sum(Stripe MeterEventSummary aggregated_value for the customer/meter)
 *
 * Requires STRIPE_SECRET_KEY + a database connection.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { organizations } from "../src/db/auth-tables.js";
import { usageMeterReports } from "../src/db/schema.js";
import { withOrg } from "../src/db/tenant.js";
import { getStripe, EVENTS_METER_EVENT_NAME } from "../src/lib/stripe.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const slug = arg("org");
  if (!slug) {
    console.error("Missing --org <slug>.");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("Set STRIPE_SECRET_KEY to run this.");
    process.exit(1);
  }

  const [org] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      stripeCustomerId: organizations.stripeCustomerId,
    })
    .from(organizations)
    .where(eq(organizations.slug, slug));
  if (!org) {
    console.error(`No org "${slug}".`);
    process.exit(1);
  }
  if (!org.stripeCustomerId) {
    console.error(`Org "${slug}" has no Stripe customer.`);
    process.exit(1);
  }

  const now = new Date();
  const periodKey = now.toISOString().slice(0, 7);
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  // A meter summary with a daily grouping window requires DAY-aligned bounds. monthStart
  // is already day-aligned; round the end UP to the next UTC midnight so today's usage is
  // included. (Stripe's dahlia API rejects hour-aligned bounds here, expecting the
  // enclosing day boundary — an hour-aligned end_time 400s the request.)
  const DAY = 86400;
  const endTime = Math.ceil(now.getTime() / 1000 / DAY) * DAY;

  // Ours: the sent report rows for this period.
  const sentRows = await withOrg(org.id, (tx) =>
    tx
      .select({ quantity: usageMeterReports.quantity, status: usageMeterReports.status })
      .from(usageMeterReports)
      .where(
        and(
          eq(usageMeterReports.organizationId, org.id),
          eq(usageMeterReports.periodKey, periodKey),
        ),
      ),
  );
  const ours = sentRows
    .filter((r) => r.status === "sent")
    .reduce((s, r) => s + Number(r.quantity), 0);
  const pending = sentRows.filter((r) => r.status === "pending").length;

  // Stripe: the meter's aggregated value for the customer this period.
  const stripe = getStripe();
  const meters = await stripe.billing.meters.list({ status: "active", limit: 100 });
  const meter = meters.data.find((m) => m.event_name === EVENTS_METER_EVENT_NAME);
  if (!meter) {
    console.error(`No active meter "${EVENTS_METER_EVENT_NAME}".`);
    process.exit(1);
  }
  let stripeTotal = 0;
  const summaries = await stripe.billing.meters.listEventSummaries(meter.id, {
    customer: org.stripeCustomerId,
    start_time: monthStart,
    end_time: endTime,
    value_grouping_window: "day",
  });
  for (const s of summaries.data) stripeTotal += s.aggregated_value;

  console.log(`org: ${slug} (${org.stripeCustomerId}), period ${periodKey}`);
  console.log(`  ours (sent report rows):   ${ours.toLocaleString()}`);
  console.log(`  stripe (meter summary):    ${stripeTotal.toLocaleString()}`);
  console.log(`  pending (not yet sent):    ${pending}`);
  const match = ours === stripeTotal;
  console.log(`  => ${match ? "MATCH ✓" : "MISMATCH ✗"}`);
  if (!match) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
