-- Enforce per-project access (the org base permission, direct and team grants,
-- and ownership) for READING projects, not just for managing their access.
--
-- Before, every org member could see every project and its access lists (the
-- SELECT policies and the definer listing windows only checked org membership),
-- even in an org whose base permission is 'none' and with no grant. The Go layer
-- already modelled the rule (resolveProjectAuthority); this migration encodes the
-- SAME rule in SQL so the database enforces it as defense in depth: a missed check
-- in Go still cannot leak a project the caller has no access to.
--
-- The rule (kept provably in agreement with the Go resolveProjectAuthority by the
-- project-access integration test matrix):
--   - a non-member (or a member of a soft-deleted org) has no access;
--   - an org owner/admin is an admin AND an owner on every project;
--   - otherwise the effective role is the max of the org floor (the base
--     permission for a member, 'none' meaning no floor; 'read' for a legacy
--     viewer), the user's direct grant, and any team grant (live teams only);
--   - ownership (direct or via a live team) is a tier above admin and satisfies
--     every capability.
--
-- The helpers take the org id explicitly (rather than looking it up from the
-- project) so a policy can evaluate a row that the current statement is still
-- inserting: a STABLE function's snapshot cannot see that row yet.

-- Rank on the read..admin ladder ('' / NULL / 'none' rank 0). Mirrors
-- projectRoleRanks in Go.
CREATE OR REPLACE FUNCTION flagon.project_role_rank(p_role text)
	RETURNS int
	LANGUAGE sql IMMUTABLE
	AS $$
		SELECT CASE p_role
			WHEN 'admin' THEN 5 WHEN 'maintain' THEN 4 WHEN 'write' THEN 3
			WHEN 'triage' THEN 2 WHEN 'read' THEN 1 ELSE 0 END
	$$;

-- A user's effective role on a project (NULL = no access by role). Definer so it
-- can back RLS policies on projects and the grant tables without recursing them.
CREATE OR REPLACE FUNCTION flagon.project_effective_role(p_org_id uuid, p_project_id uuid, p_user_id text)
	RETURNS text
	LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
	AS $$
	DECLARE
		v_org_role text;
		v_base     text;
		v_best     text;
		v_grant    text;
	BEGIN
		v_org_role := flagon.org_member_role(p_org_id, p_user_id);
		IF v_org_role IS NULL THEN
			RETURN NULL;
		END IF;
		IF v_org_role IN ('owner', 'admin') THEN
			RETURN 'admin';
		END IF;
		IF v_org_role = 'member' THEN
			SELECT base_permission INTO v_base FROM public.orgs WHERE id = p_org_id;
			IF v_base IS NOT NULL AND v_base <> 'none' THEN
				v_best := v_base;
			END IF;
		ELSIF v_org_role = 'viewer' THEN
			v_best := 'read';
		END IF;
		v_grant := flagon.project_member_role(p_project_id, p_user_id);
		IF flagon.project_role_rank(v_grant) > flagon.project_role_rank(v_best) THEN
			v_best := v_grant;
		END IF;
		v_grant := flagon.project_team_role(p_project_id, p_user_id);
		IF flagon.project_role_rank(v_grant) > flagon.project_role_rank(v_best) THEN
			v_best := v_grant;
		END IF;
		RETURN v_best;
	END
	$$;

-- Whether a user holds at least p_min_role on a project (read = view, write =
-- edit metadata, maintain = manage settings, admin = manage access). Org
-- owners/admins and project owners (direct or via a live team) always do. The
-- common cases short-circuit after one or two indexed lookups, so this is cheap
-- enough to evaluate per row in a list query / policy.
CREATE OR REPLACE FUNCTION flagon.project_permits(p_org_id uuid, p_project_id uuid, p_user_id text, p_min_role text)
	RETURNS boolean
	LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
	AS $$
	DECLARE
		v_org_role text;
	BEGIN
		v_org_role := flagon.org_member_role(p_org_id, p_user_id);
		IF v_org_role IS NULL THEN
			RETURN false;
		END IF;
		IF v_org_role IN ('owner', 'admin') THEN
			RETURN true;
		END IF;
		IF flagon.project_role_rank(flagon.project_effective_role(p_org_id, p_project_id, p_user_id))
			>= flagon.project_role_rank(p_min_role) THEN
			RETURN true;
		END IF;
		RETURN flagon.user_owns_project(p_project_id, p_user_id);
	END
	$$;

