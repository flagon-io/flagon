import { Hono } from "hono";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type TenantTx } from "../../db/tenant.js";
import { projects, projectRelations, teams, projectAccess } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import {
  resolveOrg,
  requireManager,
  requireProjectCreator,
} from "../../lib/org-context.js";
import { isValidSlug } from "../../lib/slug.js";
import { isReserved } from "../../lib/reserved.js";
import { parseRepo } from "../../lib/repo.js";
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
// The component's kind — a catalog classifier (OpsLevel/Cortex style).
const KINDS = ["service", "library", "website", "datastore", "tool", "ml_model", "docs", "other"] as const;
// External link types on a catalog entry (runbooks, dashboards, on-call, docs...).
const LINK_TYPES = ["runbook", "dashboard", "oncall", "docs", "chat", "issues", "other"] as const;
// Directed relation types between projects (the dependency / service-map edges).
const RELATION_TYPES = ["depends_on", "part_of", "related_to"] as const;
// Repository visibility, for a manually-linked repo.
const REPO_VISIBILITY = ["public", "private", "unknown"] as const;
const tagsField = z.array(z.string().trim().min(1).max(40)).max(20);
// Free-form business domains: lowercased + deduped, deliberately not an entity.
const domainsField = z
  .array(z.string().trim().min(1).max(40))
  .max(10)
  .transform((arr) => [...new Set(arr.map((d) => d.toLowerCase()))]);
const linkBody = z.object({
  type: z.enum(LINK_TYPES),
  label: z.string().trim().min(1).max(60).nullable().optional(),
  url: z.string().url().max(2048),
});
const linksField = z.array(linkBody).max(20);
const repoUrlField = z.string().trim().url().max(2048);
const repoBranchField = z.string().trim().min(1).max(120);

const createBody = z.object({
  name: z.string().trim().min(1).max(100),
  key: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  framework: z.enum(FRAMEWORKS).optional(),
  kind: z.enum(KINDS).optional(),
  // Catalog metadata can be set at creation too (mirrors the update body), so the
  // console's New Project modal captures it up front instead of a follow-up edit.
  ownerTeamKey: z.string().trim().min(1).max(100).optional(),
  lifecycle: z.enum(LIFECYCLES).optional(),
  tier: z.enum(TIERS).optional(),
  tags: tagsField.optional(),
  domains: domainsField.optional(),
  links: linksField.optional(),
  // Manual repository linking: paste a URL; provider + name are parsed from it.
  repoUrl: repoUrlField.optional(),
  repoDefaultBranch: repoBranchField.optional(),
  repoVisibility: z.enum(REPO_VISIBILITY).optional(),
});
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    // Set/clear the owning team by its key (null clears ownership).
    ownerTeamKey: z.string().trim().min(1).max(100).nullable().optional(),
    lifecycle: z.enum(LIFECYCLES).nullable().optional(),
    tier: z.enum(TIERS).nullable().optional(),
    kind: z.enum(KINDS).nullable().optional(),
    // The primary stack/framework preset (null clears it).
    framework: z.enum(FRAMEWORKS).nullable().optional(),
    // The project's icon URL, typically an uploaded asset (null clears it).
    image: z.string().url().max(2048).nullable().optional(),
    tags: tagsField.optional(),
    domains: domainsField.optional(),
    links: linksField.optional(),
    // Manual repo link. repoUrl null clears the whole linkage (provider/name too).
    repoUrl: repoUrlField.nullable().optional(),
    repoDefaultBranch: repoBranchField.nullable().optional(),
    repoVisibility: z.enum(REPO_VISIBILITY).nullable().optional(),
    // The project README, Markdown. Generous cap to bound abuse.
    readme: z.string().max(100_000).nullable().optional(),
  })
  .strict();

const ownerTeamSchema = z.object({ key: z.string(), name: z.string() }).nullable();
const linkSchema = z.object({
  type: z.string(),
  label: z.string().nullable(),
  url: z.string(),
});
const repoSchema = z
  .object({
    url: z.string(),
    provider: z.string(),
    name: z.string().nullable(),
    defaultBranch: z.string().nullable(),
    visibility: z.string().nullable(),
  })
  .nullable();
const projectSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  ownerTeam: ownerTeamSchema,
  lifecycle: z.string().nullable(),
  tier: z.string().nullable(),
  kind: z.string().nullable(),
  framework: z.string().nullable(),
  image: z.string().nullable(),
  tags: z.array(z.string()),
  domains: z.array(z.string()),
  links: z.array(linkSchema),
  repo: repoSchema,
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
    kind: p.kind,
    framework: p.framework,
    image: p.image,
    tags: p.tags,
    domains: p.domains,
    links: p.links,
    repo: p.repoUrl
      ? {
          url: p.repoUrl,
          provider: p.repoProvider,
          name: p.repoName,
          defaultBranch: p.repoDefaultBranch,
          visibility: p.repoVisibility,
        }
      : null,
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
  const {
    name,
    key,
    description,
    framework,
    kind,
    ownerTeamKey,
    lifecycle,
    tier,
    tags,
    domains,
    links,
    repoUrl,
    repoDefaultBranch,
    repoVisibility,
  } = parsed.data;

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

    const repo = repoUrl ? parseRepo(repoUrl) : null;
    const [row] = await tx
      .insert(projects)
      .values({
        organizationId: ctx.orgId,
        key,
        name,
        description: description ?? null,
        framework: framework ?? null,
        kind: kind ?? null,
        ownerTeamId,
        lifecycle: lifecycle ?? null,
        tier: tier ?? null,
        tags: tags ?? [],
        domains: domains ?? [],
        links: (links ?? []).map((l) => ({ type: l.type, label: l.label ?? null, url: l.url })),
        repoUrl: repoUrl ?? null,
        repoProvider: repo?.provider ?? null,
        repoName: repo?.name ?? null,
        repoDefaultBranch: repoDefaultBranch ?? null,
        repoVisibility: repoVisibility ?? null,
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
  // links + repoUrl need shaping (label default, provider/name derivation); pull
  // them out of the passthrough set. Everything else maps 1:1 to a column.
  const { ownerTeamKey, links, repoUrl, ...rest } = parsed.data;

  const result = await withOrg(ctx.orgId, async (tx) => {
    // Resolve the owning team by key when the caller is (re)assigning it. `null`
    // clears ownership; omitted leaves it untouched.
    const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (links !== undefined) {
      set.links = links.map((l) => ({ type: l.type, label: l.label ?? null, url: l.url }));
    }
    if (repoUrl !== undefined) {
      // null clears the whole repo linkage; a URL (re)derives provider + name.
      if (repoUrl === null) {
        set.repoUrl = null;
        set.repoProvider = null;
        set.repoName = null;
      } else {
        const repo = parseRepo(repoUrl);
        set.repoUrl = repoUrl;
        set.repoProvider = repo.provider;
        set.repoName = repo.name;
      }
    }
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

// --- Relations (dependency / service-map edges) -----------------------------
// A directed edge, source --type--> target, between two projects. Stored with a
// target_kind so it can point at a package later; only project targets today.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const addRelationBody = z.object({
  type: z.enum(RELATION_TYPES),
  targetKey: z.string().trim().min(1).max(100),
});

const relationSchema = z.object({
  id: z.string(),
  type: z.string(),
  project: z.object({ key: z.string(), name: z.string() }),
});
registerComponentSchema("ProjectRelation", relationSchema);
registerComponentSchema(
  "ProjectRelationsResponse",
  z.object({
    // `outgoing`: this project --type--> the listed project. `incoming`: the
    // listed project --type--> this project. Both name the OTHER project.
    outgoing: z.array(relationSchema),
    incoming: z.array(relationSchema),
  }),
);

const rParams = { ...pParams, key: "The project key." };
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/projects/{key}/relations",
  summary: "List project relations",
  description:
    "The project's dependency edges: `outgoing` (this project points at another) and `incoming` (another points at this). Visible to any member.",
  tags: [TAG],
  auth: true,
  paramDescriptions: rParams,
  responses: {
    200: { description: "The project's relations.", schemaName: "ProjectRelationsResponse" },
    404: { description: "No such project." },
  },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/projects/{key}/relations",
  summary: "Add a project relation",
  description:
    "Add a directed relation (depends_on / part_of / related_to) to another project. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: rParams,
  request: { body: addRelationBody },
  responses: {
    201: { description: "Created.", schemaName: "DeleteAck" },
    400: { description: "Unknown target, or a self relation." },
    404: { description: "No such project." },
    409: { description: "That relation already exists." },
    422: { description: "Validation failed." },
  },
});
registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/projects/{key}/relations/{relationId}",
  summary: "Remove a project relation",
  description:
    "Delete a relation touching this project by id, from either endpoint (outgoing or incoming). Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...rParams, relationId: "The relation id." },
  responses: {
    200: { description: "Removed.", schemaName: "DeleteAck" },
    404: { description: "No such project or relation." },
  },
});

