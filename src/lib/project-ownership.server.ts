import { and, eq, inArray } from "drizzle-orm";
import { users } from "@/db/auth-schema";
import { members, projectOwners, teams } from "@/db/schema";
import { db } from "@/db/client";
import { withTenant } from "@/db/tenant";

/**
 * Catalog ownership: who is RESPONSIBLE for a project.
 *
 * Ownership is documentation, not authorization - it grants nothing, and
 * access lives in project_roles. An owner is a team or a person (drizzle/0026);
 * one row names exactly one of them.
 */

export type ProjectOwner = {
  id: string;
  kind: "team" | "user";
  /** Team id or user id, depending on kind. */
  subjectId: string;
  name: string;
  /** Only ever set for people. */
  username: string | null;
  image: string | null;
  createdAt: Date;
};

export async function listProjectOwners(
  orgId: string,
  projectId: string,
): Promise<ProjectOwner[]> {
  const rows = await withTenant(orgId, (tx) =>
    tx
      .select({
        id: projectOwners.id,
        teamId: projectOwners.teamId,
        userId: projectOwners.userId,
        createdAt: projectOwners.createdAt,
      })
      .from(projectOwners)
      .where(
        and(
          eq(projectOwners.organizationId, orgId),
          eq(projectOwners.projectId, projectId),
        ),
      ),
  );
  if (!rows.length) return [];

  // Teams are tenant data; users are auth-layer and joined outside the tenant
  // transaction (see src/db/tenancy.test.ts for why the two differ).
  const teamIds = rows
    .map((row) => row.teamId)
    .filter((id): id is string => Boolean(id));
  const userIds = rows
    .map((row) => row.userId)
    .filter((id): id is string => Boolean(id));

  const [teamRows, userRows] = await Promise.all([
    teamIds.length
      ? withTenant(orgId, (tx) =>
          tx
            .select({ id: teams.id, name: teams.name })
            .from(teams)
            .where(inArray(teams.id, teamIds)),
        )
      : Promise.resolve([]),
    userIds.length
      ? db
          .select({
            id: users.id,
            name: users.name,
            username: users.username,
            image: users.image,
          })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);

  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const userById = new Map(userRows.map((user) => [user.id, user]));

  return rows
    .map((row): ProjectOwner | null => {
      if (row.teamId) {
        const team = teamById.get(row.teamId);
        return team
          ? {
              id: row.id,
              kind: "team",
              subjectId: team.id,
              name: team.name,
              username: null,
              image: null,
              createdAt: row.createdAt,
            }
          : null;
      }
      if (!row.userId) return null;
      const user = userById.get(row.userId);
      return user
        ? {
            id: row.id,
            kind: "user",
            subjectId: user.id,
            name: user.name,
            username: user.username,
            image: user.image,
            createdAt: row.createdAt,
          }
        : null;
    })
    .filter((owner): owner is ProjectOwner => owner !== null)
    .sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
    );
}

/**
 * Replaces the whole owner set.
 *
 * Both lists are validated against THIS organization before anything is
 * written: a team from another org, or a user who is not a member here, would
 * otherwise let one tenant name another tenant's people in its catalog.
 */
export async function replaceProjectOwners(
  orgId: string,
  projectId: string,
  requested: { teamIds?: string[]; userIds?: string[] },
) {
  const teamIds = [...new Set(requested.teamIds ?? [])];
  const userIds = [...new Set(requested.userIds ?? [])];

  const validTeams = teamIds.length
    ? await withTenant(orgId, (tx) =>
        tx
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(eq(teams.organizationId, orgId), inArray(teams.id, teamIds)),
          ),
      )
    : [];
  if (validTeams.length !== teamIds.length) {
    return {
      ok: false as const,
      code: "invalid_team",
      error: "Every owning team must belong to this organization.",
    };
  }

  const validUsers = userIds.length
    ? await db
        .select({ userId: members.userId })
        .from(members)
        .where(
          and(
            eq(members.organizationId, orgId),
            inArray(members.userId, userIds),
          ),
        )
    : [];
  if (validUsers.length !== userIds.length) {
    return {
      ok: false as const,
      code: "invalid_user",
      error: "Every owning person must be a member of this organization.",
    };
  }

  await withTenant(orgId, async (tx) => {
    await tx
      .delete(projectOwners)
      .where(
        and(
          eq(projectOwners.organizationId, orgId),
          eq(projectOwners.projectId, projectId),
        ),
      );
    const values = [
      ...teamIds.map((teamId) => ({
        organizationId: orgId,
        projectId,
        teamId,
        userId: null,
      })),
      ...userIds.map((userId) => ({
        organizationId: orgId,
        projectId,
        teamId: null,
        userId,
      })),
    ];
    if (values.length) await tx.insert(projectOwners).values(values);
  });

  return {
    ok: true as const,
    owners: await listProjectOwners(orgId, projectId),
  };
}