-- Creator access: a project's creator gets an explicit admin grant (the classic
-- "you made it, you administer it" rule), so a plain member can manage the project
-- they just created even when the base permission is read or none. Definer
-- because the grant tables' manage policy needs project admin, which the creator
-- does not hold yet. Tightly bound: only the transaction that created the row
-- (created_at = now(), the transaction timestamp) may call it, only for the
-- caller themself, and only on a project they created.
CREATE OR REPLACE FUNCTION flagon.grant_project_creator(p_project_id uuid)
	RETURNS boolean
	LANGUAGE sql SECURITY DEFINER VOLATILE SET search_path = public
	AS $$
		WITH ins AS (
			INSERT INTO public.project_members (project_id, user_id, role, created_by)
			SELECT p.id, p.created_by, 'admin', p.created_by
			FROM public.projects p
			WHERE p.id = p_project_id
			  AND p.created_by = flagon.current_user_id()
			  AND p.created_at = now()
			ON CONFLICT (project_id, user_id) DO NOTHING
			RETURNING 1
		)
		SELECT EXISTS (SELECT 1 FROM ins)
	$$;

-- RLS: projects -------------------------------------------------------------------
-- SELECT needs view (read+) access; this also covers soft-deleted rows (the
-- restore flow reads them), since the helpers do not look at deleted_at.
DROP POLICY projects_member_select ON public.projects;
CREATE POLICY projects_member_select ON public.projects FOR SELECT
	USING (flagon.project_permits(projects.org_id, projects.id, flagon.current_user_id(), 'read'));

-- UPDATE needs write+ (metadata edits); delete/restore (owner tier) and slug
-- renames (maintain+) are narrowed further in Go. Owners pass via project_permits.
DROP POLICY projects_member_modify ON public.projects;
CREATE POLICY projects_member_modify ON public.projects FOR UPDATE
	USING (flagon.project_permits(projects.org_id, projects.id, flagon.current_user_id(), 'write'))
	WITH CHECK (true);

-- RLS: the project access lists ---------------------------------------------------
-- Visible only to users who can view the project (was: any org member).
DROP POLICY project_members_select ON public.project_members;
CREATE POLICY project_members_select ON public.project_members FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.projects p
		WHERE p.id = project_members.project_id
		  AND flagon.project_permits(p.org_id, p.id, flagon.current_user_id(), 'read')
	));

DROP POLICY project_team_members_select ON public.project_team_members;
CREATE POLICY project_team_members_select ON public.project_team_members FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.projects p
		WHERE p.id = project_team_members.project_id
		  AND flagon.project_permits(p.org_id, p.id, flagon.current_user_id(), 'read')
	));

DROP POLICY project_owners_select ON public.project_owners;
CREATE POLICY project_owners_select ON public.project_owners FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.projects p
		WHERE p.id = project_owners.project_id
		  AND flagon.project_permits(p.org_id, p.id, flagon.current_user_id(), 'read')
	));

-- Definer listing windows ---------------------------------------------------------
-- Same signatures and return types as 0029 (CREATE OR REPLACE keeps grants). Each
-- now requires the caller to be able to VIEW the project (not merely be an org
-- member), and binds p_actor to the transaction's RLS user (as 0030 did for the
-- org windows) so a wrong id from Go reads nothing.

