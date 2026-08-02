import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type TenantTx } from "../../db/tenant.js";
import { projects, teams, projectAccess } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import {
  resolveOrg,
  requireManager,
  requireProjectCreator,
} from "../../lib/org-context.js";
import { isValidSlug } from "../../lib/slug.js";
import { isReserved } from "../../lib/reserved.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Projects — the org's foundational primitive and the unit the service catalog
 * organizes around. Mounted at /v1/orgs/:org/projects. Visible org-wide (a member
 * sees the catalog of what exists + a project's overview); creating, editing, and
 * deleting are owner/admin only. Everything runs in withOrg() so RLS enforces
 * tenancy.
 */
export const projects_ = new Hono();
projects_.use("*", authContext);

const TAG = "Projects";

// Catalog vocab (OpsLevel-style). Kept small + explicit so the console can render
// a fixed picker; nullable everywhere so a project can stay bare.
const LIFECYCLES = ["planning", "in_development", "alpha", "beta", "ga", "deprecated"] as const;
const TIERS = ["1", "2", "3", "4"] as const;
// The project's primary stack/framework (Vercel-style preset). A fixed registry
// so the console can render a picker and the API can validate; the labels/colors
// the UI renders live in apps/app/src/lib/catalog.ts and MUST stay in lockstep
// with these slugs. "other" is the catch-all. Additive to a future Deployments
// product (the deploy preset).
const FRAMEWORKS = [
  // Web / frontend
  "nextjs", "react", "vue", "nuxt", "svelte", "remix", "astro", "angular", "solid", "gatsby",
  // Backend / API
  "node", "express", "nestjs", "go", "rails", "django", "flask", "fastapi", "laravel", "spring", "dotnet", "phoenix", "rust",
  // Mobile
  "reactnative", "flutter", "expo",
  // Other
  "static", "other",
] as const;
// GitHub-repository-style access levels a team can hold on a project.
const ACCESS_ROLES = ["read", "triage", "write", "maintain", "admin"] as const;
const tagsField = z.array(z.string().trim().min(1).max(40)).max(20);

const createBody = z.object({
  name: z.string().trim().min(1).max(100),
  key: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  framework: z.enum(FRAMEWORKS).optional(),
  // Catalog metadata can be set at creation too (mirrors the update body), so the
  // console's New Project modal captures it up front instead of a follow-up edit.
  ownerTeamKey: z.string().trim().min(1).max(100).optional(),
  lifecycle: z.enum(LIFECYCLES).optional(),
  tier: z.enum(TIERS).optional(),
  tags: tagsField.optional(),
});
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    // Set/clear the owning team by its key (null clears ownership).
    ownerTeamKey: z.string().trim().min(1).max(100).nullable().optional(),
    lifecycle: z.enum(LIFECYCLES).nullable().optional(),
    tier: z.enum(TIERS).nullable().optional(),
    // The primary stack/framework preset (null clears it).
    framework: z.enum(FRAMEWORKS).nullable().optional(),
    // The project's icon URL, typically an uploaded asset (null clears it).
    image: z.string().url().max(2048).nullable().optional(),
    tags: tagsField.optional(),
    // The project README, Markdown. Generous cap to bound abuse.
    readme: z.string().max(100_000).nullable().optional(),
  })
  .strict();

const ownerTeamSchema = z.object({ key: z.string(), name: z.string() }).nullable();
const projectSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  ownerTeam: ownerTeamSchema,
  lifecycle: z.string().nullable(),
  tier: z.string().nullable(),
  framework: z.string().nullable(),
  image: z.string().nullable(),
  tags: z.array(z.string()),
  readme: z.string().nullable(),
  createdAt: z.string(),
});
registerComponentSchema("Project", projectSchema);
registerComponentSchema("ProjectResponse", z.object({ project: projectSchema }));
registerComponentSchema("ProjectListResponse", z.array(projectSchema));

function serialize(
  p: typeof projects.$inferSelect,
  ownerTeamKey: string | null,
  ownerTeamName: string | null,
) {
  return {
    key: p.key,
    name: p.name,
    description: p.description,
    ownerTeam: ownerTeamKey && ownerTeamName ? { key: ownerTeamKey, name: ownerTeamName } : null,
    lifecycle: p.lifecycle,
    tier: p.tier,
    framework: p.framework,
    image: p.image,
    tags: p.tags,
    readme: p.readme,
    createdAt: p.createdAt.toISOString(),
  };
}

