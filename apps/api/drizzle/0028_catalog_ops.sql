-- Catalog ops-level buildout: enrich a project into a real service-catalog entry.
-- Adds classification (kind), free-form business domains, external links, and
-- MANUAL repository linking (a lighter return of the repo columns dropped in 0011;
-- a future Git integration will populate the same columns). Adds a light
-- project_relations table for dependency / service-map edges between projects,
-- modeled with a target_kind so it can point at packages later without a rewrite.
ALTER TABLE "projects" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "domains" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_provider" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_default_branch" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_visibility" text;--> statement-breakpoint
CREATE TABLE "project_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"target_kind" text DEFAULT 'project' NOT NULL,
	"target_project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_relations_no_self" CHECK ("source_project_id" <> "target_project_id")
);
--> statement-breakpoint
ALTER TABLE "project_relations" ADD CONSTRAINT "project_relations_source_project_id_projects_id_fk" FOREIGN KEY ("source_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_relations" ADD CONSTRAINT "project_relations_target_project_id_projects_id_fk" FOREIGN KEY ("target_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- One edge per (source, type, target). NULL target (a future package edge) is
-- distinct under a unique index, which is fine — only project edges exist today.
CREATE UNIQUE INDEX "project_relations_edge_key" ON "project_relations" USING btree ("source_project_id","type","target_project_id");--> statement-breakpoint
CREATE INDEX "project_relations_source_idx" ON "project_relations" USING btree ("source_project_id");--> statement-breakpoint
CREATE INDEX "project_relations_target_idx" ON "project_relations" USING btree ("target_project_id");--> statement-breakpoint
CREATE INDEX "project_relations_org_idx" ON "project_relations" USING btree ("organization_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. project_relations is TENANT data, same discipline as the
-- other catalog tables (0013): reuse flagon_apply_tenant_rls so the policy can't
-- drift, and grant the restricted flagon_app role CRUD (RLS scopes WHICH rows).
-- Without this the tenancy audit fails closed on the new table.
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('project_relations'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON project_relations TO flagon_app;
  END IF;
END $$;
