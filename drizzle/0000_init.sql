-- 0000_init: tenancy core + row-level security.
--
-- Tenant context is a transaction-local GUC the app sets per request:
--   SELECT set_config('app.current_org_id', '<uuid>', true);
-- When unset, current_setting(..., true) returns NULL, so every policy
-- predicate is `col = NULL` => no rows. Deny-by-default.

-- organizations = the tenant boundary --------------------------------------
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- projects = tenant-scoped resource ----------------------------------------
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
CREATE INDEX projects_organization_id_idx ON projects (organization_id);

-- Row-level security -------------------------------------------------------
-- ENABLE applies RLS to the app role (flagon_app). We intentionally do NOT
-- FORCE it: the table owner (flagon_owner locally, your managed role on Neon)
-- must stay un-restricted so it can run migrations and provision organizations
-- (the privileged "sudo" path). The app never connects as the owner, so the
-- tenant guarantee still holds for all application traffic.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- An org is visible only when it IS the current tenant. Creating an org can't
-- be tenant-scoped, so it stays a privileged (owner/"sudo") operation.
-- NULLIF(..., '') maps an unset/reset GUC to NULL so the predicate yields no
-- rows (deny-by-default) instead of erroring on ''::uuid.
CREATE POLICY org_isolation ON organizations
  FOR ALL
  TO flagon_app
  USING (id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Projects are fully CRUD-able by the app, but only within the current tenant.
CREATE POLICY project_tenant_isolation ON projects
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Explicit grants (compose/roles.sql also covers these + future tables).
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO flagon_app;
