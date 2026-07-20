-- Organizations become real: the BetterAuth organization plugin's tables,
-- plural-named per convention, merged onto our existing organizations table
-- (which gains the plugin's logo/metadata columns; slug and name carry over).
--
-- Authorization model: organizations/members/invitations are AUTH-LAYER
-- tables, managed and access-checked by the plugin (membership checks on
-- every operation) - like users/sessions they carry no RLS, because the
-- plugin queries them outside any tenant GUC context (e.g. "list my orgs").
-- PRODUCT data (projects and everything after it) keeps deny-by-default RLS
-- keyed on app.current_org_id via withTenant.
--
-- Billing note: the org is the billing entity. Stripe linkage arrives as a
-- nullable stripe_customer_id in the billing phase; orgs created without
-- Stripe (self-host, pre-upgrade) simply never populate it.

ALTER TABLE organizations ADD COLUMN logo text;
ALTER TABLE organizations ADD COLUMN metadata text;

CREATE TABLE members (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One membership per user per org; leading column also serves org lookups.
CREATE UNIQUE INDEX members_org_user_uidx ON members (organization_id, user_id);
CREATE INDEX members_user_id_idx ON members (user_id);

CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  team_id text,
  inviter_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invitations_organization_id_idx ON invitations (organization_id);
CREATE INDEX invitations_email_idx ON invitations (email);
CREATE INDEX invitations_inviter_id_idx ON invitations (inviter_id);

-- The plugin tracks the session's active organization.
ALTER TABLE sessions ADD COLUMN active_organization_id text;
