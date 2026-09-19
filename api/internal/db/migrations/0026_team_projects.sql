-- The inverse view of project_team_members: the projects a team has access to,
-- for the team's Projects tab. (project_team_members already lists teams per
-- project; this lists projects per team.) SECURITY DEFINER, gated on the caller
-- being an org member, mirroring flagon.project_teams. Soft-deleted teams and
-- projects are excluded.
CREATE OR REPLACE FUNCTION flagon.team_projects(p_actor text, p_org_slug text, p_team_slug text)
	RETURNS TABLE (
		project_id uuid,
		name       text,
		slug       text,
		role       text,
		created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT p.id, p.name, p.slug, ptm.role, ptm.created_at
		FROM public.orgs o
		JOIN public.teams t ON t.org_id = o.id AND t.slug = p_team_slug AND t.deleted_at IS NULL
		JOIN public.project_team_members ptm ON ptm.team_id = t.id
		JOIN public.projects p ON p.id = ptm.project_id AND p.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor
		  )
		ORDER BY
			(ptm.role = 'admin') DESC,
			(ptm.role = 'maintain') DESC,
			(ptm.role = 'write') DESC,
			(ptm.role = 'triage') DESC,
			lower(p.name)
	$$;
