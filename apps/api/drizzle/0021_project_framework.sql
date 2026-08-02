-- The project's primary stack/framework (Vercel-style preset), a catalog hint
-- for what a service is built on. Validated against a fixed registry in the API
-- (projects.route.ts); stored as a slug so the registry can grow without a
-- migration. Nullable: a project can have no stack set. Additive to a future
-- Deployments product, which can consume this as the deploy preset.
-- projects is an existing tenant table, so its RLS policy already covers this
-- new column; no new policy needed.
ALTER TABLE "projects" ADD COLUMN "framework" text;
