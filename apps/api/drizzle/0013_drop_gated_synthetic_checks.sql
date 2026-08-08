-- Custom SQL migration file, put your code below! --
-- One-time cleanup: remove checks whose monitor type is currently GATED to "Soon" (the
-- synthetic api + browser checks), since they can no longer run and only clutter the list.
-- `check_results` cascades on delete. This runs ONCE (tracked in __drizzle_migrations); a
-- fresh DB has no such rows so it's a no-op, and re-enabling those types later is unaffected.
--
-- `checks` is FORCE RLS, so a cross-tenant DELETE by the (non-superuser) migration owner
-- with no `app.current_org_id` set would match ZERO rows. Drop FORCE for this one statement
-- so the owner can sweep every org, then restore it. Runs in the migration transaction.
ALTER TABLE "checks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DELETE FROM "checks" WHERE "type" IN ('api', 'browser');--> statement-breakpoint
ALTER TABLE "checks" FORCE ROW LEVEL SECURITY;