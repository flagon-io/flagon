-- Atomic monthly usage counter.
--
-- usage_event_rollups (0010) is a per-DAY, per-source counter compacted from the
-- durable receipts, and reading a month of usage from it means summing ~31 rows.
-- This table is the exact MONTHLY total per org, incremented in the SAME
-- transaction as each durable receipt (see usage/events.ts ingestEvents), only
-- when the receipt is genuinely new (a deduplicated retry never increments). So
-- the counter is consistent-by-construction with sum(usage_events.quantity) for
-- the period, and gives an O(1) "used this month" for both the usage picture and
-- (once a plan's hard cap is turned on) the enforcement gate.
--
-- `period` is the UTC calendar month 'YYYY-MM', matching usage/allowance.ts
-- currentBillingPeriod. The notified_* stamps make warn-first threshold emails
-- at-most-once per threshold per period.
CREATE TABLE "org_usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	-- UTC calendar month, 'YYYY-MM'.
	"period" text NOT NULL,
	-- Exact events metered for this org in this period.
	"count" bigint DEFAULT 0 NOT NULL,
	-- Warn-first dedup: set the first time the org crosses 80% / 100% of a capped
	-- plan's included events this period, so a threshold email is sent at most once.
	"notified_80_at" timestamp with time zone,
	"notified_100_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- One row per org per month: the upsert target the ingest increment conflicts on.
CREATE UNIQUE INDEX "org_usage_counters_bucket_key" ON "org_usage_counters" USING btree ("organization_id","period");--> statement-breakpoint
-- Backfill the CURRENT period from the rollups so the counter is correct the moment
-- it exists, rather than starting every org at zero mid-month. Idempotent: the
-- unique key means a re-run does nothing new.
INSERT INTO "org_usage_counters" ("organization_id", "period", "count")
SELECT "organization_id", to_char("day", 'YYYY-MM') AS period, sum("count")::bigint
FROM "usage_event_rollups"
WHERE "day" >= date_trunc('month', now() AT TIME ZONE 'UTC')::date
GROUP BY "organization_id", to_char("day", 'YYYY-MM')
ON CONFLICT ("organization_id", "period") DO NOTHING;--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. org_usage_counters is TENANT data (org-scoped), same
-- discipline as usage_event_rollups (0010) and usage_events (0016): reuse
-- flagon_apply_tenant_rls so the policy can't drift, and grant the restricted
-- flagon_app role CRUD (RLS scopes WHICH rows). Without this the tenancy audit
-- fails closed on the new table.
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('org_usage_counters'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON org_usage_counters TO flagon_app;
  END IF;
END $$;
