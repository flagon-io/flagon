import { Hono } from "hono";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type TenantTx } from "../../db/tenant.js";
import { teams, teamMembers, projects } from "../../db/schema.js";
import { members, users } from "../../db/auth-tables.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import {
  resolveOrg,
  requireManager,
  isManagerRole,
  type OrgContext,
} from "../../lib/org-context.js";
import { isValidSlug } from "../../lib/slug.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Teams — a named group of people inside an org (GitHub-style). A team owns
 * projects in the catalog and carries its own membership with roles
 * ('maintainer' | 'member'). Mounted at /v1/orgs/:org/teams.
 *
 * Visibility is org-wide (any member sees the teams and their rosters). Creating
 * and deleting a team is owner/admin only; editing a team and managing its
 * membership is owner/admin OR a maintainer of that team. Everything runs inside
 * withOrg() so RLS enforces tenancy at the database.
 */
export const teams_ = new Hono();
teams_.use("*", authContext);

const TAG = "Teams";
const TEAM_ROLES = ["maintainer", "member"] as const;

const createBody = z.object({
  name: z.string().trim().min(1).max(100),
  key: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
const addMemberBody = z.object({
  userId: z.string().uuid(),
  role: z.enum(TEAM_ROLES).optional(),
});
const memberRoleBody = z.object({ role: z.enum(TEAM_ROLES) }).strict();

const teamSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number(),
  projectCount: z.number(),
  createdAt: z.string(),
});
const teamMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string().nullable(),
  role: z.string(),
  joinedAt: z.string(),
});
registerComponentSchema("Team", teamSchema);
registerComponentSchema("TeamResponse", z.object({ team: teamSchema }));
registerComponentSchema("TeamListResponse", z.array(teamSchema));
registerComponentSchema("TeamMember", teamMemberSchema);
registerComponentSchema("TeamMemberListResponse", z.array(teamMemberSchema));

type TeamRow = typeof teams.$inferSelect;
function serializeTeam(t: TeamRow, memberCount: number, projectCount: number) {
  return {
    key: t.key,
    name: t.name,
    description: t.description,
    memberCount,
    projectCount,
    createdAt: t.createdAt.toISOString(),
  };
}

/** Load a team by key within the tenant transaction, or null. */
async function teamByKey(tx: TenantTx, key: string) {
  return tx
    .select()
    .from(teams)
    .where(eq(teams.key, key))
    .limit(1)
    .then((r) => r[0] ?? null);
}

/** Whether the actor is a maintainer of the given team. */
async function isTeamMaintainer(
  tx: TenantTx,
  teamId: string,
  actorUserId: string | null,
): Promise<boolean> {
  if (!actorUserId) return false;
  const row = await tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actorUserId)))
    .limit(1)
    .then((r) => r[0]);
  return row?.role === "maintainer";
}

/**
 * Whether demoting or removing this user would leave the team with no
 * maintainer. A team must always keep at least one maintainer as its internal
 * owner (org managers remain the outer safety net). Only relevant when the
 * target is currently a maintainer.
 */
async function wouldOrphanTeam(
  tx: TenantTx,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const target = await tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1)
    .then((r) => r[0]);
  if (target?.role !== "maintainer") return false;
  const [{ n } = { n: 0 }] = await tx
    .select({ n: count() })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "maintainer")));
  return Number(n) <= 1;
}

/**
 * Gate team management (edit + membership) to org managers or a maintainer of
 * this team. Read-only roles are already refused upstream in resolveOrg.
 */
async function canManageTeam(
  tx: TenantTx,
  ctx: OrgContext,
  teamId: string,
): Promise<boolean> {
  if (isManagerRole(ctx.role)) return true;
  return isTeamMaintainer(tx, teamId, ctx.actorUserId);
}

