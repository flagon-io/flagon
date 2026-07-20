-- Finish the organizations reconciliation started in 0007.
--
-- 0000 treated organizations as a tenant-scoped resource: RLS keyed on the
-- org GUC, creation privileged to the owner ("sudo"). With the organization
-- plugin, orgs are self-service and membership-checked in the auth layer:
-- the plugin queries as flagon_app OUTSIDE any tenant context ("list my
-- orgs", "create org"), so GUC-keyed RLS can never fit this table. It joins
-- users/sessions/members as an auth-layer table.
--
-- The tenant guarantee is unchanged where it matters: PRODUCT data (projects
-- and every table after it) keeps deny-by-default RLS keyed on
-- app.current_org_id, proven by src/db/rls.test.ts.

DROP POLICY org_isolation ON organizations;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
