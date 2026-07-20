-- Grants become EXPLICIT, per table. The blanket default-privileges
-- auto-grant to flagon_app is removed (scripts/db-provision.mjs +
-- .docker/postgres/initdb/00-roles.sql): from now on a table a migration
-- forgets to secure is UNREACHABLE by the app (fails closed, loudly)
-- instead of reachable without row-level security (leaks silently).
--
-- Every new table's migration must therefore:
--   1. GRANT the app role its DML explicitly, and
--   2. either ENABLE ROW LEVEL SECURITY with the app.current_org_id tenant
--      policy (product data), or be classified as an auth-layer/global
--      table in src/db/tenancy.test.ts (which audits the catalog and fails
--      on anything unclassified or unprotected).
--
-- This migration backfills explicit grants for tables whose migrations
-- relied on the old default privileges (0002, 0004, 0007, 0010; the auth
-- tables from 0001 were granted there already, and 0000/0012/0014 carried
-- their own).

GRANT SELECT, INSERT, UPDATE, DELETE ON user_emails TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON members TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON leads TO flagon_app;

-- The migration ledger belongs to the migrator (owner) alone.
REVOKE ALL ON schema_migrations FROM flagon_app;
