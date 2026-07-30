/**
 * Console feature flags. One place to flip a work-in-progress surface on or off.
 *
 * PROJECTS_ENABLED gates the whole Projects + source-provider (GitHub) feature:
 * the org-home Projects list, the Integrations hub, per-project pages, and the
 * project-creation policy in settings. It's OFF while the GitHub connect flow is
 * being finalized — the API endpoints stay in place (they degrade to 503 with no
 * app configured), this just hides the unfinished UI. Flip to true to restore it
 * everywhere.
 */
export const PROJECTS_ENABLED: boolean = false;
