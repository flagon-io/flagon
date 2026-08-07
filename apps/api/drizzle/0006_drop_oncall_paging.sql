ALTER TABLE "oncall_escalation_levels" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oncall_escalation_policies" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oncall_overrides" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oncall_schedule_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oncall_schedule_teams" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oncall_schedules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_paging_numbers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "oncall_escalation_levels" CASCADE;--> statement-breakpoint
DROP TABLE "oncall_escalation_policies" CASCADE;--> statement-breakpoint
DROP TABLE "oncall_overrides" CASCADE;--> statement-breakpoint
DROP TABLE "oncall_schedule_members" CASCADE;--> statement-breakpoint
DROP TABLE "oncall_schedule_teams" CASCADE;--> statement-breakpoint
DROP TABLE "oncall_schedules" CASCADE;--> statement-breakpoint
DROP TABLE "org_paging_numbers" CASCADE;--> statement-breakpoint
ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS "incidents_escalation_policy_id_oncall_escalation_policies_id_fk";
--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN "escalation_policy_id";--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN "acknowledged_at";--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN "acknowledged_by_user_id";--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN "escalated_level";