CREATE TABLE "org_paging_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" text NOT NULL,
	"sms_enabled" boolean DEFAULT true NOT NULL,
	"voice_enabled" boolean DEFAULT true NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"pending_code_hash" text,
	"pending_expires_at" timestamp with time zone,
	"pending_attempts" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "org_paging_numbers_org_user_key" ON "org_paging_numbers" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "org_paging_numbers_org_idx" ON "org_paging_numbers" USING btree ("organization_id");--> statement-breakpoint
-- Tenant isolation: enable + force RLS and install the per-org policy (helper from
-- 0000_baseline). Access is further narrowed to the owning user in the app layer.
SELECT public.flagon_apply_tenant_rls('public.org_paging_numbers');--> statement-breakpoint
DO $rls$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE $g$GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.org_paging_numbers TO flagon_app$g$;
  END IF;
END;
$rls$;