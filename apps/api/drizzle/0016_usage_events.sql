-- Durable, billing-grade usage ingest.
--
-- usage_event_rollups (0010) is a best-effort DAILY COUNTER: great for the usage
-- picture, wrong to invoice on (a client retry double-counts, a swallowed write
-- silently drops). This table is the AUDITABLE TRUTH underneath it: one immutable
-- receipt per ingest batch, deduplicated by a client idempotency key, then
-- compacted EXACTLY-ONCE into the rollups. Billing reconciles to this log.
--
--   ingest  -> insert a receipt (ON CONFLICT DO NOTHING on the dedup key)
--   compact -> claim uncompacted receipts (UPDATE ... RETURNING) and fold their
--              quantities into usage_event_rollups, in one transaction
--
-- Rows are never updated except to stamp compacted_at, and never deleted: the log
-- stays a permanent, reconcilable record of what we metered.
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	-- What produced the batch, namespaced by product ("flags.exposure" today),
	-- matching usage_event_rollups.source so compaction folds like into like.
	"source" text DEFAULT 'flags.exposure' NOT NULL,
	-- The client's retry identity for this batch. Two POSTs with the same key are
	-- the SAME batch: the second is a no-op. Absent a client key, ingest mints a
	-- unique one (durable, but not deduplicated).
	"idempotency_key" text NOT NULL,
	-- Events in the batch. Folded into the rollup's running count at compaction.
	"quantity" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- UTC day of occurred_at, precomputed so compaction groups by (day, source)
	-- without re-deriving it, and aligns to the rollup bucket key.
	"day" date NOT NULL,
	-- NULL until folded into usage_event_rollups; the stamp that makes compaction
	-- exactly-once (a claimed row can never be claimed again).
	"compacted_at" timestamp with time zone
);
--> statement-breakpoint
-- Idempotency: a client that retries a batch with the same key never double-counts.
CREATE UNIQUE INDEX "usage_events_idempotency_key" ON "usage_events" USING btree ("organization_id","source","idempotency_key");--> statement-breakpoint
-- Compaction scan: the receipts not yet folded into the rollups, per org. Partial
-- so it stays tiny — once compacted, a row leaves the index.
CREATE INDEX "usage_events_uncompacted_idx" ON "usage_events" USING btree ("organization_id") WHERE "compacted_at" IS NULL;--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. usage_events is TENANT data (org-scoped), same discipline
-- as usage_event_rollups (0010) and flag_eval_rollups (0004): reuse
-- flagon_apply_tenant_rls so the policy can't drift, and grant the restricted
-- flagon_app role CRUD (RLS scopes WHICH rows; the app itself never deletes).
-- Without this the tenancy audit fails closed on the new table.
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('usage_events'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON usage_events TO flagon_app;
  END IF;
END $$;
