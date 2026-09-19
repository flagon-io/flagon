-- Server-side search for the list endpoints is case-insensitive substring match
-- (ILIKE '%q%') on the human columns. A plain b-tree can't accelerate a leading-
-- wildcard match, so we use pg_trgm GIN indexes: they make `col ILIKE '%q%'` an
-- index scan instead of a sequential scan as tables grow. The searches themselves
-- work without these indexes; the indexes are purely for scale.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Projects: searched by name and slug.
CREATE INDEX IF NOT EXISTS projects_name_trgm ON public.projects USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS projects_slug_trgm ON public.projects USING gin (slug gin_trgm_ops);

-- Users: searched by name, email, and username (member / collaborator / team-member
-- / owner lists all resolve people through the users table).
CREATE INDEX IF NOT EXISTS users_name_trgm ON public.users USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_email_trgm ON public.users USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS users_username_trgm ON public.users USING gin (username gin_trgm_ops);

-- Teams: searched by name and slug.
CREATE INDEX IF NOT EXISTS teams_name_trgm ON public.teams USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS teams_slug_trgm ON public.teams USING gin (slug gin_trgm_ops);

-- Invitations: searched by invited email.
CREATE INDEX IF NOT EXISTS org_invitations_email_trgm ON public.org_invitations USING gin (email gin_trgm_ops);
