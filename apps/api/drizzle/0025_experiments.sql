-- Experiments: measured rollouts built on top of flags.
--
-- An experiment IS a flag — the serving flag's deterministic bucketing
-- (flags/evaluate.ts) is the assignment engine, UNCHANGED, and OpenFeature SDKs
-- assign users to arms through the standard OFREP evaluate response. These tables
-- add the ANALYSIS substrate: reusable experiment-metric definitions, the
-- experiment itself, its metric links, the per-unit assignment log, per-unit goal
-- events, and daily per-variant aggregates the stats engine reads.
--
-- NAMING: every table is prefixed `experiment_` (and the billing source is
-- `experiments.metric`) so this feature's "metrics" never collide with a future
-- OTEL/observability metrics product. These are EXPERIMENT goal metrics, a
-- distinct concept kept entirely within the experiments feature.
--
-- Every table is TENANT data (org-scoped): same RLS discipline as flags — reuse
-- flagon_apply_tenant_rls (0002) and grant the restricted flagon_app role CRUD,
-- or the tenancy audit fails closed on the new tables.
--
-- Billing is NOT here: goal (metric) events meter through the shared durable spine
-- (usage_events, 0016) under source "experiments.metric"; these tables carry only
-- what the statistics engine needs. Unit identities are a SALTED HASH of the
-- targeting key (lib/unit-hash.ts) — a raw targeting key is never persisted.

-- Reusable experiment-metric (goal) definitions.
CREATE TABLE "experiment_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	-- 'conversion' | 'count' | 'mean' | 'sum' — the aggregation over the event.
	"type" text DEFAULT 'conversion' NOT NULL,
	-- The track() event name whose occurrences feed this metric.
	"event_name" text NOT NULL,
	-- JSON path into the event for the numeric value ('mean'/'sum' metrics).
	"value_field" text,
	-- 'increase' = higher is the win; 'decrease' = lower is better.
	"direction" text DEFAULT 'increase' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_metrics_org_key_key" ON "experiment_metrics" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "experiment_metrics_org_idx" ON "experiment_metrics" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "experiment_metrics_org_event_idx" ON "experiment_metrics" USING btree ("organization_id","event_name");--> statement-breakpoint

-- The experiment: a measured rollout of one flag in one environment.
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text,
	"flag_id" uuid NOT NULL REFERENCES "flags"("id") ON DELETE cascade,
	"environment_id" uuid NOT NULL REFERENCES "environments"("id") ON DELETE cascade,
	-- 'draft' | 'running' | 'stopped' | 'archived'.
	"status" text DEFAULT 'draft' NOT NULL,
	-- The variant key treated as the control (baseline) arm.
	"control_variant_key" text,
	-- Percent (0-100) of eligible traffic that enters the experiment.
	"allocation" integer DEFAULT 100 NOT NULL,
	-- Context path to bucket by; null = the evaluation targetingKey.
	"bucket_by" text,
	-- Analysis configuration.
	"confidence_level" integer DEFAULT 95 NOT NULL,
	"sequential" boolean DEFAULT true NOT NULL,
	"correction" text DEFAULT 'none' NOT NULL,
	"cuped" boolean DEFAULT false NOT NULL,
	"primary_metric_id" uuid REFERENCES "experiment_metrics"("id") ON DELETE set null,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	-- 'ship' | 'rollback' | 'inconclusive', set when the experiment is decided.
	"decision" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "experiments_org_key_key" ON "experiments" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "experiments_org_idx" ON "experiments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "experiments_flag_idx" ON "experiments" USING btree ("flag_id");--> statement-breakpoint

-- The link between an experiment and a metric definition, each with a role.
CREATE TABLE "experiment_metric_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL REFERENCES "experiments"("id") ON DELETE cascade,
	"metric_id" uuid NOT NULL REFERENCES "experiment_metrics"("id") ON DELETE cascade,
	-- 'primary' | 'secondary' | 'guardrail'.
	"role" text DEFAULT 'secondary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_metric_links_exp_metric_key" ON "experiment_metric_links" USING btree ("experiment_id","metric_id");--> statement-breakpoint
CREATE INDEX "experiment_metric_links_org_idx" ON "experiment_metric_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "experiment_metric_links_exp_idx" ON "experiment_metric_links" USING btree ("experiment_id");--> statement-breakpoint