/**
 * Owners for every project in the organization at once, keyed by project id.
 *
 * The project list renders owners on each card, and calling listProjectOwners
 * per project would be one query per card plus two name lookups each. This is
 * three queries total regardless of how many projects there are.
 */
export async function ownersByProject(
  orgId: string,
): Promise<Map<string, ProjectOwner[]>> {
  const rows = await withTenant(orgId, (tx) =>
    tx
      .select({
        id: projectOwners.id,
        projectId: projectOwners.projectId,
        teamId: projectOwners.teamId,
        userId: projectOwners.userId,
        createdAt: projectOwners.createdAt,
      })
      .from(projectOwners)
      .where(eq(projectOwners.organizationId, orgId)),
  );
  if (!rows.length) return new Map();

  const teamIds = rows
    .map((r) => r.teamId)
    .filter((id): id is string => Boolean(id));
  const userIds = rows
    .map((r) => r.userId)
    .filter((id): id is string => Boolean(id));

  const [teamRows, userRows] = await Promise.all([
    teamIds.length
      ? withTenant(orgId, (tx) =>
          tx
            .select({ id: teams.id, name: teams.name })
            .from(teams)
            .where(inArray(teams.id, teamIds)),
        )
      : Promise.resolve([]),
    userIds.length
      ? db
          .select({
            id: users.id,
            name: users.name,
            username: users.username,
            image: users.image,
          })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);
  const teamById = new Map(teamRows.map((t) => [t.id, t]));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const byProject = new Map<string, ProjectOwner[]>();
  for (const row of rows) {
    const team = row.teamId ? teamById.get(row.teamId) : null;
    const user = row.userId ? userById.get(row.userId) : null;
    const subject = team ?? user;
    // A row whose subject vanished is skipped rather than rendered as a blank
    // chip; the cascade should prevent it, but a card is the wrong place to
    // discover that it did not.
    if (!subject) continue;
    const owner: ProjectOwner = {
      id: row.id,
      kind: team ? "team" : "user",
      subjectId: subject.id,
      name: subject.name,
      username: user?.username ?? null,
      image: user?.image ?? null,
      createdAt: row.createdAt,
    };
    byProject.set(row.projectId, [
      ...(byProject.get(row.projectId) ?? []),
      owner,
    ]);
  }
  for (const owners of byProject.values()) {
    owners.sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
    );
  }
  return byProject;
}

/** The people and teams that can be named as owners, for the picker. */
export async function ownerCandidates(orgId: string): Promise<{
  teams: { id: string; name: string }[];
  people: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
  }[];
}> {
  const [teamRows, peopleRows] = await Promise.all([
    withTenant(orgId, (tx) =>
      tx
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(eq(teams.organizationId, orgId)),
    ),
    db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        image: users.image,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.organizationId, orgId)),
  ]);

  return {
    teams: teamRows.sort((a, b) => a.name.localeCompare(b.name)),
    people: peopleRows.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export const serializeProjectOwner = (owner: ProjectOwner) => ({
  id: owner.id,
  type: owner.kind,
  // Kept for compatibility with the original team-only shape; null for people.
  team_id: owner.kind === "team" ? owner.subjectId : null,
  team_name: owner.kind === "team" ? owner.name : null,
  user_id: owner.kind === "user" ? owner.subjectId : null,
  username: owner.username,
  name: owner.name,
  created_at: owner.createdAt.toISOString(),
});
