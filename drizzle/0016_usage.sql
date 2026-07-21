-- Usage metering: per-day rollups keyed by meter (src/lib/meters.ts).
--
-- Rollups, not raw events: a day per org per meter per project is what the
-- usage page and the invoice builder both read, and it stays small forever.
-- Raw event ingest (the edge posting batches) lands with the first product
-- that emits usage; it will upsert into this same table.
--
-- Product data: tenant-scoped with deny-by-default RLS, queried through
-- withTenant like projects.

CREATE TABLE usage_rollups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Usage attributed to a project when the product is project-scoped;
  -- NULL for organization-level usage.
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  meter text NOT NULL,
  day date NOT NULL,
  quantity bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per org+project+meter+day; ingest upserts onto this.
-- COALESCE keeps org-level (NULL project) rows unique too, since NULLs
-- never equal each other in a plain unique index.
CREATE UNIQUE INDEX usage_rollups_unique_idx
  ON usage_rollups (
    organization_id,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    meter,
    day
  );

-- The period query: everything for an org between two days.
CREATE INDEX usage_rollups_org_day_idx ON usage_rollups (organization_id, day);

ALTER TABLE usage_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_rollups_tenant_isolation ON usage_rollups
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON usage_rollups TO flagon_app;
