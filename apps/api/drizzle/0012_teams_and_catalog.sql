-- Teams + service catalog. Teams are org-scoped tenant data (GitHub-style
-- membership); projects gain OpsLevel-style catalog metadata + a team owner.
-- Order matters: teams exist before the projects.owner_team_id FK points at them.
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_key_key" ON "teams" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "teams_org_idx" ON "teams" USING btree ("organization_id");--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_user_key" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_members_org_idx" ON "team_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
-- Catalog metadata on projects (+ team owner). projects is an existing tenant
-- table, so its RLS policy already covers these new columns; no new policy here.
ALTER TABLE "projects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_team_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "component_type" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "lifecycle" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_team_id_teams_id_fk" FOREIGN KEY ("owner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_team_idx" ON "projects" USING btree ("owner_team_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. teams + team_members are TENANT data, same discipline as
-- the flags tables (0002): reuse flagon_apply_tenant_rls so the policy can't
-- drift, and grant the restricted flagon_app role CRUD (RLS scopes WHICH rows).
-- Without this the tenancy audit fails closed on the new tables.
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('teams'::regclass);
  PERFORM flagon_apply_tenant_rls('team_members'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO flagon_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON team_members TO flagon_app;
  END IF;
END $$;
