-- Teams: named groups of org members that hold access to projects, GitHub-style.
-- A team is org-scoped and has an internal role (maintainer/member). Teams do not
-- confer any access on their own; they are granted a repository-style role on a
-- specific project (project_team_members) or made an owner of one (project_owners,
-- alongside individual users). Ownership is a SEPARATE relation from the role
-- ladder: it sits a tier above admin (delete/transfer/manage-owners) and is held
-- by an individual or a team.
--
-- Enforcement stays layered, the same pattern as org and project RBAC: RLS gates
-- who may touch a row at all (via SECURITY DEFINER helpers, so policies never
-- recurse); the Go layer applies the finer ladder/ownership rules and records the
-- audit entry atomically. Org owners/admins retain full control everywhere - they
-- resolve to owner-level authority on every project, so the org is never locked
-- out of its own project.

-- Teams --------------------------------------------------------------------------

CREATE TABLE public.teams (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
	name        text NOT NULL,
	slug        text NOT NULL,
	description text NOT NULL DEFAULT '',
	created_by  text REFERENCES public.users(id),
	created_at  timestamptz NOT NULL DEFAULT now(),
	updated_at  timestamptz NOT NULL DEFAULT now(),
	deleted_at  timestamptz
);
-- Live teams have a unique slug within the org; a soft-deleted team frees its slug
-- at once (mirrors projects), so a name can be reused.
CREATE UNIQUE INDEX teams_org_slug_live_idx ON public.teams (org_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX teams_org_idx ON public.teams (org_id);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_members (
	team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
	user_id    text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	role       text NOT NULL CHECK (role IN ('maintainer', 'member')),
	created_by text REFERENCES public.users(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_members_user_idx ON public.team_members (user_id);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Team grants on projects: a team's repository-style role on one project. A team
-- may hold access to many projects; a project may be shared with many teams.
CREATE TABLE public.project_team_members (
	project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
	team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
	role       text NOT NULL CHECK (role IN ('read', 'triage', 'write', 'maintain', 'admin')),
	created_by text REFERENCES public.users(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (project_id, team_id)
);
CREATE INDEX project_team_members_team_idx ON public.project_team_members (team_id);
ALTER TABLE public.project_team_members ENABLE ROW LEVEL SECURITY;

-- Project owners: the separate ownership relation (a tier above admin). Exactly
-- one of owner_user_id / owner_team_id is set per row. Live rows only - ownership
-- via a soft-deleted team is ignored by the helpers below.
CREATE TABLE public.project_owners (
	id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
	owner_user_id text REFERENCES public.users(id) ON DELETE CASCADE,
	owner_team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
	created_by    text REFERENCES public.users(id),
	created_at    timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT project_owners_one_principal CHECK ((owner_user_id IS NOT NULL) <> (owner_team_id IS NOT NULL))
);
CREATE UNIQUE INDEX project_owners_user_idx ON public.project_owners (project_id, owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE UNIQUE INDEX project_owners_team_idx ON public.project_owners (project_id, owner_team_id) WHERE owner_team_id IS NOT NULL;
ALTER TABLE public.project_owners ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helpers -------------------------------------------------------
-- Definer so they back both RLS policies and Go authority checks without recursing
-- the policies on the tables they read. Mirror flagon.org_member_role /
-- flagon.project_member_role.

-- A user's role in a team (NULL if not a member of it).
CREATE OR REPLACE FUNCTION flagon.team_member_role(p_team_id uuid, p_user_id text)
	RETURNS text
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT role FROM public.team_members
		WHERE team_id = p_team_id AND user_id = p_user_id
	$$;

-- The highest role a user is granted on a project through ANY team they belong to
-- (NULL if none). Soft-deleted teams are ignored.
CREATE OR REPLACE FUNCTION flagon.project_team_role(p_project_id uuid, p_user_id text)
	RETURNS text
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT ptm.role
		FROM public.project_team_members ptm
		JOIN public.team_members tm ON tm.team_id = ptm.team_id
		JOIN public.teams t ON t.id = ptm.team_id AND t.deleted_at IS NULL
		WHERE ptm.project_id = p_project_id AND tm.user_id = p_user_id
		ORDER BY CASE ptm.role
			WHEN 'admin' THEN 5 WHEN 'maintain' THEN 4 WHEN 'write' THEN 3
			WHEN 'triage' THEN 2 WHEN 'read' THEN 1 ELSE 0 END DESC
		LIMIT 1
	$$;

-- Whether a user owns a project, directly or via a team they belong to. Ownership
-- is the tier above admin; org owners/admins are handled separately (they always
-- have full control regardless of these rows).
CREATE OR REPLACE FUNCTION flagon.user_owns_project(p_project_id uuid, p_user_id text)
	RETURNS boolean
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT EXISTS (
			SELECT 1 FROM public.project_owners po
			WHERE po.project_id = p_project_id AND po.owner_user_id = p_user_id
		) OR EXISTS (
			SELECT 1 FROM public.project_owners po
			JOIN public.team_members tm ON tm.team_id = po.owner_team_id
			JOIN public.teams t ON t.id = po.owner_team_id AND t.deleted_at IS NULL
			WHERE po.project_id = p_project_id AND tm.user_id = p_user_id
		)
	$$;

-- Whether a user may administer a project's access (manage collaborator + team
-- grants): an org owner/admin, an explicit admin (user grant or team grant), or an
-- owner. Backs the RLS manage policies on project_team_members; the Go layer
-- computes the same authority for the precise error codes.
CREATE OR REPLACE FUNCTION flagon.can_admin_project(p_project_id uuid, p_user_id text)
	RETURNS boolean
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT EXISTS (
			SELECT 1 FROM public.projects p
			WHERE p.id = p_project_id
			  AND flagon.org_member_role(p.org_id, p_user_id) IN ('owner', 'admin')
		)
		OR flagon.project_member_role(p_project_id, p_user_id) = 'admin'
		OR flagon.project_team_role(p_project_id, p_user_id) = 'admin'
		OR flagon.user_owns_project(p_project_id, p_user_id)
	$$;

-- Whether a user may own/transfer/delete a project (the owner tier): an org
-- owner/admin, or an owner (direct or via a team). Backs the RLS manage policy on
-- project_owners.
CREATE OR REPLACE FUNCTION flagon.can_own_project(p_project_id uuid, p_user_id text)
	RETURNS boolean
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT EXISTS (
			SELECT 1 FROM public.projects p
			WHERE p.id = p_project_id
			  AND flagon.org_member_role(p.org_id, p_user_id) IN ('owner', 'admin')
		)
		OR flagon.user_owns_project(p_project_id, p_user_id)
	$$;

-- RLS policies -------------------------------------------------------------------
-- Read-visible to any org member (the access lists are visible; the Go layer + the
-- manage policies decide who can edit). Manage gated by the helpers above.

CREATE POLICY teams_select ON public.teams FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = teams.org_id AND m.user_id = flagon.current_user_id()
	));
CREATE POLICY teams_manage ON public.teams FOR ALL
	USING (flagon.org_member_role(teams.org_id, flagon.current_user_id()) IN ('owner', 'admin'))
	WITH CHECK (flagon.org_member_role(teams.org_id, flagon.current_user_id()) IN ('owner', 'admin'));

CREATE POLICY team_members_select ON public.team_members FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.teams t
		JOIN public.memberships m ON m.org_id = t.org_id
		WHERE t.id = team_members.team_id AND m.user_id = flagon.current_user_id()
	));
