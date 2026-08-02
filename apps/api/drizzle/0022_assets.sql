CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"purpose" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "assets_org_idx" ON "assets" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_bucket_key_key" ON "assets" USING btree ("bucket","key");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. assets is TENANT data, same discipline as projects (0009):
-- reuse flagon_apply_tenant_rls so the policy can't drift, and grant the
-- restricted flagon_app role CRUD (RLS scopes WHICH rows).
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('assets'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON assets TO flagon_app;
  END IF;
END $$;
