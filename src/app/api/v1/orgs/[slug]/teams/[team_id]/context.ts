import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";

/**
 * Shared request context for team-scoped v1 routes: authenticates,
 * membership-gates the org, and verifies the team belongs to it. Unknown
 * orgs/teams and non-members all surface as 404 so private resources'
 * existence never leaks.
 */
type FullOrganization = NonNullable<
  Awaited<ReturnType<typeof auth.api.getFullOrganization>>
>;

export type TeamContext = {
  org: FullOrganization;
  team: { id: string; name: string; createdAt: Date; updatedAt?: Date | null };
  userId: string;
};

export type TeamContextResult =
  | { ok: true; ctx: TeamContext }
  | { ok: false; status: number; code: string; message: string };

export async function resolveTeamContext(
  request: Request,
  orgSlug: string,
  teamId: string,
): Promise<TeamContextResult> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { ok: false, status: 401, code: "unauthorized", message: "Sign in required." };
  }

  let org: FullOrganization | null;
  try {
    org = await auth.api.getFullOrganization({
      query: { organizationSlug: orgSlug },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) org = null;
    else throw error;
  }
  if (!org) {
    return { ok: false, status: 404, code: "not_found", message: "Organization not found." };
  }

  const teams = await auth.api.listOrganizationTeams({
    query: { organizationId: org.id },
    headers: request.headers,
  });
  const team = teams.find((t) => t.id === teamId);
  if (!team) {
    return { ok: false, status: 404, code: "not_found", message: "Team not found." };
  }

  return { ok: true, ctx: { org, team, userId: session.user.id } };
}
