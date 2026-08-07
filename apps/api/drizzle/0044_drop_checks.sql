-- Tear down Checks (synthetic monitoring) and the notifications spine it introduced.
--
-- Checks is being removed. Migrations are forward-only, so the schema they added
-- (0040-0043, applied in production; plus 0044/0045 which reached local dev but never
-- production) cannot be un-applied in place: this migration DROPS those objects going
-- forward. 0040-0043 remain in history as applied; this reverses their effect.
--
-- Incidents returns to its pre-Checks shape: manual-declare only, with no `source` /
-- `source_check_id` intake columns. Every statement is IF EXISTS so the migration is
-- safe whether a database reached 0043 (production) or 0045 (local dev). Dropping a
-- table also drops its indexes, foreign keys, and RLS policies.

-- Break the incidents <-> checks circular FK first so the checks table can drop.
ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS "incidents_source_check_id_checks_id_fk";--> statement-breakpoint

-- Checks tables. check_results FK-depends on checks, so drop the child first; CASCADE
-- clears the checks.active_incident_id FK into incidents and any dependent objects.
DROP TABLE IF EXISTS "check_results" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "checks" CASCADE;--> statement-breakpoint

-- Notifications spine. notification_deliveries FK-depends on alert_channels; child first.
DROP TABLE IF EXISTS "notification_deliveries" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "alert_channels" CASCADE;--> statement-breakpoint

-- Integrations (0045; present only on databases that reached local dev, never production).
DROP TABLE IF EXISTS "org_integrations" CASCADE;--> statement-breakpoint

-- Incident intake dimension added by 0040 — indexes then columns.
DROP INDEX IF EXISTS "incidents_source_check_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "incidents_org_source_idx";--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN IF EXISTS "source_check_id";--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN IF EXISTS "source";
