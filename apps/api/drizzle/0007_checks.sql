CREATE TABLE "check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"check_id" uuid NOT NULL,
	"run_started_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"http_status" integer,
	"location" text DEFAULT 'default' NOT NULL,
	"error_code" text,
	"error_message" text,
	"assertions" jsonb,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"family" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"frequency_seconds" integer DEFAULT 300 NOT NULL,
	"locations" text[] DEFAULT ARRAY['default']::text[] NOT NULL,
	"run_parallel" boolean DEFAULT false NOT NULL,
	"retry_strategy" jsonb,
	"activated" boolean DEFAULT true NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"current_status" text DEFAULT 'unknown' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"consecutive_passes" integer DEFAULT 0 NOT NULL,
	"failing_since" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status_change_at" timestamp with time zone,
	"alert_trigger" jsonb DEFAULT '{"type":"run_count","runs":1}'::jsonb NOT NULL,
	"alert_on_degraded" boolean DEFAULT false NOT NULL,
	"alert_emails" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"alert_state" text DEFAULT 'ok' NOT NULL,
	"last_alerted_at" timestamp with time zone,
	"last_reminder_at" timestamp with time zone,
	"incident_automation" boolean DEFAULT false NOT NULL,
	"linked_project_id" uuid,
	"open_incident_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_linked_project_id_projects_id_fk" FOREIGN KEY ("linked_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_open_incident_id_incidents_id_fk" FOREIGN KEY ("open_incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_results_check_time_idx" ON "check_results" USING btree ("check_id","run_started_at");--> statement-breakpoint
CREATE INDEX "check_results_org_idx" ON "check_results" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checks_org_key_key" ON "checks" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "checks_due_idx" ON "checks" USING btree ("organization_id","next_run_at") WHERE "checks"."activated" and not "checks"."muted";--> statement-breakpoint
CREATE INDEX "checks_org_status_idx" ON "checks" USING btree ("organization_id","current_status");--> statement-breakpoint
CREATE INDEX "checks_org_idx" ON "checks" USING btree ("organization_id");--> statement-breakpoint
-- Tenant isolation: enable + force RLS and install the per-org policy on both new
-- tables, exactly like every other org-scoped table (helper from 0000_baseline).
SELECT public.flagon_apply_tenant_rls('public.checks');--> statement-breakpoint
SELECT public.flagon_apply_tenant_rls('public.check_results');--> statement-breakpoint
-- Grant the restricted app role, guarded so a database without flagon_app still
-- applies (matches the IF EXISTS pattern in the baseline grants block).
DO $rls$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.checks TO flagon_app$g$;
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_results TO flagon_app$g$;
  END IF;
END;
$rls$;