-- Organization-wide feature flags and OFREP machine credentials.
CREATE TABLE feature_flags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flags_organization_id_key_key UNIQUE (organization_id, key),
  CONSTRAINT feature_flags_key_format CHECK (key ~ '^[a-z][a-z0-9._-]{0,127}$')
);
CREATE INDEX feature_flags_organization_id_idx ON feature_flags (organization_id);

CREATE TABLE sdk_keys (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  secret_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sdk_keys_organization_id_idx ON sdk_keys (organization_id);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY feature_flags_tenant_isolation ON feature_flags
  FOR ALL TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE sdk_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY sdk_keys_tenant_isolation ON sdk_keys
  FOR ALL TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flags TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sdk_keys TO flagon_app;
