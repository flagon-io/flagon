CREATE TABLE "maintenance_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"repeat" text DEFAULT 'none' NOT NULL,
	"repeat_ends_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "maintenance_windows_org_idx" ON "maintenance_windows" USING btree ("organization_id");--> statement-breakpoint
-- Tenant isolation: enable + force RLS and install the per-org policy (helper from
-- 0000_baseline), then grant the restricted app role (guarded like past migrations).
SELECT public.flagon_apply_tenant_rls('public.maintenance_windows');--> statement-breakpoint
DO $rls$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.maintenance_windows TO flagon_app$g$;
  END IF;
END;
$rls$;