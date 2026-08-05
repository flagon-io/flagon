-- Multiple teams per on-call schedule (many-to-many). A shared rotation (e.g. a
-- platform/SRE on-call) can serve several product teams, and each of those teams
-- surfaces it on their On-call tab. Replaces the single `oncall_schedules.team_id`
-- as the source of truth (that column is left dormant, backfilled into the join).
CREATE TABLE "oncall_schedule_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL REFERENCES "oncall_schedules"("id") ON DELETE cascade,
	"team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX "oncall_schedule_teams_sched_team_key" ON "oncall_schedule_teams" USING btree ("schedule_id","team_id");--> statement-breakpoint
CREATE INDEX "oncall_schedule_teams_team_idx" ON "oncall_schedule_teams" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "oncall_schedule_teams_org_idx" ON "oncall_schedule_teams" USING btree ("organization_id");--> statement-breakpoint

-- Backfill the join from the existing single-team binding.
INSERT INTO "oncall_schedule_teams" ("organization_id","schedule_id","team_id")
	SELECT "organization_id","id","team_id" FROM "oncall_schedules" WHERE "team_id" IS NOT NULL;--> statement-breakpoint

DO $$
BEGIN
  PERFORM flagon_apply_tenant_rls('oncall_schedule_teams'::regclass);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON oncall_schedule_teams TO flagon_app';
  END IF;
END $$;
