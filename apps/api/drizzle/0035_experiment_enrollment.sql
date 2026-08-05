-- Experiment correctness: per-experiment enrollment + frozen metric definitions.
--
-- PROBLEM THIS FIXES. Until now an experiment was a purely RETROACTIVE view over
-- flag_exposures (the flag-lifetime assignment log), windowed only by the org's
-- retention days — never by the experiment's own start/stop. Two consequences:
--   1. An experiment created on a flag that already had traffic opened ALREADY
--      DECIDED off pre-experiment history ("auto-fail on previous data").
--   2. Because flag_exposures freezes a unit on its FIRST-EVER exposure to the
--      flag, a unit that had already seen the flag could never enroll in a LATER
--      experiment — so re-running the same test over time (checkout v1..v4)
--      starved: only never-before-seen units enrolled.
--
-- FIX. `experiment_exposures` records enrollment PER EXPERIMENT (not per flag):
-- one row the first time a unit is exposed WHILE a given experiment is running,
-- frozen per (experiment, unit). Enrollment is therefore naturally windowed to the
-- experiment's active life, and every experiment — including repeats on the same
-- flag — gets its own clean enrollment set. flag_exposures stays exactly as-is for
-- always-on, retroactive FLAG-level impact (an observational read, correctly
-- retroactive); experiments now read experiment_exposures instead.
--
-- Also freezes each experiment's METRIC DEFINITION at start: the analysis reads
-- snapshot columns on experiment_metric_links, so editing a reusable metric later
-- (its event name, type, value field, direction) never silently rewrites the
-- meaning of a past experiment's results.
--
-- Tenant data — same RLS discipline as 0025 (reuse flagon_apply_tenant_rls and
-- grant the restricted flagon_app role CRUD) or the tenancy audit fails closed.

-- Per-experiment enrollment: which arm a unit saw the first time it was exposed
-- while THIS experiment was running. The variant is what the flag actually served
-- at enrollment; first_seen_at is the enrollment moment (goal events before it are
-- the CUPED pre-period, never the response).
CREATE TABLE "experiment_exposures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL REFERENCES "experiments"("id") ON DELETE cascade,
	"variant_key" text NOT NULL,
	-- Salted sha256 of the targeting key (lib/unit-hash.ts); never the raw key.
	"unit_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day" date NOT NULL
);
--> statement-breakpoint
-- One enrollment per (experiment, unit): ingest is idempotent per unit and the
-- assignment is frozen for the life of the experiment (a unit can't flip arms).
CREATE UNIQUE INDEX "experiment_exposures_exp_unit_key" ON "experiment_exposures" USING btree ("experiment_id","unit_hash");--> statement-breakpoint
CREATE INDEX "experiment_exposures_org_idx" ON "experiment_exposures" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "experiment_exposures_exp_variant_idx" ON "experiment_exposures" USING btree ("experiment_id","variant_key");--> statement-breakpoint

-- Frozen metric definition per experiment↔metric attachment. The reusable
-- experiment_metrics row stays editable; these snapshot columns capture what the
-- metric MEANT for this experiment, stamped at attach and re-stamped at start.
-- Nullable: a null column falls back to the live metric definition (older links
-- backfilled below), so analysis is always well-defined.
ALTER TABLE "experiment_metric_links" ADD COLUMN "metric_type" text;--> statement-breakpoint
ALTER TABLE "experiment_metric_links" ADD COLUMN "event_name" text;--> statement-breakpoint
ALTER TABLE "experiment_metric_links" ADD COLUMN "value_field" text;--> statement-breakpoint
ALTER TABLE "experiment_metric_links" ADD COLUMN "direction" text;--> statement-breakpoint
-- Backfill existing links from the current metric definition (snapshot as-of now).
UPDATE "experiment_metric_links" l
	SET "metric_type" = m."type",
	    "event_name" = m."event_name",
	    "value_field" = m."value_field",
	    "direction" = m."direction"
	FROM "experiment_metrics" m
	WHERE m."id" = l."metric_id";--> statement-breakpoint

-- RLS for the new tenant table (the altered table already has its policy from 0025).
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('experiment_exposures'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON experiment_exposures TO flagon_app';
  END IF;
END $$;
