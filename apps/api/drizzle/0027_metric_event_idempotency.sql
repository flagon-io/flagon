-- Metric goal events (experiment_metric_events) become idempotent per /track batch:
-- a retried batch with the same Idempotency-Key must be stored EXACTLY ONCE, or the
-- experiment stats double-count (billing already dedups on that key). Add a per-row
-- key ("<batch key>:<index>") and a PARTIAL unique index so keyed rows dedup while
-- keyless rows (the client opted out of idempotency) stay unconstrained. Additive,
-- null default, index concurrently-safe in effect (empty predicate on old rows):
-- safe to apply online.
ALTER TABLE "experiment_metric_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_metric_events_idem_key" ON "experiment_metric_events" USING btree ("organization_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;
