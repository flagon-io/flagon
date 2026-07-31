-- Refine the catalog: drop the project "component type" (projects are grouped by
-- packages elsewhere, not typed here), and add GitHub-repository-style per-project
-- access, where a team is granted a role on a project.
ALTER TABLE "projects" DROP COLUMN IF EXISTS "component_type";--> statement-breakpoint
CREATE TABLE "project_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"role" text DEFAULT 'read' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_access_project_team_key" ON "project_access" USING btree ("project_id","team_id");--> statement-breakpoint
CREATE INDEX "project_access_org_idx" ON "project_access" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_access_project_idx" ON "project_access" USING btree ("project_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. project_access is TENANT data, same discipline as the flags
-- tables (0002): reuse flagon_apply_tenant_rls so the policy can't drift, and
-- grant the restricted flagon_app role CRUD (RLS scopes WHICH rows). Without this
-- the tenancy audit fails closed on the new table.
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('project_access'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON project_access TO flagon_app;
  END IF;
END $$;
