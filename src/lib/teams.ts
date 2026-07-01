// Team-level roles. Scaffolding for future GitHub-style team permissions: stored,
// displayed, and editable now, but they do NOT gate anything yet.
export const TEAM_ROLES = ['member', 'maintainer'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export function isTeamRole(value: string): value is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(value);
}