-- The per-unit assignment truth, keyed to the FLAG (always-on): which variant a
-- unit first saw for a flag in an environment. Written for every attributed
-- exposure, experiment or not, so flag-level impact and experiments share it.
CREATE TABLE "flag_exposures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL REFERENCES "flags"("id") ON DELETE cascade,
	"environment_id" uuid NOT NULL REFERENCES "environments"("id") ON DELETE cascade,
	"variant_key" text NOT NULL,
	-- Salted sha256 of the targeting key (lib/unit-hash.ts); never the raw key.
	"unit_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day" date NOT NULL
);
--> statement-breakpoint
-- One assignment per (flag, environment, unit): ingest is idempotent per unit and
-- the assignment is frozen (a unit can't flip arms).
CREATE UNIQUE INDEX "flag_exposures_flag_env_unit_key" ON "flag_exposures" USING btree ("flag_id","environment_id","unit_hash");--> statement-breakpoint
CREATE INDEX "flag_exposures_org_idx" ON "flag_exposures" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "flag_exposures_flag_env_variant_idx" ON "flag_exposures" USING btree ("flag_id","environment_id","variant_key");--> statement-breakpoint

-- The metrics "watched" on a flag: which goal metrics show impact on the flag,
-- independent of any experiment.
CREATE TABLE "flag_metric_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL REFERENCES "flags"("id") ON DELETE cascade,
	"metric_id" uuid NOT NULL REFERENCES "experiment_metrics"("id") ON DELETE cascade,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "flag_metric_links_flag_metric_key" ON "flag_metric_links" USING btree ("flag_id","metric_id");--> statement-breakpoint
CREATE INDEX "flag_metric_links_org_idx" ON "flag_metric_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "flag_metric_links_flag_idx" ON "flag_metric_links" USING btree ("flag_id");--> statement-breakpoint

-- Per-unit goal events — the analysis detail behind experiment metrics (billing
-- is separate).
CREATE TABLE "experiment_metric_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	-- Salted hash of the targeting key; the join key to experiment_exposures.
	"unit_hash" text NOT NULL,
	"event_name" text NOT NULL,
	"value" double precision DEFAULT 1 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day" date NOT NULL
);
--> statement-breakpoint
CREATE INDEX "experiment_metric_events_org_event_idx" ON "experiment_metric_events" USING btree ("organization_id","event_name");--> statement-breakpoint
CREATE INDEX "experiment_metric_events_org_unit_idx" ON "experiment_metric_events" USING btree ("organization_id","unit_hash");--> statement-breakpoint
CREATE INDEX "experiment_metric_events_org_day_idx" ON "experiment_metric_events" USING btree ("organization_id","day");--> statement-breakpoint

-- Daily per-(experiment, metric, variant) sufficient statistics for the engine.
CREATE TABLE "experiment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL REFERENCES "experiments"("id") ON DELETE cascade,
	"metric_id" uuid NOT NULL REFERENCES "experiment_metrics"("id") ON DELETE cascade,
	"variant_key" text NOT NULL,
	"day" date NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"metric_sum" double precision DEFAULT 0 NOT NULL,
	"metric_sum_sq" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_results_bucket_key" ON "experiment_results" USING btree ("experiment_id","metric_id","variant_key","day");--> statement-breakpoint
CREATE INDEX "experiment_results_org_idx" ON "experiment_results" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "experiment_results_exp_idx" ON "experiment_results" USING btree ("experiment_id");--> statement-breakpoint

-- A holdout: a deterministic global control group held out of all experiments in
-- an environment (Statsig's holdout). Enforced at evaluation time.
CREATE TABLE "holdouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL REFERENCES "environments"("id") ON DELETE cascade,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"percentage" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "holdouts_org_key_key" ON "holdouts" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "holdouts_org_idx" ON "holdouts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "holdouts_env_status_idx" ON "holdouts" USING btree ("environment_id","status");--> statement-breakpoint

-- =============================================================================
-- ROW-LEVEL SECURITY. All TENANT data — reuse flagon_apply_tenant_rls so
-- the policy can't drift, and grant the restricted flagon_app role CRUD (RLS
-- scopes WHICH rows). Without this the tenancy audit fails closed.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'experiment_metrics',
    'experiments',
    'experiment_metric_links',
    'flag_exposures',
    'flag_metric_links',
    'experiment_metric_events',
    'experiment_results',
    'holdouts'
  ]
  LOOP
    PERFORM flagon_apply_tenant_rls(tbl::regclass);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO flagon_app', tbl);
    END IF;
  END LOOP;
END $$;
