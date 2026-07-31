CREATE TABLE "usage_event_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"source" text DEFAULT 'exposure' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "usage_event_rollups_bucket_key" ON "usage_event_rollups" USING btree ("organization_id","day","source");--> statement-breakpoint
CREATE INDEX "usage_event_rollups_org_idx" ON "usage_event_rollups" USING btree ("organization_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. usage_event_rollups is TENANT data (org-scoped), same
-- discipline as flag_eval_rollups (0004): reuse flagon_apply_tenant_rls so the
-- policy can't drift, and grant the restricted flagon_app role CRUD (RLS scopes
-- WHICH rows). Without this the tenancy audit fails closed on the new table.
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('usage_event_rollups'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON usage_event_rollups TO flagon_app;
  END IF;
END $$;