CREATE POLICY team_members_manage ON public.team_members FOR ALL
	USING (EXISTS (
		SELECT 1 FROM public.teams t
		WHERE t.id = team_members.team_id
		  AND (
			flagon.org_member_role(t.org_id, flagon.current_user_id()) IN ('owner', 'admin')
			OR flagon.team_member_role(t.id, flagon.current_user_id()) = 'maintainer'
		  )
	))
	WITH CHECK (EXISTS (
		SELECT 1 FROM public.teams t
		WHERE t.id = team_members.team_id
		  AND (
			flagon.org_member_role(t.org_id, flagon.current_user_id()) IN ('owner', 'admin')
			OR flagon.team_member_role(t.id, flagon.current_user_id()) = 'maintainer'
		  )
	));

CREATE POLICY project_team_members_select ON public.project_team_members FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.projects p
		JOIN public.memberships m ON m.org_id = p.org_id
		WHERE p.id = project_team_members.project_id AND m.user_id = flagon.current_user_id()
	));
CREATE POLICY project_team_members_manage ON public.project_team_members FOR ALL
	USING (flagon.can_admin_project(project_team_members.project_id, flagon.current_user_id()))
	WITH CHECK (flagon.can_admin_project(project_team_members.project_id, flagon.current_user_id()));