CREATE OR REPLACE FUNCTION flagon.project_members(p_actor text, p_org_slug text, p_project_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		user_id text, name text, email text, username text, avatar_url text, role text, created_at timestamptz, sort_key text[]
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, pm.role, pm.created_at,
		       ARRAY[lower(u.email), u.id]
		FROM public.orgs o
		JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
		JOIN public.project_members pm ON pm.project_id = p.id
		JOIN public.users u ON u.id = pm.user_id
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND p_actor = flagon.current_user_id()
		  AND flagon.project_permits(o.id, p.id, p_actor, 'read')
		  AND (p_q = '' OR u.name ILIKE '%' || p_q || '%' OR u.email ILIKE '%' || p_q || '%' OR u.username ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(u.email), u.id) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(u.email), u.id
		LIMIT p_limit
	$$;

CREATE OR REPLACE FUNCTION flagon.project_teams(p_actor text, p_org_slug text, p_project_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		team_id uuid, name text, slug text, role text, created_at timestamptz, sort_key text[]
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT t.id, t.name, t.slug, ptm.role, ptm.created_at,
		       ARRAY[lower(t.name), t.id::text]
		FROM public.orgs o
		JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
		JOIN public.project_team_members ptm ON ptm.project_id = p.id
		JOIN public.teams t ON t.id = ptm.team_id AND t.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND p_actor = flagon.current_user_id()
		  AND flagon.project_permits(o.id, p.id, p_actor, 'read')
		  AND (p_q = '' OR t.name ILIKE '%' || p_q || '%' OR t.slug ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(t.name), t.id::text) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(t.name), t.id::text
		LIMIT p_limit
	$$;

CREATE OR REPLACE FUNCTION flagon.project_owners(p_actor text, p_org_slug text, p_project_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		owner_type text, principal_id text, name text, email text, username text, avatar_url text, team_slug text, created_at timestamptz, sort_key text[]
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT owners.*, ARRAY[owner_type, lower(COALESCE(name, '')), principal_id] FROM (
			SELECT 'user'::text AS owner_type, u.id AS principal_id, u.name, u.email, u.username, u.avatar_url, NULL::text AS team_slug, po.created_at
			FROM public.orgs o
			JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
			JOIN public.project_owners po ON po.project_id = p.id AND po.owner_user_id IS NOT NULL
			JOIN public.users u ON u.id = po.owner_user_id
			WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
			  AND p_actor = flagon.current_user_id()
			  AND flagon.project_permits(o.id, p.id, p_actor, 'read')
			UNION ALL
			SELECT 'team'::text, t.id::text, t.name, NULL::text, NULL::text, NULL::text, t.slug, po.created_at
			FROM public.orgs o
			JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
			JOIN public.project_owners po ON po.project_id = p.id AND po.owner_team_id IS NOT NULL
			JOIN public.teams t ON t.id = po.owner_team_id AND t.deleted_at IS NULL
			WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
			  AND p_actor = flagon.current_user_id()
			  AND flagon.project_permits(o.id, p.id, p_actor, 'read')
		) owners
		WHERE (p_q = '' OR name ILIKE '%' || p_q || '%' OR email ILIKE '%' || p_q || '%'
			OR username ILIKE '%' || p_q || '%' OR team_slug ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (owner_type, lower(COALESCE(name, '')), principal_id) > (p_cursor[1], p_cursor[2], p_cursor[3]))
		ORDER BY owner_type, lower(COALESCE(name, '')), principal_id
		LIMIT p_limit
	$$;

-- A team's Projects tab lists only the projects the CALLER can view (the team
-- itself stays visible to every org member, as before).
CREATE OR REPLACE FUNCTION flagon.team_projects(p_actor text, p_org_slug text, p_team_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		project_id uuid, name text, slug text, role text, created_at timestamptz, sort_key text[]
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT p.id, p.name, p.slug, ptm.role, ptm.created_at,
		       ARRAY[lower(p.name), p.id::text]
		FROM public.orgs o
		JOIN public.teams t ON t.org_id = o.id AND t.slug = p_team_slug AND t.deleted_at IS NULL
		JOIN public.project_team_members ptm ON ptm.team_id = t.id
		JOIN public.projects p ON p.id = ptm.project_id AND p.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND p_actor = flagon.current_user_id()
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND flagon.project_permits(o.id, p.id, p_actor, 'read')
		  AND (p_q = '' OR p.name ILIKE '%' || p_q || '%' OR p.slug ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(p.name), p.id::text) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(p.name), p.id::text
		LIMIT p_limit
	$$;
