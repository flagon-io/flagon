import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { githubInstallations, projects } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import {
  resolveOrg,
  requireManager,
  requireProjectCreator,
} from "../../lib/org-context.js";
import { isValidSlug } from "../../lib/slug.js";
import { isReserved } from "../../lib/reserved.js";
import { listInstallationRepos } from "../../lib/github.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Projects — the org's foundational primitive, each built on a GitHub repo.
 * Mounted at /v1/orgs/:org/projects. Visible org-wide (a member sees the catalog
 * of what exists + a project's overview); creating, editing, and deleting are
 * owner/admin only. Everything runs in withOrg() so RLS enforces tenancy.
 */
export const projects_ = new Hono();
projects_.use("*", authContext);

const TAG = "Projects";

const createBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    key: z.string().trim().min(1).max(100),
    // A repository is optional: a project can start bare and attach one later
    // from settings. When present, both fields must come together.
    githubInstallationId: z.string().uuid().optional(),
    repoId: z.string().min(1).optional(),
  })
  .refine((d) => Boolean(d.githubInstallationId) === Boolean(d.repoId), {
    message: "Provide both a connection and a repository, or neither.",
  });
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    rootDirectory: z.string().trim().max(200).optional(),
  })
  .strict();

const projectSchema = z.object({
  key: z.string(),
  name: z.string(),
  repoFullName: z.string().nullable(),
  repoDefaultBranch: z.string().nullable(),
  repoPrivate: z.boolean(),
  rootDirectory: z.string(),
  framework: z.string().nullable(),
  githubInstallationId: z.string().nullable(),
  createdAt: z.string(),
});
registerComponentSchema("Project", projectSchema);
registerComponentSchema("ProjectResponse", z.object({ project: projectSchema }));
registerComponentSchema("ProjectListResponse", z.array(projectSchema));

function serialize(p: typeof projects.$inferSelect) {
  return {
    key: p.key,
    name: p.name,
    repoFullName: p.repoFullName,
    repoDefaultBranch: p.repoDefaultBranch,
    repoPrivate: p.repoPrivate,
    rootDirectory: p.rootDirectory,
    framework: p.framework,
    githubInstallationId: p.githubInstallationId,
    createdAt: p.createdAt.toISOString(),
  };
}

// --- OpenAPI ----------------------------------------------------------------
const pParams = { org: "The organization slug." };
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/projects",
  summary: "List projects",
  description: "Every project in the organization (the catalog). Visible to any member.",
  tags: [TAG],
  auth: true,
  paramDescriptions: pParams,
  responses: { 200: { description: "The organization's projects.", schemaName: "ProjectListResponse" } },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/projects/{key}",
  summary: "Get a project",
  description: "One project by key.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...pParams, key: "The project key." },
  responses: { 200: { description: "The project.", schemaName: "ProjectResponse" }, 404: { description: "No project with that key." } },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/projects",
  summary: "Create a project",
  description:
    "Create a project, optionally linked to a repository in a connected source provider. Omit the connection and repository to start bare and attach one later.",
  tags: [TAG],
  auth: true,
  paramDescriptions: pParams,
  request: { body: createBody },
  responses: {
    201: { description: "The created project.", schemaName: "ProjectResponse" },
    400: { description: "Unknown connection, inaccessible repo, or reserved/invalid key." },
    409: { description: "A project with that key already exists." },
    422: { description: "The submitted data failed validation." },
  },
});
registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/projects/{key}",
  summary: "Update a project",
  description: "Rename a project or change its root directory.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...pParams, key: "The project key." },
  request: { body: updateBody },
  responses: { 200: { description: "The updated project.", schemaName: "ProjectResponse" }, 404: { description: "No such project." }, 422: { description: "Validation failed." } },
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

// --- List / get (member) ----------------------------------------------------
projects_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx.select().from(projects).orderBy(desc(projects.createdAt)),
  );
  return c.json(rows.map(serialize));
});

projects_.get("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const row = await withOrg(ctx.orgId, (tx) =>
    tx
      .select()
      .from(projects)
      .where(eq(projects.key, c.req.param("key")))
      .limit(1)
      .then((r) => r[0]),
  );
  if (!row) return jsonError(c, 404, "Project not found.");
  return c.json({ project: serialize(row) });
});

// --- Create (org policy: managers always; members when the org opts in) ------
projects_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireProjectCreator(c, ctx);
  if (denied) return denied;

  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { name, key, githubInstallationId, repoId } = parsed.data;

  if (!isValidSlug(key) || isReserved(key)) {
    return jsonError(c, 400, "Choose a different project key (letters, numbers, dashes).");
  }

  // Resolve the repository only if one was chosen. When it is, the installation
  // must belong to this org and the repo must be one it can access — re-fetched
  // from GitHub for authoritative, un-spoofable metadata. Otherwise the project
  // starts bare (repo attached later from settings).
  let repoValues: {
    githubInstallationId: string | null;
    repoId: string | null;
    repoFullName: string | null;
    repoDefaultBranch: string | null;
    repoPrivate: boolean;
  } = {
    githubInstallationId: null,
    repoId: null,
    repoFullName: null,
    repoDefaultBranch: null,
    repoPrivate: false,
  };

  if (githubInstallationId && repoId) {
    const inst = await withOrg(ctx.orgId, (tx) =>
      tx
        .select()
        .from(githubInstallations)
        .where(eq(githubInstallations.id, githubInstallationId))
        .limit(1)
        .then((r) => r[0]),
    );
    if (!inst) return jsonError(c, 400, "That connection was not found.");

    let repo;
    try {
      repo = (await listInstallationRepos(inst.installationId)).find((r) => r.id === repoId);
    } catch {
      return jsonError(c, 502, "Could not reach GitHub. Try again shortly.");
    }
    if (!repo) return jsonError(c, 400, "That repository is not accessible from this connection.");

    repoValues = {
      githubInstallationId: inst.id,
      repoId: repo.id,
      repoFullName: repo.fullName,
      repoDefaultBranch: repo.defaultBranch,
      repoPrivate: repo.private,
    };
  }

  const existing = await withOrg(ctx.orgId, (tx) =>
    tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.key, key))
      .limit(1)
      .then((r) => r[0]),
  );
  if (existing) return jsonError(c, 409, `A project named "${key}" already exists.`);

  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx
      .insert(projects)
      .values({
        organizationId: ctx.orgId,
        key,
        name,
        ...repoValues,
        createdByUserId: ctx.actorUserId,
      })
      .returning(),
  );
  return c.json({ project: serialize(row) }, 201);
});

// --- Update / delete (manager) ---------------------------------------------
projects_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const parsed = updateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(projects.key, c.req.param("key")))
      .returning(),
  );
  if (!row) return jsonError(c, 404, "Project not found.");
  return c.json({ project: serialize(row) });
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
