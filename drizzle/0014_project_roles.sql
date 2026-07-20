-- Project access control, repository-style: users and teams are granted a
-- role (read / write / admin) on a project. Organization owners and admins
-- are implicitly admin on every project; every organization member has
-- implicit read access. Grants elevate beyond that baseline.
--
-- Product data: tenant-scoped with deny-by-default RLS like projects. The
-- organization_id column is denormalized from the project so the standard
-- tenant policy applies directly.

CREATE TABLE project_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'team')),
  subject_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('read', 'write', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, subject_type, subject_id)
);

CREATE INDEX project_roles_project_id_idx ON project_roles (project_id);
CREATE INDEX project_roles_subject_idx ON project_roles (subject_type, subject_id);

ALTER TABLE project_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_roles_tenant_isolation ON project_roles
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON project_roles TO flagon_app;
