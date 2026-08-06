-- Checks (synthetic monitoring) — the detection layer of the reliability product. A
-- `check` probes a target on a schedule and holds an up/degraded/down state with
-- confirmation thresholds; `check_results` is the heartbeat log. Both are TENANT
-- tables (org-scoped, RLS). This migration also closes the circular link with
-- incidents: `checks.active_incident_id -> incidents.id` and
-- `incidents.source_check_id -> checks.id`, both ON DELETE SET NULL (added here now
-- that both tables exist).
CREATE TABLE "checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assertions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"interval_seconds" integer DEFAULT 300 NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"failure_threshold" integer DEFAULT 3 NOT NULL,
	"recovery_threshold" integer DEFAULT 2 NOT NULL,
	"action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"consecutive_successes" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_status_changed_at" timestamp with time zone,
	"last_latency_ms" integer,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_incident_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"check_id" uuid NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"status_code" integer,
	"response_ms" integer,
	"error" text,
	"region" text
);
--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_active_incident_id_incidents_id_fk" FOREIGN KEY ("active_incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_source_check_id_checks_id_fk" FOREIGN KEY ("source_check_id") REFERENCES "public"."checks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checks_org_key_key" ON "checks" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "checks_org_idx" ON "checks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "checks_project_idx" ON "checks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "checks_org_status_idx" ON "checks" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "checks_due_idx" ON "checks" USING btree ("enabled","paused","next_run_at");--> statement-breakpoint
CREATE INDEX "check_results_check_idx" ON "check_results" USING btree ("check_id","ran_at");--> statement-breakpoint
CREATE INDEX "check_results_org_idx" ON "check_results" USING btree ("organization_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. Both are TENANT tables: reuse flagon_apply_tenant_rls so the
-- policy can't drift, and grant the restricted flagon_app role CRUD (RLS scopes WHICH
-- rows). Without this the tenancy audit fails closed on them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['checks', 'check_results'] LOOP
    PERFORM flagon_apply_tenant_rls(t::regclass);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO flagon_app', t);
    END IF;
  END LOOP;
END $$;
