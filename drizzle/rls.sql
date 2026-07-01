-- Row-level security for tenant isolation.
--
-- Every domain table carries organization_id. We FORCE RLS so even the table
-- owner is subject to the policy, then gate all access on the `app.current_org`
-- GUC that withTenant() sets per transaction. If the GUC is unset,
-- current_setting(..., true) returns NULL and no rows match -> safe default.
--
-- This file is idempotent and applied by `pnpm db:migrate` after the Drizzle
-- migrations. Auth tables (users, organizations, members, …) are intentionally
-- excluded — BetterAuth manages them directly without a tenant GUC.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'projects',
    'environments',
    'audit_logs',
    'usage_rollups'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    -- organization_id is uuid; the GUC is text. Cast it, treating unset/empty
    -- as NULL so no rows match when no tenant context is established.
    EXECUTE format(
      $policy$
        CREATE POLICY tenant_isolation ON %I
          USING (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
          WITH CHECK (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
      $policy$,
      t
    );
  END LOOP;
END $$;
