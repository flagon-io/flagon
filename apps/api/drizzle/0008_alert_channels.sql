CREATE TABLE "alert_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"send_on_failure" boolean DEFAULT true NOT NULL,
	"send_on_recovery" boolean DEFAULT true NOT NULL,
	"send_on_degraded" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alert_channels_org_idx" ON "alert_channels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "alert_channels_org_type_idx" ON "alert_channels" USING btree ("organization_id","type");--> statement-breakpoint
-- Tenant isolation: enable + force RLS and install the per-org policy (helper from
-- 0000_baseline), then grant the restricted app role (guarded like past migrations).
SELECT public.flagon_apply_tenant_rls('public.alert_channels');--> statement-breakpoint
DO $rls$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.alert_channels TO flagon_app$g$;
  END IF;
END;
$rls$;