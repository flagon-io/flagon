-- The project's README (Markdown), manually managed today and repo-synced later.
-- projects is an existing tenant table, so its RLS policy already covers this new
-- column; no new policy needed.
ALTER TABLE "projects" ADD COLUMN "readme" text;
