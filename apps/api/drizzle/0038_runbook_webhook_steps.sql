-- Typed action steps for runbooks, starting with `webhook`. A step can now carry a
-- `config` blob (webhook: {url, method}); task/link steps leave it null. This is the
-- extension point future action kinds (slack, pagerduty, jira) plug into.
ALTER TABLE "runbook_steps" ADD COLUMN "config" jsonb;--> statement-breakpoint

-- The delivery log for webhook action steps: one row per outbound POST attempt when
-- a runbook attaches to an incident, so the incident can show "webhook -> 200 OK"
-- and offer a resend. Tenant table (RLS).
CREATE TABLE "incident_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL REFERENCES "incidents"("id") ON DELETE cascade,
	"runbook_id" uuid,
	"runbook_name" text,
	"step_title" text NOT NULL,
	"url" text NOT NULL,
	"method" text NOT NULL,
	"ok" boolean NOT NULL,
	"status_code" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "incident_webhook_deliveries_incident_idx" ON "incident_webhook_deliveries" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "incident_webhook_deliveries_org_idx" ON "incident_webhook_deliveries" USING btree ("organization_id");--> statement-breakpoint

DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('incident_webhook_deliveries'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON incident_webhook_deliveries TO flagon_app';
  END IF;
END $$;