// --- OpenAPI ----------------------------------------------------------------
const pParams = { org: "The organization slug." };
const kParams = { ...pParams, key: "The team key." };
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/teams",
  summary: "List teams",
  description: "Every team in the organization, with member and owned-project counts.",
  tags: [TAG],
  auth: true,
  paramDescriptions: pParams,
  responses: { 200: { description: "The organization's teams.", schemaName: "TeamListResponse" } },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/teams/{key}",
  summary: "Get a team",
  description: "One team by key.",
  tags: [TAG],
  auth: true,
  paramDescriptions: kParams,
  responses: {
    200: { description: "The team.", schemaName: "TeamResponse" },
    404: { description: "No team with that key." },
  },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/teams",
  summary: "Create a team",
  description: "Create a team. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: pParams,
  request: { body: createBody },
  responses: {
    201: { description: "The created team.", schemaName: "TeamResponse" },
    400: { description: "Invalid key." },
    409: { description: "A team with that key already exists." },
    422: { description: "Validation failed." },
  },
});
registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/teams/{key}",
  summary: "Update a team",
  description: "Rename a team or change its description. Owner/admin or a team maintainer.",
  tags: [TAG],
  auth: true,
  paramDescriptions: kParams,
  request: { body: updateBody },
  responses: {
    200: { description: "The updated team.", schemaName: "TeamResponse" },
    404: { description: "No such team." },
    422: { description: "Validation failed." },
  },
});
registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/teams/{key}",
  summary: "Delete a team",
  description: "Permanently delete a team. Owned projects become unowned. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: kParams,
  responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such team." } },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/teams/{key}/members",
  summary: "List team members",
  description: "The team's members with their org identity and team role.",
  tags: [TAG],
  auth: true,
  paramDescriptions: kParams,
  responses: {
    200: { description: "The team's members.", schemaName: "TeamMemberListResponse" },
    404: { description: "No such team." },
  },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/teams/{key}/members",
  summary: "Add a team member",
  description:
    "Add an existing org member to the team. Owner/admin or a team maintainer.",
  tags: [TAG],
  auth: true,
  paramDescriptions: kParams,
  request: { body: addMemberBody },
  responses: {
    201: { description: "Added.", schemaName: "DeleteAck" },
    400: { description: "The user is not a member of this organization." },
    404: { description: "No such team." },
    409: { description: "Already on the team." },
    422: { description: "Validation failed." },
  },
});
registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/teams/{key}/members/{userId}",
  summary: "Change a team member's role",
  description: "Set a member's team role (maintainer/member). Owner/admin or a maintainer.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...kParams, userId: "The member's user id." },
  request: { body: memberRoleBody },
  responses: {
    200: { description: "Updated.", schemaName: "DeleteAck" },
    404: { description: "No such team or member." },
    409: { description: "Would leave the team with no maintainer." },
    422: { description: "Validation failed." },
  },
});
registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/teams/{key}/members/{userId}",
  summary: "Remove a team member",
  description: "Remove a member from the team. Owner/admin or a maintainer.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...kParams, userId: "The member's user id." },
  responses: {
    200: { description: "Removed.", schemaName: "DeleteAck" },
    404: { description: "No such team or member." },
    409: { description: "Would leave the team with no maintainer." },
  },
});

// --- List / get (any member) ------------------------------------------------
teams_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  return c.json(
    await withOrg(ctx.orgId, async (tx) => {
      const rows = await tx.select().from(teams).orderBy(desc(teams.createdAt));
      const memberCounts = await tx
        .select({ teamId: teamMembers.teamId, n: count() })
        .from(teamMembers)
        .groupBy(teamMembers.teamId);
      const projectCounts = await tx
        .select({ teamId: projects.ownerTeamId, n: count() })
        .from(projects)
        .where(isNotNull(projects.ownerTeamId))
        .groupBy(projects.ownerTeamId);
      const mBy = new Map(memberCounts.map((r) => [r.teamId, Number(r.n)]));
      const pBy = new Map(projectCounts.map((r) => [r.teamId, Number(r.n)]));
      return rows.map((t) => serializeTeam(t, mBy.get(t.id) ?? 0, pBy.get(t.id) ?? 0));
    }),
  );
});

teams_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const team = await teamByKey(tx, c.req.param("key"));
    if (!team) return null;
    const [{ n: m } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, team.id));
    const [{ n: p } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(projects)
      .where(eq(projects.ownerTeamId, team.id));
    return serializeTeam(team, Number(m), Number(p));
  });
  if (!result) return jsonError(c, 404, "Team not found.");
  return c.json({ team: result });
});

teams_.get("/:key/members", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const team = await teamByKey(tx, c.req.param("key"));
    if (!team) return null;
    return tx
      .select({
        userId: teamMembers.userId,
        name: users.name,
        email: users.email,
        username: users.username,
        role: teamMembers.role,
        joinedAt: teamMembers.createdAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, team.id))
      .orderBy(teamMembers.createdAt);
  });
  if (result === null) return jsonError(c, 404, "Team not found.");
  return c.json(
    result.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() })),
  );
});

// --- Create (manager) -------------------------------------------------------
teams_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { name, key, description } = parsed.data;

  // Shape only — same reasoning as project keys: a team key lives at
  // /[org]/teams/[team] and shares a namespace with nothing, so the top-level
  // reserved-word list (org slugs, usernames) does not apply to it.
  if (!isValidSlug(key)) {
    return jsonError(c, 400, "Choose a different team key (letters, numbers, dashes).");
  }

  const result = await withOrg(ctx.orgId, async (tx) => {
    const existing = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.key, key))
      .limit(1)
      .then((r) => r[0]);
    if (existing) return "conflict" as const;

    const [team] = await tx
      .insert(teams)
      .values({
        organizationId: ctx.orgId,
        key,
        name,
        description: description ?? null,
        createdByUserId: ctx.actorUserId,
      })
      .returning();
    // The creator (when a user, not an org token) starts as the team's first
    // maintainer, so a team is never born unmanageable.
    if (ctx.actorUserId) {
      await tx.insert(teamMembers).values({
        organizationId: ctx.orgId,
        teamId: team.id,
        userId: ctx.actorUserId,
        role: "maintainer",
      });
    }
    return serializeTeam(team, ctx.actorUserId ? 1 : 0, 0);
  });

  if (result === "conflict") return jsonError(c, 409, `A team named "${key}" already exists.`);
  return c.json({ team: result }, 201);
});

