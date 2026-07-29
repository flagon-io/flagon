import { Hono } from "hono";
import { z } from "zod";
import { authContext, getAuth } from "../../lib/auth-context.js";
import { jsonError } from "../../lib/http.js";
import { registerRoute } from "../../openapi/registry.js";
import { personalTokens_ } from "./personal-tokens.route.js";
import { meEmails_ } from "./emails.route.js";

export const me = new Hono();

const userIdentity = z.object({
  kind: z.literal("user"),
  via: z.enum(["token", "cookie"]),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    username: z.string().nullable(),
  }),
});

const orgIdentity = z.object({
  kind: z.literal("organization"),
  via: z.literal("token"),
  organization: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    plan: z.string(),
  }),
});

const meResponse = z.union([userIdentity, orgIdentity]);

registerRoute({
  method: "get",
  path: "/v1/me",
  summary: "Identify the caller",
  description:
    "Resolve the authenticated identity for this request. Send a personal or organization access token as `Authorization: Bearer <token>`, or call from a browser that holds a valid Flagon session cookie. Returns 401 when neither is present or valid.",
  tags: ["Identity"],
  responses: {
    200: { description: "The authenticated identity.", schema: meResponse },
    401: { description: "No valid token or session was supplied." },
  },
});

me.use("*", authContext);

// Personal access tokens + email management (inherit authContext from above).
me.route("/tokens", personalTokens_);
me.route("/emails", meEmails_);

me.get("/", (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return jsonError(
      c,
      401,
      "Authentication required. Send a Bearer access token or a valid session cookie.",
    );
  }
  return c.json(auth);
});
