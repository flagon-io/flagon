-- Reliability OBJECTIVES (optional SLO/SLA). An org may, if it wants, define targets on
-- top of measured weighted-uptime: a target %, a rolling window, scoped org-wide or to a
-- single project. Entirely opt-in: no rows are seeded, and absence means "show measured
-- uptime only, no target framing". Tenant table (RLS).
CREATE TABLE "reliability_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"label" text DEFAULT 'SLO' NOT NULL,
	"scope_type" text DEFAULT 'org' NOT NULL,
	"scope_project_id" uuid,
	"target_pct" double precision NOT NULL,
	"window_days" integer DEFAULT 30 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reliability_objectives" ADD CONSTRAINT "reliability_objectives_scope_project_id_projects_id_fk" FOREIGN KEY ("scope_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reliability_objectives_org_key" ON "reliability_objectives" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "reliability_objectives_org_idx" ON "reliability_objectives" USING btree ("organization_id");--> statement-breakpoint
-- RLS: tenant table. Reuse the shared helper; grant the restricted app role CRUD.
DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('reliability_objectives'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON reliability_objectives TO flagon_app';
  END IF;
END $$;
