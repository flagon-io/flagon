-- Project documentation and catalog ownership are distinct from access.
ALTER TABLE projects ADD COLUMN overview_markdown text NOT NULL DEFAULT '';

CREATE TABLE project_owners (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, team_id)
);
CREATE INDEX project_owners_project_id_idx ON project_owners (project_id);
CREATE INDEX project_owners_team_id_idx ON project_owners (team_id);
ALTER TABLE project_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_owners_tenant_isolation ON project_owners
  FOR ALL TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON project_owners TO flagon_app;

-- Client tokens are intentionally publishable. Existing hash-only tokens stay
-- valid but cannot be recovered; rotating them fills this column.
ALTER TABLE client_tokens ADD COLUMN token text;