// --- OpenAPI ----------------------------------------------------------------
const pParams = { org: "The organization slug." };
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/projects",
  summary: "List projects",
  description: "Every project in the organization (the catalog), with catalog metadata. Visible to any member.",
  tags: [TAG],
  auth: true,
  paramDescriptions: pParams,
  responses: { 200: { description: "The organization's projects.", schemaName: "ProjectListResponse" } },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/projects/{key}",
  summary: "Get a project",
  description: "One project by key, with its catalog metadata.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...pParams, key: "The project key." },
  responses: { 200: { description: "The project.", schemaName: "ProjectResponse" }, 404: { description: "No project with that key." } },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/projects",
  summary: "Create a project",
  description: "Create a project by name and key, optionally with a description and stack.",
  tags: [TAG],
  auth: true,
  paramDescriptions: pParams,
  request: { body: createBody },
  responses: {
    201: { description: "The created project.", schemaName: "ProjectResponse" },
    400: { description: "Reserved or invalid key." },
    409: { description: "A project with that key already exists." },
    422: { description: "The submitted data failed validation." },
  },
});
registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/projects/{key}",
  summary: "Update a project",
  description: "Rename a project or edit its catalog metadata (description, owning team, stack, lifecycle, tier, tags).",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...pParams, key: "The project key." },
  request: { body: updateBody },
  responses: {
    200: { description: "The updated project.", schemaName: "ProjectResponse" },
    400: { description: "Unknown owning team." },
    404: { description: "No such project." },
    422: { description: "Validation failed." },
  },
});
registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/projects/{key}",
  summary: "Delete a project",
  description: "Permanently delete a project.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...pParams, key: "The project key." },
  responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such project." } },
});

// A project row joined to its (optional) owning team, for serialization.
const selectWithOwner = {
  project: projects,
  ownerTeamKey: teams.key,
  ownerTeamName: teams.name,
};

// --- List / get (member) ----------------------------------------------------
projects_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx
      .select(selectWithOwner)
      .from(projects)
      .leftJoin(teams, eq(teams.id, projects.ownerTeamId))
      .orderBy(desc(projects.createdAt)),
  );
  return c.json(rows.map((r) => serialize(r.project, r.ownerTeamKey, r.ownerTeamName)));
});

projects_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const row = await withOrg(ctx.orgId, (tx) =>
    tx
      .select(selectWithOwner)
      .from(projects)
      .leftJoin(teams, eq(teams.id, projects.ownerTeamId))
      .where(eq(projects.key, c.req.param("key")))
      .limit(1)
      .then((r) => r[0]),
  );
  if (!row) return jsonError(c, 404, "Project not found.");
  return c.json({ project: serialize(row.project, row.ownerTeamKey, row.ownerTeamName) });
});

// --- Create (org policy: managers always; members when the org opts in) ------
projects_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireProjectCreator(c, ctx);
  if (denied) return denied;

  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { name, key, description, framework, ownerTeamKey, lifecycle, tier, tags } = parsed.data;

  if (!isValidSlug(key) || isReserved(key)) {
    return jsonError(c, 400, "Choose a different project key (letters, numbers, dashes).");
  }

  const result = await withOrg(ctx.orgId, async (tx) => {
    const existing = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.key, key))
      .limit(1)
      .then((r) => r[0]);
    if (existing) return "conflict" as const;

    // Resolve the (optional) owning team by key, so the response carries its name.
    let ownerTeamId: string | null = null;
    let owner: { key: string; name: string } | null = null;
    if (ownerTeamKey) {
      const team = await tx
        .select({ id: teams.id, key: teams.key, name: teams.name })
        .from(teams)
        .where(eq(teams.key, ownerTeamKey))
        .limit(1)
        .then((r) => r[0]);
      if (!team) return "unknown_team" as const;
      ownerTeamId = team.id;
      owner = { key: team.key, name: team.name };
    }

    const [row] = await tx
      .insert(projects)
      .values({
        organizationId: ctx.orgId,
        key,
        name,
        description: description ?? null,
        framework: framework ?? null,
        ownerTeamId,
        lifecycle: lifecycle ?? null,
        tier: tier ?? null,
        tags: tags ?? [],
        createdByUserId: ctx.actorUserId,
      })
      .returning();
    return serialize(row, owner?.key ?? null, owner?.name ?? null);
  });
  if (result === "conflict") return jsonError(c, 409, `A project named "${key}" already exists.`);
  if (result === "unknown_team") return jsonError(c, 400, "That team does not exist.");
  return c.json({ project: result }, 201);
});

