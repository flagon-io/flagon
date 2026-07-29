import { Hono } from "hono";
import { z } from "zod";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import {
  createAccessToken,
  listOrgTokens,
  revokeOrgToken,
  serializeToken,
} from "../../lib/access-token.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Organization access tokens. Mounted at /v1/orgs/:org/tokens. Shared credentials
 * that act AS the organization (so teams need no service-account users). Minting
 * and revoking are owner/admin only; the plaintext is returned once at creation.
 * This is the API home of the console's org-token settings.
 */
export const orgTokens_ = new Hono();

orgTokens_.use("*", authContext);

const TAG = "Access tokens";
const createToken = z.object({
  name: z.string().trim().min(1).max(120),
  expiresAt: z.string().datetime().optional(),
});

const tokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  lastFour: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
registerComponentSchema("AccessToken", tokenSchema);
registerComponentSchema(
  "AccessTokenCreatedResponse",
  z.object({ token: tokenSchema.extend({ token: z.string().describe("The plaintext token, returned once.") }) }),
);
registerComponentSchema("AccessTokenListResponse", z.array(tokenSchema));

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/tokens",
  summary: "Mint an organization token",
  description:
    "Create an access token that authenticates to the API AS this organization. Owner/admin only. The plaintext token is returned once at creation and never again.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  request: { body: createToken },
  responses: {
    201: { description: "The token, including its plaintext (returned once).", schemaName: "AccessTokenCreatedResponse" },
    403: { description: "Only owners and admins can manage organization tokens." },
    422: { description: "The submitted data failed validation." },
  },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/tokens",
  summary: "List organization tokens",
  description: "List the organization's access tokens as masked metadata. The secret is never returned.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  responses: { 200: { description: "The organization's tokens (masked).", schemaName: "AccessTokenListResponse" } },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/tokens/{id}/revoke",
  summary: "Revoke an organization token",
  description: "Revoke an organization access token so it can no longer authenticate.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: "The organization slug.", id: "The token id." },
  responses: {
    200: { description: "The token was revoked.", schemaName: "DeleteAck" },
    403: { description: "Only owners and admins can manage organization tokens." },
    404: { description: "No token with that id." },
  },
});

orgTokens_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await listOrgTokens(ctx.orgId);
  return c.json(rows.map(serializeToken));
});

orgTokens_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const parsed = createToken.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const created = await createAccessToken({
    type: "organization",
    name: parsed.data.name,
    ownerId: ctx.orgId,
    createdByUserId: ctx.actorUserId ?? ctx.orgId,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  });
  const [row] = await listOrgTokens(ctx.orgId).then((rows) =>
    rows.filter((r) => r.id === created.id),
  );
  return c.json({ token: { ...serializeToken(row), token: created.token } }, 201);
});

orgTokens_.post("/:id/revoke", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const ok = await revokeOrgToken(ctx.orgId, c.req.param("id"));
  if (!ok) return jsonError(c, 404, "Token not found.");
  return c.json({ ok: true });
});