projects_.get("/:key/relations", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const result = await withOrg(ctx.orgId, async (tx) => {
    const proj = await projectByKey(tx, c.req.param("key"));
    if (!proj) return null;
    const cols = {
      id: projectRelations.id,
      type: projectRelations.type,
      key: projects.key,
      name: projects.name,
    };
    // outgoing: join the TARGET project; incoming: join the SOURCE project.
    const outgoing = await tx
      .select(cols)
      .from(projectRelations)
      .innerJoin(projects, eq(projects.id, projectRelations.targetProjectId))
      .where(eq(projectRelations.sourceProjectId, proj.id))
      .orderBy(projectRelations.type, projects.name);
    const incoming = await tx
      .select(cols)
      .from(projectRelations)
      .innerJoin(projects, eq(projects.id, projectRelations.sourceProjectId))
      .where(eq(projectRelations.targetProjectId, proj.id))
      .orderBy(projectRelations.type, projects.name);
    const shape = (rows: typeof outgoing) =>
      rows.map((r) => ({ id: r.id, type: r.type, project: { key: r.key, name: r.name } }));
    return { outgoing: shape(outgoing), incoming: shape(incoming) };
  });
  if (!result) return jsonError(c, 404, "Project not found.");
  return c.json(result);
});

projects_.post("/:key/relations", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = addRelationBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const result = await withOrg(ctx.orgId, async (tx) => {
    const proj = await projectByKey(tx, c.req.param("key"));
    if (!proj) return "not_found" as const;
    const target = await projectByKey(tx, parsed.data.targetKey);
    if (!target) return "unknown_target" as const;
    if (target.id === proj.id) return "self" as const;
    const existing = await tx
      .select({ id: projectRelations.id })
      .from(projectRelations)
      .where(
        and(
          eq(projectRelations.sourceProjectId, proj.id),
          eq(projectRelations.type, parsed.data.type),
          eq(projectRelations.targetProjectId, target.id),
        ),
      )
      .limit(1)
      .then((r) => r[0]);
    if (existing) return "conflict" as const;
    await tx.insert(projectRelations).values({
      organizationId: ctx.orgId,
      sourceProjectId: proj.id,
      type: parsed.data.type,
      targetKind: "project",
      targetProjectId: target.id,
    });
    return "ok" as const;
  });

  if (result === "not_found") return jsonError(c, 404, "Project not found.");
  if (result === "unknown_target") return jsonError(c, 400, "That target project does not exist.");
  if (result === "self") return jsonError(c, 400, "A project cannot relate to itself.");
  if (result === "conflict") return jsonError(c, 409, "That relation already exists.");
  return c.json({ ok: true }, 201);
});

projects_.delete("/:key/relations/:relationId", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const result = await withOrg(ctx.orgId, async (tx) => {
    const proj = await projectByKey(tx, c.req.param("key"));
    if (!proj) return "not_found" as const;
    // Guard a non-uuid id so it 404s instead of erroring on the SQL cast.
    if (!UUID_RE.test(c.req.param("relationId"))) return "not_found" as const;
    // A relationship can be severed from EITHER endpoint: this project as the
    // source (its own outgoing edge) or as the target (an incoming edge). Both
    // sides are in the same org, so a manager on either can remove the link.
    const [row] = await tx
      .delete(projectRelations)
      .where(
        and(
          eq(projectRelations.id, c.req.param("relationId")),
          or(
            eq(projectRelations.sourceProjectId, proj.id),
            eq(projectRelations.targetProjectId, proj.id),
          ),
        ),
      )
      .returning({ id: projectRelations.id });
    return row ? ("ok" as const) : ("not_found" as const);
  });

  if (result === "not_found") return jsonError(c, 404, "Relation not found.");
  return c.json({ ok: true });
});
