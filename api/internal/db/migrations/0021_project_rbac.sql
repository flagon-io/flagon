-- Per-project RBAC: repo-style collaborator roles layered on top of org roles.
-- The effective role on a project is max(org-implied, explicit grant): org
-- owners/admins are implicitly project admins, org members implicitly have
-- write, and an explicit grant can only ELEVATE a member on a specific project
-- (never restrict below their org floor). Enforcement stays layered, the same
-- pattern as org RBAC: RLS gates who may touch the grants at all; the Go layer
-- applies the role ladder (read < triage < write < maintain < admin) and the
-- management rules on top.
--
-- Collaborators are org members today: a grant elevates an existing member's
-- role on one project. Outside collaborators (non-members with project-only
-- access) would require project-level SELECT on projects and are a later seam.

CREATE TABLE public.project_members (
	project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
	user_id    text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	role       text NOT NULL CHECK (role IN ('read', 'triage', 'write', 'maintain', 'admin')),
	created_by text REFERENCES public.users(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON public.project_members (user_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- A user's explicit grant on a project (NULL if none). Definer so it can back
-- both the RLS manage policy and Go effective-role checks without recursing the
-- policy on project_members. Mirrors flagon.org_member_role.
CREATE OR REPLACE FUNCTION flagon.project_member_role(p_project_id uuid, p_user_id text)
	RETURNS text
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT role FROM public.project_members
		WHERE project_id = p_project_id AND user_id = p_user_id
	$$;

-- Any member of the project's org may see the collaborator grants (the "manage
-- access" list is read-visible to members; the Go layer decides who can edit).
CREATE POLICY project_members_select ON public.project_members FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.projects p
		JOIN public.memberships m ON m.org_id = p.org_id
		WHERE p.id = project_members.project_id
		  AND m.user_id = flagon.current_user_id()
	));

-- Only project admins may create/modify/remove grants: an org owner/admin (admin
-- everywhere by the max rule) or a user holding an explicit admin grant on this
-- project. The Go layer enforces the finer rules (valid role, target must be a
-- member, no self-management) and records the audit entry atomically.
CREATE POLICY project_members_manage ON public.project_members FOR ALL
	USING (EXISTS (
		SELECT 1 FROM public.projects p
		WHERE p.id = project_members.project_id
		  AND (
			flagon.org_member_role(p.org_id, flagon.current_user_id()) IN ('owner', 'admin')
			OR flagon.project_member_role(p.id, flagon.current_user_id()) = 'admin'
		  )
	))
	WITH CHECK (EXISTS (
		SELECT 1 FROM public.projects p
		WHERE p.id = project_members.project_id
		  AND (
			flagon.org_member_role(p.org_id, flagon.current_user_id()) IN ('owner', 'admin')
			OR flagon.project_member_role(p.id, flagon.current_user_id()) = 'admin'
		  )
	));

-- The collaborator list with user details, but only when the caller (p_actor) is
-- a member of the org. Definer, so members see co-members' names/emails past the
-- users_self RLS. Mirrors flagon.org_members. Explicit grants only: org-level
-- (implicit) access is surfaced separately by the UI, not stored here.
CREATE OR REPLACE FUNCTION flagon.project_members(p_actor text, p_org_slug text, p_project_slug text)
	RETURNS TABLE (
		user_id    text,
		name       text,
		email      text,
		username   text,
		avatar_url text,
		role       text,
		created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, pm.role, pm.created_at
		FROM public.orgs o
		JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
		JOIN public.project_members pm ON pm.project_id = p.id
		JOIN public.users u ON u.id = pm.user_id
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor
		  )
		ORDER BY
			(pm.role = 'admin') DESC,
			(pm.role = 'maintain') DESC,
			(pm.role = 'write') DESC,
			(pm.role = 'triage') DESC,
			lower(u.email)
	$$;
