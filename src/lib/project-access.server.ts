import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { isUniqueViolation } from "../db/errors";
import {
  projectOwners,
  projectRoles,
  projects,
  teamMembers,
  teams,
} from "../db/schema";
import { users } from "../db/auth-schema";
import { withTenant } from "../db/tenant";
import { type ProjectRole, highestRole } from "./project-access";

/**
 * Project access data access. Grants live in project_roles (tenant-scoped
 * RLS); resolution combines org-role implications, direct user grants, and
 * grants to teams the user belongs to. Shared by console pages and the /v1
 * routes - one implementation, no drift.
 */

export type ProjectGrantRow = typeof projectRoles.$inferSelect;

/** A grant enriched with its subject's display identity. */
export type ProjectGrant = {
  id: string;
  role: ProjectRole;
  createdAt: Date;
  subject:
    | { type: "user"; id: string; username: string | null; name: string }
    | { type: "team"; id: string; name: string };
};

/** Minimal shape of an org membership row used for role resolution. */
type OrgMember = { userId: string; role: string };

function orgRoleImpliesAdmin(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Team ids (within the org) the user belongs to. */
export async function userTeamIds(
  orgId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(
      and(eq(teams.organizationId, orgId), eq(teamMembers.userId, userId)),
    );
  return rows.map((row) => row.teamId);
}

/**
 * The user's effective role on a project, or null for non-members.
 * Owners/admins -> admin; otherwise the highest of read (member baseline),
 * direct grants, and team grants.
 */
export async function resolveProjectRole(input: {
  orgId: string;
  projectId: string;
  userId: string;
  members: OrgMember[];
}): Promise<ProjectRole | null> {
  const membership = input.members.find((m) => m.userId === input.userId);
  if (!membership) return null;
  if (orgRoleImpliesAdmin(membership.role)) return "admin";

  const teamIds = await userTeamIds(input.orgId, input.userId);
  const grants = await withTenant(input.orgId, (tx) =>
    tx
      .select({
        role: projectRoles.role,
        subjectType: projectRoles.subjectType,
        subjectId: projectRoles.subjectId,
      })
      .from(projectRoles)
      .where(eq(projectRoles.projectId, input.projectId)),
  );

  const applicable = grants
    .filter(
      (g) =>
        (g.subjectType === "user" && g.subjectId === input.userId) ||
        (g.subjectType === "team" && teamIds.includes(g.subjectId)),
    )
    .map((g) => g.role as ProjectRole);

  return highestRole([...applicable, "read"]);
}

/** All grants on a project, enriched with subject identities. */
export async function listProjectGrants(
  orgId: string,
  projectId: string,
): Promise<ProjectGrant[]> {
  const rows = await withTenant(orgId, (tx) =>
    tx.select().from(projectRoles).where(eq(projectRoles.projectId, projectId)),
  );

  const userIds = rows
    .filter((r) => r.subjectType === "user")
    .map((r) => r.subjectId);
  const teamIds = rows
    .filter((r) => r.subjectType === "team")
    .map((r) => r.subjectId);

  const [userRows, teamRows] = await Promise.all([
    userIds.length
      ? db
          .select({ id: users.id, username: users.username, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
    teamIds.length
      ? db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, teamIds))
      : Promise.resolve([]),
  ]);
  const usersById = new Map(userRows.map((u) => [u.id, u]));
  const teamsById = new Map(teamRows.map((t) => [t.id, t]));

  return rows.flatMap((row): ProjectGrant[] => {
    if (row.subjectType === "user") {
      const user = usersById.get(row.subjectId);
      if (!user) return [];
      return [
        {
          id: row.id,
          role: row.role as ProjectRole,
          createdAt: row.createdAt,
          subject: {
            type: "user",
            id: user.id,
            username: user.username ?? null,
            name: user.name,
          },
        },
      ];
    }
    const team = teamsById.get(row.subjectId);
    if (!team) return [];
    return [
      {
        id: row.id,
        role: row.role as ProjectRole,
        createdAt: row.createdAt,
        subject: { type: "team", id: team.id, name: team.name },
      },
    ];
  });
}

export type MemberProjectGrant = {
  project: { id: string; slug: string; name: string };
  role: ProjectRole;
  via: { type: "direct" } | { type: "team"; teamId: string; teamName: string };
};

/**
 * Every explicit project grant that applies to a user: direct grants plus
 * grants held by teams they belong to. (The member read baseline and
 * owner/admin implication are implicit and not listed.)
 */
export async function listMemberProjectGrants(
  orgId: string,
  userId: string,
): Promise<MemberProjectGrant[]> {
  const teamIds = await userTeamIds(orgId, userId);

  const rows = await withTenant(orgId, (tx) =>
    tx
      .select({
        role: projectRoles.role,
        subjectType: projectRoles.subjectType,
        subjectId: projectRoles.subjectId,
        projectId: projects.id,
        projectSlug: projects.slug,
        projectName: projects.name,
      })
      .from(projectRoles)
      .innerJoin(projects, eq(projects.id, projectRoles.projectId)),
  );

  const applicable = rows.filter(
    (row) =>
      (row.subjectType === "user" && row.subjectId === userId) ||
      (row.subjectType === "team" && teamIds.includes(row.subjectId)),
  );

  const grantTeamIds = [
    ...new Set(
      applicable
        .filter((row) => row.subjectType === "team")
        .map((row) => row.subjectId),
    ),
  ];
  const teamRows = grantTeamIds.length
    ? await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, grantTeamIds))
    : [];
  const teamNames = new Map(teamRows.map((row) => [row.id, row.name]));

  return applicable.map((row) => ({
    project: {
      id: row.projectId,
      slug: row.projectSlug,
      name: row.projectName,
    },
    role: row.role as ProjectRole,
    via:
      row.subjectType === "user"
        ? { type: "direct" as const }
        : {
            type: "team" as const,
            teamId: row.subjectId,
            teamName: teamNames.get(row.subjectId) ?? "team",
          },
  }));
}

