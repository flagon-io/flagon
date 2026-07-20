-- Teams: named groups of org members (BetterAuth organization plugin teams
-- feature), plural-named per convention. Teams will grant access to
-- org resources the way projects are shared with groups of people - starting
-- with membership itself; per-resource grants land with the products that
-- need them.
--
-- Authorization model: AUTH-LAYER tables like members/invitations - the
-- plugin membership-checks every operation and queries them outside any
-- tenant GUC context, so they carry no RLS.

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Team names are identity within an org (case-insensitive).
CREATE UNIQUE INDEX teams_org_name_uidx ON teams (organization_id, lower(name));

CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX team_members_team_user_uidx ON team_members (team_id, user_id);
CREATE INDEX team_members_user_id_idx ON team_members (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_members TO flagon_app;
