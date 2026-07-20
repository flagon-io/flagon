import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { teamMembers, teams } from "../db/schema";

/**
 * Team data access. Create/update/remove live behind auth.api.* (the
 * BetterAuth organization plugin) so its permission checks apply; this module
 * holds what the plugin doesn't - serialization and read helpers. Validation
 * rules live in ./teams.ts so client forms can share them without pulling in
 * the database client.
 */

/** Public REST shape (snake_case), shared by the v1 routes. */
export function serializeTeam(team: {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt?: Date | null;
}) {
  return {
    id: team.id,
    name: team.name,
    created_at: team.createdAt.toISOString(),
    updated_at: (team.updatedAt ?? team.createdAt).toISOString(),
  };
}

/**
 * The team's roster (userId + when they were added). Read directly rather
 * than via the plugin's list endpoint, which only answers to people already
 * ON the team - our model lets any organization member view any team.
 * Callers are responsible for org-membership gating.
 */
export async function listTeamRoster(
  teamId: string,
): Promise<{ userId: string; createdAt: Date }[]> {
  return db
    .select({ userId: teamMembers.userId, createdAt: teamMembers.createdAt })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(teamMembers.createdAt);
}

/** The teams (id + name) a user belongs to within an organization. */
export async function listUserTeams(
  orgId: string,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: teams.id, name: teams.name })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teams.organizationId, orgId), eq(teamMembers.userId, userId)))
    .orderBy(teams.name);
}

/** Member counts per team for an organization, in one query. */
export async function teamMemberCounts(
  orgId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      teamId: teamMembers.teamId,
      count: sql<number>`count(*)::int`,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teams.organizationId, orgId))
    .groupBy(teamMembers.teamId);
  return new Map(rows.map((row) => [row.teamId, row.count]));
}