export type TeamProject = {
  project: { id: string; slug: string; name: string };
  /** The granted role, or null when the team owns the project without access. */
  role: ProjectRole | null;
  /** Named as responsible for the project in the catalog. */
  owner: boolean;
  /** When the grant was made; null for an owned project with no grant. */
  grantedAt: Date | null;
};

/**
 * Every project a team is attached to, by ACCESS or by OWNERSHIP.
 *
 * The two are deliberately independent (see project-ownership.server.ts):
 * ownership is a statement about who is responsible, and it grants nothing.
 * That makes "owns it but cannot open it" a real and interesting state - it
 * usually means a grant was revoked and the catalog was never updated - so
 * listing grants alone hides exactly the rows worth seeing. One query with two
 * outer joins rather than two lists, because the answer people want is per
 * project ("what is this team to this project?"), not per mechanism.
 */
export async function listTeamProjects(
  orgId: string,
  teamId: string,
): Promise<TeamProject[]> {
  const rows = await withTenant(orgId, (tx) =>
    tx
      .select({
        projectId: projects.id,
        projectSlug: projects.slug,
        projectName: projects.name,
        role: projectRoles.role,
        grantedAt: projectRoles.createdAt,
        ownerId: projectOwners.id,
      })
      .from(projects)
      .leftJoin(
        projectRoles,
        and(
          eq(projectRoles.projectId, projects.id),
          eq(projectRoles.subjectType, "team"),
          eq(projectRoles.subjectId, teamId),
        ),
      )
      .leftJoin(
        projectOwners,
        and(
          eq(projectOwners.projectId, projects.id),
          eq(projectOwners.teamId, teamId),
        ),
      )
      .where(or(isNotNull(projectRoles.id), isNotNull(projectOwners.id)))
      .orderBy(projects.name),
  );
  return rows.map((row) => ({
    project: {
      id: row.projectId,
      slug: row.projectSlug,
      name: row.projectName,
    },
    role: (row.role as ProjectRole | null) ?? null,
    owner: row.ownerId !== null,
    grantedAt: row.grantedAt ?? null,
  }));
}

export type UpsertGrantResult =
  | { ok: true; grant: ProjectGrantRow }
  | { ok: false; code: "invalid_subject"; error: string };

/**
 * Create or update a grant (idempotent per subject). The caller is
 * responsible for validating that the subject belongs to the organization.
 */
export async function upsertProjectGrant(input: {
  orgId: string;
  projectId: string;
  subjectType: "user" | "team";
  subjectId: string;
  role: ProjectRole;
}): Promise<UpsertGrantResult> {
  try {
    const [grant] = await withTenant(input.orgId, (tx) =>
      tx
        .insert(projectRoles)
        .values({
          organizationId: input.orgId,
          projectId: input.projectId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          role: input.role,
        })
        .onConflictDoUpdate({
          target: [
            projectRoles.projectId,
            projectRoles.subjectType,
            projectRoles.subjectId,
          ],
          set: { role: input.role, updatedAt: new Date() },
        })
        .returning(),
    );
    return { ok: true, grant };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        code: "invalid_subject",
        error: "That subject already has a grant on this project.",
      };
    }
    throw error;
  }
}

export async function removeProjectGrant(
  orgId: string,
  projectId: string,
  grantId: string,
): Promise<boolean> {
  const removed = await withTenant(orgId, (tx) =>
    tx
      .delete(projectRoles)
      .where(
        and(
          eq(projectRoles.id, grantId),
          eq(projectRoles.projectId, projectId),
        ),
      )
      .returning({ id: projectRoles.id }),
  );
  return removed.length > 0;
}

/** Public REST shape (snake_case), shared by the v1 routes. */
export function serializeGrant(grant: ProjectGrant) {
  return {
    id: grant.id,
    role: grant.role,
    subject:
      grant.subject.type === "user"
        ? {
            type: "user" as const,
            username: grant.subject.username,
            name: grant.subject.name,
          }
        : {
            type: "team" as const,
            id: grant.subject.id,
            name: grant.subject.name,
          },
    created_at: grant.createdAt.toISOString(),
  };
}
