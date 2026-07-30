CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"installation_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"account_avatar_url" text,
	"suspended_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_org_install_key" ON "github_installations" USING btree ("organization_id","installation_id");--> statement-breakpoint
CREATE INDEX "github_installations_org_idx" ON "github_installations" USING btree ("organization_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. github_installations is TENANT data (an org's GitHub App
-- connections), same discipline as the flags tables (0002): reuse
-- flagon_apply_tenant_rls so the policy can't drift, and grant the restricted
-- flagon_app role CRUD (RLS scopes WHICH rows).
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('github_installations'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON github_installations TO flagon_app;
  END IF;
END $$;
