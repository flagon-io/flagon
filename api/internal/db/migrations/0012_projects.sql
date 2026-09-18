-- Projects: the core deployable unit (Vercel model - no separate app layer).
-- Org-scoped and RLS-isolated by membership, soft-deletable (restore later).
-- readme + repository_url are baseline metadata now; repository_url will become
-- a real linked source (GitHub/GitLab/...) that can sync the README in future.

CREATE TABLE public.projects (
	id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id         uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
	name           text NOT NULL,
	slug           text NOT NULL,
	description    text NOT NULL DEFAULT '',
	readme         text NOT NULL DEFAULT '',
	repository_url text NOT NULL DEFAULT '',
	created_by     text NOT NULL REFERENCES public.users(id),
	created_at     timestamptz NOT NULL DEFAULT now(),
	updated_at     timestamptz NOT NULL DEFAULT now(),
	deleted_at     timestamptz,
	UNIQUE (org_id, slug)
);
CREATE INDEX projects_org_idx ON public.projects (org_id);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Any member of the org may see non-deleted projects and create them; writes are
-- further gated by role in the Go layer (viewers are read-only).
CREATE POLICY projects_member_select ON public.projects FOR SELECT
	USING (deleted_at IS NULL AND EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = projects.org_id AND m.user_id = flagon.current_user_id()
	));
CREATE POLICY projects_member_insert ON public.projects FOR INSERT
	WITH CHECK (EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = projects.org_id AND m.user_id = flagon.current_user_id()
	));
CREATE POLICY projects_member_modify ON public.projects FOR UPDATE
	USING (EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = projects.org_id AND m.user_id = flagon.current_user_id()
	))
	WITH CHECK (true);
