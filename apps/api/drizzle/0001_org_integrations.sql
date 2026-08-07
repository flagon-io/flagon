CREATE TABLE "org_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ciphertext" text,
	"last_error" text,
	"last_tested_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "org_integrations_org_provider_key" ON "org_integrations" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "org_integrations_org_idx" ON "org_integrations" USING btree ("organization_id");--> statement-breakpoint
-- Tenant isolation: enable + force RLS and install the per-org policy, exactly
-- like every other org-scoped table (helper defined in 0000_baseline).
SELECT public.flagon_apply_tenant_rls('public.org_integrations');--> statement-breakpoint
-- Grant the restricted app role, guarded so a database without flagon_app still
-- applies (matches the IF EXISTS pattern in the baseline grants block).
DO $rls$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_integrations TO flagon_app$g$;
  END IF;
END;
$rls$;