CREATE POLICY project_owners_select ON public.project_owners FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.projects p
		JOIN public.memberships m ON m.org_id = p.org_id
		WHERE p.id = project_owners.project_id AND m.user_id = flagon.current_user_id()
	));
CREATE POLICY project_owners_manage ON public.project_owners FOR ALL
	USING (flagon.can_own_project(project_owners.project_id, flagon.current_user_id()))
	WITH CHECK (flagon.can_own_project(project_owners.project_id, flagon.current_user_id()));

-- Listing helpers (SECURITY DEFINER, gated on the caller being an org member so
-- co-members' profile details are visible past users_self RLS). Mirror
-- flagon.org_members / flagon.project_members.

-- Teams in an org, with a member count.
CREATE OR REPLACE FUNCTION flagon.teams(p_actor text, p_org_slug text)
	RETURNS TABLE (
		id           uuid,
		name         text,
		slug         text,
		description  text,
		member_count int,
		created_at   timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT t.id, t.name, t.slug, t.description,
			(SELECT count(*)::int FROM public.team_members tm WHERE tm.team_id = t.id),
			t.created_at
		FROM public.orgs o
		JOIN public.teams t ON t.org_id = o.id AND t.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor
		  )
		ORDER BY lower(t.name)
	$$;

-- A team's members with their profile details.
CREATE OR REPLACE FUNCTION flagon.team_members(p_actor text, p_org_slug text, p_team_slug text)
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
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, tm.role, tm.created_at
		FROM public.orgs o
		JOIN public.teams t ON t.org_id = o.id AND t.slug = p_team_slug AND t.deleted_at IS NULL
		JOIN public.team_members tm ON tm.team_id = t.id
		JOIN public.users u ON u.id = tm.user_id
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor
		  )
		ORDER BY (tm.role = 'maintainer') DESC, lower(u.email)
	$$;

-- A project's team grants with team details.
CREATE OR REPLACE FUNCTION flagon.project_teams(p_actor text, p_org_slug text, p_project_slug text)
	RETURNS TABLE (
		team_id    uuid,
		name       text,
		slug       text,
		role       text,
		created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT t.id, t.name, t.slug, ptm.role, ptm.created_at
		FROM public.orgs o
		JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
		JOIN public.project_team_members ptm ON ptm.project_id = p.id
		JOIN public.teams t ON t.id = ptm.team_id AND t.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor
		  )
		ORDER BY
			(ptm.role = 'admin') DESC,
			(ptm.role = 'maintain') DESC,
			(ptm.role = 'write') DESC,
			(ptm.role = 'triage') DESC,
			lower(t.name)
	$$;

-- A project's owners (individual users and teams), one row per owner. owner_type
-- distinguishes them; team rows carry the team slug, user rows the profile.
CREATE OR REPLACE FUNCTION flagon.project_owners(p_actor text, p_org_slug text, p_project_slug text)
	RETURNS TABLE (
		owner_type   text,
		principal_id text,
		name         text,
		email        text,
		username     text,
		avatar_url   text,
		team_slug    text,
		created_at   timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT 'user'::text, u.id, u.name, u.email, u.username, u.avatar_url, NULL::text, po.created_at
		FROM public.orgs o
		JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
		JOIN public.project_owners po ON po.project_id = p.id AND po.owner_user_id IS NOT NULL
		JOIN public.users u ON u.id = po.owner_user_id
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		UNION ALL
		SELECT 'team'::text, t.id::text, t.name, NULL::text, NULL::text, NULL::text, t.slug, po.created_at
		FROM public.orgs o
		JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
		JOIN public.project_owners po ON po.project_id = p.id AND po.owner_team_id IS NOT NULL
		JOIN public.teams t ON t.id = po.owner_team_id AND t.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		ORDER BY 1, 3
	$$;
