-- Membership snapshot captured when an org is SOFT-deleted.
--
-- On soft-delete the org's member + pending-invitation rows are REMOVED, so the
-- deleted org also disappears from better-auth's OWN /api/auth org endpoints
-- (listOrganizations / getFullOrganization / inviteMember), which don't know about
-- `deleted_at` and would otherwise let a former member with a live session still
-- enumerate/mutate their dead org's roster. This JSON preserves who was in it
-- (user_id + role) so a future restore-within-retention can recreate the members,
-- and it doubles as churn visibility. No new grants (column add inherits).
ALTER TABLE "organizations" ADD COLUMN "deleted_members" jsonb;
