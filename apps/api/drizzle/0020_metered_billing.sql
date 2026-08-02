-- Metered billing: report usage to Stripe, exactly-once, and track per-period credit.
--
-- usage_events is the immutable billing truth (0016). This migration adds the
-- REPORTING claim (reported_at / report_id) alongside the existing compaction claim
-- (compacted_at), a ledger of what we sent to Stripe (usage_meter_reports, whose id
-- IS the Stripe meter-event identifier — the dedup key on Stripe's side), and an
-- idempotent record of the $20 credit grants issued per org per period.
--
-- Cross-tenant note: the reporting sweep runs as the restricted flagon_app role and
-- CANNOT read tenant tables across orgs (FORCE RLS). It instead enumerates
-- metered-eligible orgs from `organizations` (an auth table, no RLS) and processes
-- each inside withOrg(). So no cross-tenant scan of usage_events is ever needed, and
-- both new tables are ordinary tenant tables.

-- --- usage_events: the reporting claim -------------------------------------------
-- reported_at flips NULL -> now() exactly once when the receipt's quantity has been
-- folded into a meter-event send (mirrors compacted_at). report_id ties a receipt to
-- the usage_meter_reports row that carried it.
ALTER TABLE "usage_events" ADD COLUMN "reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "report_id" uuid;--> statement-breakpoint
-- The claim scan: receipts not yet reported, per org. Partial so it stays tiny.
CREATE INDEX "usage_events_unreported_idx" ON "usage_events" USING btree ("organization_id") WHERE "reported_at" IS NULL;--> statement-breakpoint

-- --- usage_meter_reports: the Stripe-reporting ledger ----------------------------
-- One row per (claim, source). `id` is passed to Stripe as the meter-event
-- `identifier` (its 24h dedup key); pairing it with our own status makes reporting
-- exactly-once across crashes: a row is created 'pending' in the claim transaction,
-- then flipped to 'sent' after billing.meterEvents.create succeeds. A crashed send
-- leaves a 'pending' row the next sweep re-sends with the SAME id.
CREATE TABLE "usage_meter_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	-- The durable-event source this report covers (e.g. 'flags.exposure').
	"source" text NOT NULL,
	-- The Stripe Billing Meter event_name usage was reported under.
	"event_name" text NOT NULL,
	-- The customer the meter event was attributed to (denormalized for the send).
	"stripe_customer_id" text NOT NULL,
	-- Exposures in this report (summed from the claimed receipts).
	"quantity" bigint NOT NULL,
	-- 'pending' (claimed, not yet sent), 'sent' (accepted by Stripe), 'skipped'.
	"status" text DEFAULT 'pending' NOT NULL,
	-- The 'YYYY-MM' the reported receipts fell in (for the tie-out).
	"period_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	-- Stamped when a Stripe MeterEventSummary has confirmed this send landed.
	"stripe_summary_verified_at" timestamp with time zone
);--> statement-breakpoint
-- The send/retry scan: rows still awaiting a Stripe send, per org. Partial, tiny.
CREATE INDEX "usage_meter_reports_pending_idx" ON "usage_meter_reports" USING btree ("organization_id") WHERE "status" = 'pending';--> statement-breakpoint
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('usage_meter_reports'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON usage_meter_reports TO flagon_app;
  END IF;
END $$;--> statement-breakpoint

-- --- billing_credit_grants: idempotent $20-credit ledger -------------------------
-- One row per (org, period). The UNIQUE constraint is the idempotency key: an INSERT
-- ... ON CONFLICT DO NOTHING that returns a row is the sole caller allowed to create
-- the Stripe credit grant for that period, so a webhook redelivery never double-grants.
CREATE TABLE "billing_credit_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	-- The Stripe credit grant id; NULL means "row claimed, Stripe create still owed"
	-- (a create that failed after the row was inserted — retried by the next trigger).
	"stripe_grant_id" text,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "billing_credit_grants_org_period_key" ON "billing_credit_grants" USING btree ("organization_id","period_key");--> statement-breakpoint
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('billing_credit_grants'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON billing_credit_grants TO flagon_app;
  END IF;
END $$;