// --- Update (manager or maintainer) ----------------------------------------
teams_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = updateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const result = await withOrg(ctx.orgId, async (tx) => {
    const team = await teamByKey(tx, c.req.param("key"));
    if (!team) return "not_found" as const;
    if (!(await canManageTeam(tx, ctx, team.id))) return "forbidden" as const;

    const [row] = await tx
      .update(teams)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(teams.id, team.id))
      .returning();
    const [{ n: m } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, team.id));
    const [{ n: p } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(projects)
      .where(eq(projects.ownerTeamId, team.id));
    return serializeTeam(row, Number(m), Number(p));
  });

  if (result === "not_found") return jsonError(c, 404, "Team not found.");
  if (result === "forbidden")
    return jsonError(c, 403, "Only org admins or a team maintainer can manage this team.");
  return c.json({ team: result });
});

// --- Delete (manager) -------------------------------------------------------
teams_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const deleted = await withOrg(ctx.orgId, async (tx) => {
    const team = await teamByKey(tx, c.req.param("key"));
    if (!team) return false;
    // team_members cascade on the FK; projects.owner_team_id is SET NULL.
    await tx.delete(teams).where(eq(teams.id, team.id));
    return true;
  });
  if (!deleted) return jsonError(c, 404, "Team not found.");
  return c.json({ ok: true });
});

// --- Membership (manager or maintainer) ------------------------------------
teams_.post("/:key/members", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = addMemberBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { userId, role } = parsed.data;

  const result = await withOrg(ctx.orgId, async (tx) => {
    const team = await teamByKey(tx, c.req.param("key"));
    if (!team) return "not_found" as const;
    if (!(await canManageTeam(tx, ctx, team.id))) return "forbidden" as const;

    // Only org members can be on a team (members is an auth-layer table, no RLS).
    const isOrgMember = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.organizationId, ctx.orgId), eq(members.userId, userId)))
      .limit(1)
      .then((r) => r[0]);
    if (!isOrgMember) return "not_member" as const;

    const already = await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId)))
      .limit(1)
      .then((r) => r[0]);
    if (already) return "conflict" as const;

    await tx.insert(teamMembers).values({
      organizationId: ctx.orgId,
      teamId: team.id,
      userId,
      role: role ?? "member",
    });
    return "ok" as const;
  });

  if (result === "not_found") return jsonError(c, 404, "Team not found.");
  if (result === "forbidden")
    return jsonError(c, 403, "Only org admins or a team maintainer can manage this team.");
  if (result === "not_member")
    return jsonError(c, 400, "That user is not a member of this organization.");
  if (result === "conflict") return jsonError(c, 409, "That user is already on the team.");
  return c.json({ ok: true }, 201);
});

teams_.patch("/:key/members/:userId", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const parsed = memberRoleBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const result = await withOrg(ctx.orgId, async (tx) => {
    const team = await teamByKey(tx, c.req.param("key"));
    if (!team) return "not_found" as const;
    if (!(await canManageTeam(tx, ctx, team.id))) return "forbidden" as const;

    // Demoting the last maintainer would orphan the team's internal ownership.
    if (
      parsed.data.role === "member" &&
      (await wouldOrphanTeam(tx, team.id, c.req.param("userId")))
    ) {
      return "last_maintainer" as const;
    }

    const [row] = await tx
      .update(teamMembers)
      .set({ role: parsed.data.role })
      .where(
        and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, c.req.param("userId"))),
      )
      .returning({ id: teamMembers.id });
    return row ? ("ok" as const) : ("no_member" as const);
  });

  if (result === "not_found" || result === "no_member")
    return jsonError(c, 404, "That member is not on the team.");
  if (result === "forbidden")
    return jsonError(c, 403, "Only org admins or a team maintainer can manage this team.");
  if (result === "last_maintainer")
    return jsonError(c, 409, "A team must keep at least one maintainer. Promote another member first.");
  return c.json({ ok: true });
});

teams_.delete("/:key/members/:userId", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const team = await teamByKey(tx, c.req.param("key"));
    if (!team) return "not_found" as const;
    if (!(await canManageTeam(tx, ctx, team.id))) return "forbidden" as const;

    // Removing the last maintainer would orphan the team's internal ownership.
    if (await wouldOrphanTeam(tx, team.id, c.req.param("userId"))) {
      return "last_maintainer" as const;
    }

    const [row] = await tx
      .delete(teamMembers)
      .where(
        and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, c.req.param("userId"))),
      )
      .returning({ id: teamMembers.id });
    return row ? ("ok" as const) : ("no_member" as const);
  });
  if (result === "not_found" || result === "no_member")
    return jsonError(c, 404, "That member is not on the team.");
  if (result === "forbidden")
    return jsonError(c, 403, "Only org admins or a team maintainer can manage this team.");
  if (result === "last_maintainer")
    return jsonError(c, 409, "A team must keep at least one maintainer. Promote another member first.");
  return c.json({ ok: true });
});
