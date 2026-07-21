-- Typed flags, reusable segments, and the final credential architecture.

ALTER TABLE feature_flags
  ADD COLUMN type text NOT NULL DEFAULT 'boolean',
  ADD COLUMN variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN default_variant text,
  ADD COLUMN rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN client_exposed boolean NOT NULL DEFAULT false;

UPDATE feature_flags
SET variants = jsonb_build_array(
      jsonb_build_object('key', 'off', 'value', false),
      jsonb_build_object('key', 'on', 'value', true)
    ),
    default_variant = CASE WHEN enabled THEN 'on' ELSE 'off' END;

ALTER TABLE feature_flags
  ALTER COLUMN default_variant SET NOT NULL,
  ADD CONSTRAINT feature_flags_type_check
    CHECK (type IN ('boolean', 'string', 'integer', 'float', 'object')),
  DROP COLUMN enabled;

DROP TABLE sdk_keys;

CREATE TABLE client_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  secret_hash text NOT NULL UNIQUE,
  allowed_origins text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_tokens_organization_id_idx ON client_tokens (organization_id);
ALTER TABLE client_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_tokens_tenant_isolation ON client_tokens
  FOR ALL TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON client_tokens TO flagon_app;

CREATE TABLE segments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segments_organization_id_key_key UNIQUE (organization_id, key),
  CONSTRAINT segments_key_format CHECK (key ~ '^[a-z][a-z0-9._-]{0,127}$')
);
CREATE INDEX segments_organization_id_idx ON segments (organization_id);
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY segments_tenant_isolation ON segments
  FOR ALL TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON segments TO flagon_app;

CREATE TABLE access_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'organization')),
  subject_id text NOT NULL,
  name text NOT NULL,
  secret_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_tokens_subject_idx ON access_tokens (subject_type, subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON access_tokens TO flagon_app;

-- Polymorphic subjects cannot use foreign keys, so revoke tokens on subject deletion.
CREATE FUNCTION delete_organization_access_tokens() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM access_tokens WHERE subject_type = 'organization' AND subject_id = OLD.id::text;
  RETURN OLD;
END $$;
CREATE TRIGGER organizations_delete_access_tokens AFTER DELETE ON organizations
  FOR EACH ROW EXECUTE FUNCTION delete_organization_access_tokens();
CREATE FUNCTION delete_user_access_tokens() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM access_tokens WHERE subject_type = 'user' AND subject_id = OLD.id::text;
  RETURN OLD;
END $$;
CREATE TRIGGER users_delete_access_tokens AFTER DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION delete_user_access_tokens();
