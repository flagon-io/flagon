-- Reliability product (Incidents + On-call). Tenant tables, all prefixed
-- incident_* / oncall_* so generic words (schedule/members/escalation) never
-- collide with a future product. On-call schedules bind to a team OR stand alone
-- (team_id nullable); members are explicit users, so team / cross-team /
-- single-person rotations are all just member lists.
CREATE TABLE "oncall_escalation_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oncall_escalation_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oncall_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"rotation_interval_hours" integer DEFAULT 168 NOT NULL,
	"anchor_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oncall_schedule_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oncall_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"owner_team_id" uuid,
	"escalation_policy_id" uuid,
	"declared_by_user_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by_user_id" uuid,
	"escalated_level" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oncall_escalation_levels" ADD CONSTRAINT "oncall_escalation_levels_policy_id_oncall_escalation_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."oncall_escalation_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_schedules" ADD CONSTRAINT "oncall_schedules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_schedule_members" ADD CONSTRAINT "oncall_schedule_members_schedule_id_oncall_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."oncall_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oncall_overrides" ADD CONSTRAINT "oncall_overrides_schedule_id_oncall_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."oncall_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_owner_team_id_teams_id_fk" FOREIGN KEY ("owner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_escalation_policy_id_oncall_escalation_policies_id_fk" FOREIGN KEY ("escalation_policy_id") REFERENCES "public"."oncall_escalation_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_services" ADD CONSTRAINT "incident_services_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_services" ADD CONSTRAINT "incident_services_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oncall_escalation_policies_org_key_key" ON "oncall_escalation_policies" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "oncall_escalation_policies_org_idx" ON "oncall_escalation_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oncall_escalation_levels_policy_idx" ON "oncall_escalation_levels" USING btree ("policy_id","position");--> statement-breakpoint
CREATE INDEX "oncall_escalation_levels_org_idx" ON "oncall_escalation_levels" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oncall_schedules_org_key_key" ON "oncall_schedules" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "oncall_schedules_org_idx" ON "oncall_schedules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oncall_schedules_team_idx" ON "oncall_schedules" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oncall_schedule_members_schedule_user_key" ON "oncall_schedule_members" USING btree ("schedule_id","user_id");--> statement-breakpoint
CREATE INDEX "oncall_schedule_members_org_idx" ON "oncall_schedule_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oncall_schedule_members_schedule_idx" ON "oncall_schedule_members" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "oncall_overrides_schedule_idx" ON "oncall_overrides" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "oncall_overrides_org_idx" ON "oncall_overrides" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_org_number_key" ON "incidents" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "incidents_org_idx" ON "incidents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "incidents_org_status_idx" ON "incidents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "incidents_owner_team_idx" ON "incidents" USING btree ("owner_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_services_incident_project_key" ON "incident_services" USING btree ("incident_id","project_id");--> statement-breakpoint
CREATE INDEX "incident_services_org_idx" ON "incident_services" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "incident_services_project_idx" ON "incident_services" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "incident_services_incident_idx" ON "incident_services" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_updates_incident_idx" ON "incident_updates" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "incident_updates_org_idx" ON "incident_updates" USING btree ("organization_id");--> statement-breakpoint
-- =============================================================================
-- ROW-LEVEL SECURITY. All eight are TENANT tables: reuse flagon_apply_tenant_rls
-- so the policy can't drift, and grant the restricted flagon_app role CRUD (RLS
-- scopes WHICH rows). Without this the tenancy audit fails closed on them.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'incidents', 'incident_services', 'incident_updates',
    'oncall_schedules', 'oncall_schedule_members', 'oncall_overrides',
    'oncall_escalation_policies', 'oncall_escalation_levels'
  ] LOOP
    PERFORM flagon_apply_tenant_rls(t::regclass);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO flagon_app', t);
    END IF;
  END LOOP;
END $$;
