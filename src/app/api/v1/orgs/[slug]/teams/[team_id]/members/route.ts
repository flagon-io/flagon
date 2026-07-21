import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { apiError, apiJson } from "@/lib/api";
import { listTeamRoster } from "@/lib/teams.server";
import { resolveTeamContext } from "../context";

/**
 * GET /api/v1/orgs/:slug/teams/:team_id/members -> who's on the team.
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; team_id: string }> },
) {
  const { slug, team_id } = await params;
  const result = await resolveTeamContext(
    request,
    slug,
    team_id,
    "members:read",
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);

  const rows = await listTeamRoster(team_id);
  const userIds = rows.map((row) => row.userId);
  const userRows = userIds.length
    ? await db
        .select({ id: users.id, username: users.username, name: users.name })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const usersById = new Map(userRows.map((row) => [row.id, row]));

  return apiJson(
    rows.flatMap((row) => {
      const user = usersById.get(row.userId);
      if (!user) return [];
      return [
        {
          username: user.username,
          name: user.name,
          added_at: row.createdAt.toISOString(),
        },
      ];
    }),
  );
}
