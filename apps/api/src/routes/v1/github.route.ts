import { Hono, type Context } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { withOrg } from "../../db/tenant.js";
import { githubInstallations } from "../../db/schema.js";
import { members } from "../../db/auth-tables.js";
import { authContext, getAuth } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import {
  resolveOrg,
  requireManager,
  orgIdBySlug,
  isManagerRole,
} from "../../lib/org-context.js";
import {
  authorizeUrl,
  exchangeUserCode,
  getInstallation,
  installUrl,
  isGithubConfigured,
  isGithubOAuthConfigured,
  listInstallationRepos,
  listUserInstallationIds,
  signConnectState,
  signInstallState,
  verifyConnectState,
  verifyInstallState,
} from "../../lib/github.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * GitHub App connections. An org installs the Flagon GitHub App on one or more
 * GitHub accounts (Vercel-style); a project then picks a repo from an
 * installation. The control plane owns this: the console renders the connect UI
 * and calls these endpoints. We store the installation id + account metadata
 * only (RLS-scoped), never a token — installation tokens are minted on demand.
 *
 * Two mounts:
 *   - `github_`      at /v1/orgs/:org/integrations/github  (org-scoped: list/connect/disconnect/repos)
 *   - `githubSetup_` at /v1/integrations/github            (session-authed setup ingest: the
 *                                              GitHub post-install redirect binds
 *                                              the installation to the org via a
 *                                              signed state, not a path slug)
 */
export const github_ = new Hono();
export const githubSetup_ = new Hono();
github_.use("*", authContext);
githubSetup_.use("*", authContext);

const TAG = "GitHub";

const installationSchema = z.object({
  id: z.string(),
  installationId: z.string(),
  accountLogin: z.string(),
  accountType: z.string(),
  accountAvatarUrl: z.string().nullable(),
  suspended: z.boolean(),
  createdAt: z.string(),
});
registerComponentSchema("GithubInstallation", installationSchema);
registerComponentSchema("GithubInstallationListResponse", z.array(installationSchema));

const repoSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  name: z.string(),
  private: z.boolean(),
  defaultBranch: z.string(),
});
registerComponentSchema("GithubRepoListResponse", z.array(repoSchema));

function serialize(row: typeof githubInstallations.$inferSelect) {
  return {
    id: row.id,
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    accountAvatarUrl: row.accountAvatarUrl,
    suspended: Boolean(row.suspendedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function notConfigured(c: Parameters<typeof jsonError>[0]) {
  return jsonError(
    c,
    503,
    "GitHub is not configured on this instance. Set the GITHUB_APP_* environment variables.",
  );
}

// --- OpenAPI ----------------------------------------------------------------
const ghParams = { org: "The organization slug." };
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/integrations/github/installations",
  summary: "List GitHub connections",
  description: "The GitHub App installations connected to this organization.",
  tags: [TAG],
  auth: true,
  paramDescriptions: ghParams,
  responses: { 200: { description: "Connected installations.", schemaName: "GithubInstallationListResponse" } },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/integrations/github/install-url",
  summary: "Start a GitHub connection",
  description: "A signed URL to install the Flagon GitHub App and bind it to this org.",
  tags: [TAG],
  auth: true,
  paramDescriptions: ghParams,
  responses: { 200: { description: "The install URL." }, 503: { description: "GitHub is not configured." } },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/integrations/github/installations/{id}/repos",
  summary: "List installation repositories",
  description: "Repositories the given installation can access, for the New Project picker.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...ghParams, id: "The installation row id." },
  responses: { 200: { description: "Accessible repositories.", schemaName: "GithubRepoListResponse" }, 404: { description: "No such installation." } },
});
registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/integrations/github/installations/{id}",
  summary: "Disconnect a GitHub connection",
  description: "Forget an installation. (Uninstall the App from GitHub to fully revoke access.)",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...ghParams, id: "The installation row id." },
  responses: { 200: { description: "Disconnected.", schemaName: "DeleteAck" }, 404: { description: "No such installation." } },
});

// --- Org-scoped: list / install-url / repos / disconnect --------------------
github_.get("/installations", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx
      .select()
      .from(githubInstallations)
      .orderBy(desc(githubInstallations.createdAt)),
  );
  return c.json(rows.map(serialize));
});

github_.get("/install-url", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  if (!isGithubConfigured()) return notConfigured(c);
  return c.json({ url: installUrl(signInstallState(ctx.orgSlug)) });
});

github_.get("/installations/:id/repos", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  if (!isGithubConfigured()) return notConfigured(c);

  const row = await withOrg(ctx.orgId, (tx) =>
    tx
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.id, c.req.param("id")))
      .limit(1)
      .then((r) => r[0]),
  );
  if (!row) return jsonError(c, 404, "GitHub connection not found.");
  try {
    return c.json(await listInstallationRepos(row.installationId));
  } catch {
    return jsonError(c, 502, "Could not reach GitHub. Try again shortly.");
  }
});

github_.delete("/installations/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx
      .delete(githubInstallations)
      .where(eq(githubInstallations.id, c.req.param("id")))
      .returning({ id: githubInstallations.id }),
  );
  if (!row) return jsonError(c, 404, "GitHub connection not found.");
  return c.json({ ok: true });
});

// --- Connect (session-authed, two hops: install then prove ownership) -------
// The org is named in a signed state, never a path slug. The caller must be a
// manager of that org AND, crucially, prove on GitHub that they can access the
// installation — otherwise a manager of any org could bind another tenant's
// installation (ids are enumerable) and read its repos.

