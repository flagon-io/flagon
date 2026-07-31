-- Unwind the GitHub App / repository integration. Projects stay, but they no
-- longer link to a repository, so the denormalized repo fields and the
-- installation table go away. The FK must drop before the table it references.
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_github_installation_id_github_installations_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "github_installation_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "repo_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "repo_full_name";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "repo_default_branch";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "repo_private";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "root_directory";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "framework";--> statement-breakpoint
DROP TABLE IF EXISTS "github_installations";
