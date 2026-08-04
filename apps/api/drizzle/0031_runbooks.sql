-- Runbooks: reusable playbooks a responder follows during an incident. A runbook
-- has ordered steps (task with markdown, or a link), attaches to services and/or
-- triggers at a severity threshold, and on declare its steps materialize onto the
-- incident as a checklist (a COPY, so editing the runbook never mutates a live one).
CREATE TABLE "runbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_severity" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runbook_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"runbook_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"kind" text DEFAULT 'task' NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runbook_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"runbook_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"runbook_id" uuid,
	"runbook_name" text,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"kind" text DEFAULT 'task' NOT NULL,
	"url" text,
	"done" boolean DEFAULT false NOT NULL,
	"done_by_user_id" uuid,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runbook_steps" ADD CONSTRAINT "runbook_steps_runbook_id_runbooks_id_fk" FOREIGN KEY ("runbook_id") REFERENCES "public"."runbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runbook_services" ADD CONSTRAINT "runbook_services_runbook_id_runbooks_id_fk" FOREIGN KEY ("runbook_id") REFERENCES "public"."runbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runbook_services" ADD CONSTRAINT "runbook_services_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_checklist_items" ADD CONSTRAINT "incident_checklist_items_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_checklist_items" ADD CONSTRAINT "incident_checklist_items_runbook_id_runbooks_id_fk" FOREIGN KEY ("runbook_id") REFERENCES "public"."runbooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runbooks_org_key_key" ON "runbooks" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "runbooks_org_idx" ON "runbooks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "runbook_steps_runbook_idx" ON "runbook_steps" USING btree ("runbook_id","position");--> statement-breakpoint
CREATE INDEX "runbook_steps_org_idx" ON "runbook_steps" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runbook_services_runbook_project_key" ON "runbook_services" USING btree ("runbook_id","project_id");--> statement-breakpoint
CREATE INDEX "runbook_services_org_idx" ON "runbook_services" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "runbook_services_project_idx" ON "runbook_services" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "incident_checklist_incident_idx" ON "incident_checklist_items" USING btree ("incident_id","position");--> statement-breakpoint
CREATE INDEX "incident_checklist_org_idx" ON "incident_checklist_items" USING btree ("organization_id");--> statement-breakpoint
-- RLS: all four are TENANT tables (reuse flagon_apply_tenant_rls; grant CRUD).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['runbooks', 'runbook_steps', 'runbook_services', 'incident_checklist_items'] LOOP
    PERFORM flagon_apply_tenant_rls(t::regclass);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO flagon_app', t);
    END IF;
  END LOOP;
END $$;
