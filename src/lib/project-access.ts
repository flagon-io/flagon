/**
 * Project role ladder, repository-style. Shared by client forms and the
 * server; data access lives in ./project-access.server.ts.
 *
 * The model:
 * - Organization owners and admins are implicitly ADMIN on every project.
 * - Every organization member has implicit READ access to every project.
 * - Grants (to a user or a team) elevate beyond that baseline; a subject's
 *   effective role is the highest of everything that applies.
 */
export const PROJECT_ROLES = ["read", "write", "admin"] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

export function isProjectRole(value: string): value is ProjectRole {
  return (PROJECT_ROLES as readonly string[]).includes(value);
}

const RANK: Record<ProjectRole, number> = { read: 0, write: 1, admin: 2 };

export function roleAtLeast(role: ProjectRole, needed: ProjectRole): boolean {
  return RANK[role] >= RANK[needed];
}

export function highestRole(roles: ProjectRole[]): ProjectRole | null {
  let best: ProjectRole | null = null;
  for (const role of roles) {
    if (best === null || RANK[role] > RANK[best]) best = role;
  }
  return best;
}

export const PROJECT_ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  read: "See the project and everything in it.",
  write: "Change project resources (flags, configuration) but not access.",
  admin: "Full control, including access and project settings.",
};
