-- Base permission (GitHub's model): an org-wide default project access level for
-- every member, raised by any explicit per-project grant. This is where read-only
-- membership lives - "viewer" as a role is redundant once base permission exists,
-- because effective access is max(role-implied, base, explicit grant).
--
-- Values mirror the project (repo) role ladder plus "none": none < read < triage
-- < write < maintain < admin. Default "read" (GitHub's default): members can pull
-- and open issues on every project unless granted more or the base is changed.
ALTER TABLE public.orgs
	ADD COLUMN base_permission text NOT NULL DEFAULT 'read'
		CHECK (base_permission IN ('none', 'read', 'triage', 'write', 'maintain', 'admin'));

-- Reconcile "viewer": fold any existing viewer memberships into plain members.
-- With base_permission = read (the default), an ex-viewer keeps read access, so
-- this is behavior-preserving for the common case while removing the redundant
-- role. The role CHECK still permits "viewer" for backward compatibility (and OAT
-- token roles), but membership no longer uses it and the UI stops offering it.
UPDATE public.memberships SET role = 'member' WHERE role = 'viewer';
