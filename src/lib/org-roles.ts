/**
 * Organization roles.
 *
 * An organization has exactly ONE owner: the person ultimately responsible
 * for it (billing, deletion, handing it over). Ownership is never granted
 * by invitation or by editing a role - it is TRANSFERRED by the current
 * owner to an existing member, who takes the seat while the previous owner
 * steps down to admin.
 *
 * Everyone else is an admin (manages people, teams, and projects) or a
 * member.
 */
export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Roles that can be handed out directly (invites, role changes). */
export const ASSIGNABLE_ORG_ROLES = ["admin", "member"] as const;
export type AssignableOrgRole = (typeof ASSIGNABLE_ORG_ROLES)[number];

export function isAssignableOrgRole(value: string): value is AssignableOrgRole {
  return (ASSIGNABLE_ORG_ROLES as readonly string[]).includes(value);
}

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const ORG_ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner:
    "Ultimately responsible for the organization, including billing and deletion. Exactly one person, changed by transferring ownership.",
  admin: "Manages people, teams, and projects.",
  member: "Works in the organization's projects.",
};

/** Ownership can only be handed over by the owner. */
export const TRANSFER_OWNERSHIP_HINT =
  "The new owner takes over the organization and you become an admin.";
