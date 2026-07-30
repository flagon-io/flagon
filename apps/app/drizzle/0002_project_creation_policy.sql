-- Org-controlled base permission: who may create projects. Mirrors GitHub's
-- "repository creation" member privilege. 'managers' (owner/admin only) is the
-- default so existing behavior is unchanged; an org can open it to 'members' so
-- any member can create. Written by the org settings form via the API
-- (PATCH /v1/orgs/:org), owner/admin only — never by BetterAuth.
ALTER TABLE "organizations" ADD COLUMN "project_creation_policy" text DEFAULT 'managers' NOT NULL;
