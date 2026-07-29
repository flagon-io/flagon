import { Hono } from "hono";
import { z } from "zod";
import { getAuth } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import {
  createAccessToken,
  listPersonalTokens,
  revokePersonalToken,
  serializeToken,
} from "../../lib/access-token.js";
import { registerRoute } from "../../openapi/registry.js";

/**
 * Personal access tokens. Mounted under /v1/me/tokens (authContext comes from the
 * parent /me mount). A personal token acts AS the signed-in user. Only a USER
 * identity (session cookie or a personal token) may manage these — an org-token
 * caller cannot. The plaintext is returned once at creation.
 */
export const personalTokens_ = new Hono();

const TAG = "Access tokens";
const createToken = z.object({
  name: z.string().trim().min(1).max(120),
  expiresAt: z.string().datetime().optional(),
});

registerRoute({
  method: "post",
  path: "/v1/me/tokens",
  summary: "Mint a personal token",
  description:
    "Create a personal access token that authenticates to the API as you. The plaintext token is returned once at creation and never again.",
  tags: [TAG],
  auth: true,
  request: { body: createToken },
  responses: {
    201: { description: "The token, including its plaintext (returned once).", schemaName: "AccessTokenCreatedResponse" },
    401: { description: "A user session or personal token is required." },
    422: { description: "The submitted data failed validation." },
  },
});
registerRoute({
  method: "get",
  path: "/v1/me/tokens",
  summary: "List personal tokens",
  description: "List your personal access tokens as masked metadata. The secret is never returned.",
  tags: [TAG],
  auth: true,
  responses: { 200: { description: "Your tokens (masked).", schemaName: "AccessTokenListResponse" } },
});
registerRoute({
  method: "post",
  path: "/v1/me/tokens/{id}/revoke",
  summary: "Revoke a personal token",
  description: "Revoke one of your personal access tokens.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { id: "The token id." },
  responses: {
    200: { description: "The token was revoked.", schemaName: "DeleteAck" },
    401: { description: "A user session or personal token is required." },
    404: { description: "No token with that id." },
  },
});

/** Require a USER identity (not an org token). Returns the user id or a 401 Response. */
function requireUserId(c: Parameters<typeof getAuth>[0]): string | Response {
  const auth = getAuth(c);
  if (!auth || auth.kind !== "user") {
    return jsonError(c, 401, "A user session or personal token is required.");
  }
  return auth.user.id;
}

personalTokens_.get("/", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const rows = await listPersonalTokens(userId);
  return c.json({ tokens: rows.map(serializeToken) });
});

personalTokens_.post("/", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;

  const parsed = createToken.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const created = await createAccessToken({
    type: "personal",
    name: parsed.data.name,
    ownerId: userId,
    createdByUserId: userId,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  });
  const [row] = await listPersonalTokens(userId).then((rows) =>
    rows.filter((r) => r.id === created.id),
  );
  return c.json({ token: { ...serializeToken(row), token: created.token } }, 201);
});

personalTokens_.post("/:id/revoke", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const ok = await revokePersonalToken(userId, c.req.param("id"));
  if (!ok) return jsonError(c, 404, "Token not found.");
  return c.json({ ok: true });
});