/** Owner/admin of `orgId`? Returns a 403 Response to short-circuit, or null. */
async function requireOrgManager(
  c: Context,
  orgId: string,
  userId: string,
): Promise<Response | null> {
  const membership = (
    await db
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.organizationId, orgId), eq(members.userId, userId)))
      .limit(1)
  )[0];
  if (!membership || !isManagerRole(membership.role)) {
    return jsonError(c, 403, "You must be an owner or admin to connect GitHub.");
  }
  return null;
}

// Hop 1 result -> begin the ownership check. Takes the install `state` + the
// `installation_id` GitHub handed back, and returns the authorize URL to send
// the browser to. Binding the installation into a fresh signed state here means
// the callback trusts it without re-reading a spoofable query param.
const authorizeBody = z.object({
  state: z.string().min(1),
  installationId: z.string().min(1),
});

registerRoute({
  method: "post",
  path: "/v1/integrations/github/authorize",
  summary: "Begin a GitHub connection",
  description:
    "After the app is installed, start the user-authorization step that proves the caller controls the installation. Returns the GitHub authorize URL to redirect to.",
  tags: [TAG],
  auth: true,
  request: { body: authorizeBody },
  responses: {
    200: { description: "The GitHub authorize URL to redirect the browser to." },
    400: { description: "Invalid or expired install link." },
    403: { description: "Not a manager of the target org." },
    503: { description: "GitHub is not configured." },
  },
});

githubSetup_.post("/authorize", async (c) => {
  const auth = getAuth(c);
  if (!auth || auth.kind !== "user") {
    return jsonError(c, 401, "Sign in to connect GitHub.");
  }
  if (!isGithubConfigured() || !isGithubOAuthConfigured()) return notConfigured(c);

  const parsed = authorizeBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const verified = verifyInstallState(parsed.data.state);
  if (!verified) return jsonError(c, 400, "This connection link is invalid or expired.");

  const orgId = await orgIdBySlug(verified.orgSlug);
  if (!orgId) return jsonError(c, 404, "Organization not found.");
  const denied = await requireOrgManager(c, orgId, auth.user.id);
  if (denied) return denied;

  const state = signConnectState(verified.orgSlug, parsed.data.installationId);
  return c.json({ url: authorizeUrl(state) });
});

// Hop 2 -> complete the connection. The `state` carries (org, installation); the
// `code` proves who authorized. We exchange the code for a short-lived user
// token and require the installation to be one that token can actually access.
const setupBody = z.object({
  state: z.string().min(1),
  code: z.string().min(1),
});

registerRoute({
  method: "post",
  path: "/v1/integrations/github/setup",
  summary: "Complete a GitHub connection",
  description:
    "Finish binding the installation to its org after user authorization. Verifies, via a user access token, that the caller can access the installation before recording it.",
  tags: [TAG],
  auth: true,
  request: { body: setupBody },
  responses: {
    200: { description: "Connected; returns the org slug to redirect to." },
    400: { description: "Invalid or expired state." },
    403: { description: "Not a manager, or no access to that installation on GitHub." },
    503: { description: "GitHub is not configured." },
  },
});

githubSetup_.post("/setup", async (c) => {
  const auth = getAuth(c);
  if (!auth || auth.kind !== "user") {
    return jsonError(c, 401, "Sign in to complete the GitHub connection.");
  }
  if (!isGithubConfigured() || !isGithubOAuthConfigured()) return notConfigured(c);

  const parsed = setupBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const verified = verifyConnectState(parsed.data.state);
  if (!verified) return jsonError(c, 400, "This connection link is invalid or expired.");

  const orgId = await orgIdBySlug(verified.orgSlug);
  if (!orgId) return jsonError(c, 404, "Organization not found.");
  const denied = await requireOrgManager(c, orgId, auth.user.id);
  if (denied) return denied;

  // Proof of ownership: the person who just authorized must actually be able to
  // access this installation. Exchange the one-time code for a short-lived user
  // token, read the installations it can reach, and require ours among them.
  // This is the guard that stops cross-tenant installation binding.
  let ownedIds: string[];
  try {
    const userToken = await exchangeUserCode(parsed.data.code);
    ownedIds = await listUserInstallationIds(userToken);
  } catch {
    return jsonError(c, 502, "Could not verify your GitHub authorization. Try again.");
  }
  if (!ownedIds.includes(verified.installationId)) {
    return jsonError(c, 403, "You do not have access to that installation on GitHub.");
  }

  let info;
  try {
    info = await getInstallation(verified.installationId);
  } catch {
    return jsonError(c, 502, "Could not verify the installation with GitHub.");
  }

  await withOrg(orgId, (tx) =>
    tx
      .insert(githubInstallations)
      .values({
        organizationId: orgId,
        installationId: info.installationId,
        accountLogin: info.accountLogin,
        accountType: info.accountType,
        accountAvatarUrl: info.accountAvatarUrl,
        createdByUserId: auth.user.id,
      })
      .onConflictDoUpdate({
        target: [githubInstallations.organizationId, githubInstallations.installationId],
        set: {
          accountLogin: info.accountLogin,
          accountType: info.accountType,
          accountAvatarUrl: info.accountAvatarUrl,
          suspendedAt: null,
          updatedAt: new Date(),
        },
      }),
  );

  return c.json({ orgSlug: verified.orgSlug });
});