// --- Update / delete (manager) ---------------------------------------------
projects_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const parsed = updateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { ownerTeamKey, ...rest } = parsed.data;

  const result = await withOrg(ctx.orgId, async (tx) => {
    // Resolve the owning team by key when the caller is (re)assigning it. `null`
    // clears ownership; omitted leaves it untouched.
    const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (ownerTeamKey !== undefined) {
      if (ownerTeamKey === null) {
        set.ownerTeamId = null;
      } else {
        const team = await tx
          .select({ id: teams.id })
          .from(teams)
          .where(eq(teams.key, ownerTeamKey))
          .limit(1)
          .then((r) => r[0]);
        if (!team) return "unknown_team" as const;
        set.ownerTeamId = team.id;
      }
    }

    const [row] = await tx
      .update(projects)
      .set(set)
      .where(eq(projects.key, c.req.param("key")))
      .returning();
    if (!row) return "not_found" as const;

    const owner = row.ownerTeamId
      ? await tx
          .select({ key: teams.key, name: teams.name })
          .from(teams)
          .where(eq(teams.id, row.ownerTeamId))
          .limit(1)
          .then((r) => r[0])
      : null;
    return serialize(row, owner?.key ?? null, owner?.name ?? null);
  });

  if (result === "unknown_team") return jsonError(c, 400, "That team does not exist.");
  if (result === "not_found") return jsonError(c, 404, "Project not found.");
  return c.json({ project: result });
});

projects_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx
      .delete(projects)
      .where(eq(projects.key, c.req.param("key")))
      .returning({ id: projects.id }),
  );
  if (!row) return jsonError(c, 404, "Project not found.");
  return c.json({ ok: true });
});

// --- Access (GitHub-repository style) ---------------------------------------
// A team is granted a role on a project. The project's OWNING team is always an
// implicit admin and is not stored as a grant. Managing access is owner/admin.
const addAccessBody = z.object({
  teamKey: z.string().trim().min(1).max(100),
  role: z.enum(ACCESS_ROLES),
});
const accessRoleBody = z.object({ role: z.enum(ACCESS_ROLES) }).strict();

const accessGrantSchema = z.object({
  teamKey: z.string(),
  teamName: z.string(),
  role: z.string(),
});
registerComponentSchema("ProjectAccessGrant", accessGrantSchema);
registerComponentSchema(
  "ProjectAccessResponse",
  z.object({
    owner: z.object({ key: z.string(), name: z.string() }).nullable(),
    grants: z.array(accessGrantSchema),
  }),
);

async function projectByKey(tx: TenantTx, key: string) {
  return tx
    .select({ id: projects.id, ownerTeamId: projects.ownerTeamId })
    .from(projects)
    .where(eq(projects.key, key))
    .limit(1)
    .then((r) => r[0] ?? null);
}
async function teamByKey(tx: TenantTx, key: string) {
  return tx
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.key, key))
    .limit(1)
    .then((r) => r[0] ?? null);
}

const aParams = { ...pParams, key: "The project key." };
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/projects/{key}/access",
  summary: "List project access",
  description: "The teams granted access to a project (plus its implicit owner). Visible to any member.",
  tags: [TAG],
  auth: true,
  paramDescriptions: aParams,
  responses: {
    200: { description: "The project's access.", schemaName: "ProjectAccessResponse" },
    404: { description: "No such project." },
  },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/projects/{key}/access",
  summary: "Grant a team access",
  description: "Grant a team a role on a project. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: aParams,
  request: { body: addAccessBody },
  responses: {
    201: { description: "Granted.", schemaName: "DeleteAck" },
    400: { description: "Unknown team, or the team already owns the project." },
    404: { description: "No such project." },
    409: { description: "That team already has access." },
    422: { description: "Validation failed." },
  },
});
registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/projects/{key}/access/{teamKey}",
  summary: "Change a team's access role",
  description: "Change the role a team holds on a project. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...aParams, teamKey: "The team key." },
  request: { body: accessRoleBody },
  responses: {
    200: { description: "Updated.", schemaName: "DeleteAck" },
    404: { description: "No such project or grant." },
    422: { description: "Validation failed." },
  },
});
registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/projects/{key}/access/{teamKey}",
  summary: "Revoke a team's access",
  description: "Remove a team's access to a project. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...aParams, teamKey: "The team key." },
  responses: { 200: { description: "Revoked.", schemaName: "DeleteAck" }, 404: { description: "No such project or grant." } },
});

