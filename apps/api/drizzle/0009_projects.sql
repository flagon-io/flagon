CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"github_installation_id" uuid,
	"repo_id" text,
	"repo_full_name" text,
	"repo_default_branch" text,
	"repo_private" boolean DEFAULT false NOT NULL,
	"root_directory" text DEFAULT '' NOT NULL,
	"framework" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_github_installation_id_github_installations_id_fk" FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_key_key" ON "projects" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. projects is TENANT data, same discipline as the flags
-- tables (0002): reuse flagon_apply_tenant_rls so the policy can't drift, and
-- grant the restricted flagon_app role CRUD (RLS scopes WHICH rows).
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('projects'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO flagon_app;
  END IF;
END $$;
