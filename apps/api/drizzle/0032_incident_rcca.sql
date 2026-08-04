-- Incident RCCA (Root Cause & Corrective Action), CUSTOMIZABLE per org:
--   rcca_templates      one per org: which severities require an RCCA + the field
--                       set (seeded with a standard template on first use).
--   incident_rccas      one per incident: `values` maps each template field key to
--                       its markdown, so a custom template just changes the values.
--   incident_action_items  tracked corrective actions (assignee + status).
-- All tenant tables (RLS).
CREATE TABLE "rcca_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"required_severities" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_rccas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_rccas" ADD CONSTRAINT "incident_rccas_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_action_items" ADD CONSTRAINT "incident_action_items_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rcca_templates_org_key" ON "rcca_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_rccas_incident_key" ON "incident_rccas" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_rccas_org_idx" ON "incident_rccas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "incident_action_items_incident_idx" ON "incident_action_items" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "incident_action_items_org_idx" ON "incident_action_items" USING btree ("organization_id");--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rcca_templates', 'incident_rccas', 'incident_action_items'] LOOP
    PERFORM flagon_apply_tenant_rls(t::regclass);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO flagon_app', t);
    END IF;
  END LOOP;
END $$;