projects_.get("/:key/access", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const proj = await projectByKey(tx, c.req.param("key"));
    if (!proj) return null;
    const owner = proj.ownerTeamId
      ? await tx
          .select({ key: teams.key, name: teams.name })
          .from(teams)
          .where(eq(teams.id, proj.ownerTeamId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null;
    const grants = await tx
      .select({ teamKey: teams.key, teamName: teams.name, role: projectAccess.role })
      .from(projectAccess)
      .innerJoin(teams, eq(teams.id, projectAccess.teamId))
      .where(eq(projectAccess.projectId, proj.id))
      .orderBy(teams.name);
    return { owner, grants };
  });
  if (!result) return jsonError(c, 404, "Project not found.");
  return c.json(result);
});

projects_.post("/:key/access", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = addAccessBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const result = await withOrg(ctx.orgId, async (tx) => {
    const proj = await projectByKey(tx, c.req.param("key"));
    if (!proj) return "not_found" as const;
    const team = await teamByKey(tx, parsed.data.teamKey);
    if (!team) return "unknown_team" as const;
    if (proj.ownerTeamId === team.id) return "is_owner" as const;
    const existing = await tx
      .select({ id: projectAccess.id })
      .from(projectAccess)
      .where(and(eq(projectAccess.projectId, proj.id), eq(projectAccess.teamId, team.id)))
      .limit(1)
      .then((r) => r[0]);
    if (existing) return "conflict" as const;
    await tx.insert(projectAccess).values({
      organizationId: ctx.orgId,
      projectId: proj.id,
      teamId: team.id,
      role: parsed.data.role,
    });
    return "ok" as const;
  });

  if (result === "not_found") return jsonError(c, 404, "Project not found.");
  if (result === "unknown_team") return jsonError(c, 400, "That team does not exist.");
  if (result === "is_owner")
    return jsonError(c, 400, "That team already owns the project (implicit admin).");
  if (result === "conflict") return jsonError(c, 409, "That team already has access.");
  return c.json({ ok: true }, 201);
});

projects_.patch("/:key/access/:teamKey", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = accessRoleBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const result = await withOrg(ctx.orgId, async (tx) => {
    const proj = await projectByKey(tx, c.req.param("key"));
    if (!proj) return "not_found" as const;
    const team = await teamByKey(tx, c.req.param("teamKey"));
    if (!team) return "no_grant" as const;
    const [row] = await tx
      .update(projectAccess)
      .set({ role: parsed.data.role })
      .where(and(eq(projectAccess.projectId, proj.id), eq(projectAccess.teamId, team.id)))
      .returning({ id: projectAccess.id });
    return row ? ("ok" as const) : ("no_grant" as const);
  });

  if (result === "not_found" || result === "no_grant")
    return jsonError(c, 404, "That team does not have access to the project.");
  return c.json({ ok: true });
});

projects_.delete("/:key/access/:teamKey", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const result = await withOrg(ctx.orgId, async (tx) => {
    const proj = await projectByKey(tx, c.req.param("key"));
    if (!proj) return "not_found" as const;
    const team = await teamByKey(tx, c.req.param("teamKey"));
    if (!team) return "no_grant" as const;
    const [row] = await tx
      .delete(projectAccess)
      .where(and(eq(projectAccess.projectId, proj.id), eq(projectAccess.teamId, team.id)))
      .returning({ id: projectAccess.id });
    return row ? ("ok" as const) : ("no_grant" as const);
  });

  if (result === "not_found" || result === "no_grant")
    return jsonError(c, 404, "That team does not have access to the project.");
  return c.json({ ok: true });
});
