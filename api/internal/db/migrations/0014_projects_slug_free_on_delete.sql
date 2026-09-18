-- Free a project's slug the instant it is soft-deleted (GitHub-style): a new
-- project may immediately reuse the name. The original table-level
-- UNIQUE(org_id, slug) also covered soft-deleted rows, so a deleted project kept
-- squatting its slug until it was restored or purged. Replace it with a partial
-- unique index over live rows only, so uniqueness applies to what you can see.
--
-- Consequence: several soft-deleted rows may share a slug, and a restore only
-- succeeds when the slug is still free among live projects (enforced by this
-- index; the app returns a slug-taken error otherwise).
ALTER TABLE public.projects DROP CONSTRAINT projects_org_id_slug_key;

CREATE UNIQUE INDEX projects_org_slug_live_idx
	ON public.projects (org_id, slug) WHERE deleted_at IS NULL;
