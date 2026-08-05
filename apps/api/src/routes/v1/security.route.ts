import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { organizations, scimTokens, ssoProviders } from "../../db/auth-tables.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import {
  orgPlan,
  resolveOrg,
  requireManager,
  type OrgContext,
} from "../../lib/org-context.js";
import type { Context } from "hono";
import { hashToken } from "../../lib/token-hash.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Organization security posture: SSO enforcement, required 2FA, the SSO default
 * role, and SCIM provisioning (enable + bearer tokens). Mounted at
 * /v1/orgs/:org/security. Owner/admin only.
 *
 * This is the API home for what the console's Security settings page writes —
 * API-first parity: one implementation, no UI-only writes. The SAML/OIDC
 * provider handshake itself lives on BetterAuth's own /api/auth/sso/* namespace
 * (like the rest of auth, outside /v1); this route owns the posture toggles and
 * the SCIM credential lifecycle.
 */
export const security_ = new Hono();

security_.use("*", authContext);

const TAG = "Security";
const DAY_MS = 24 * 60 * 60 * 1000;

const updateSecurity = z
  .object({
    ssoEnforced: z.boolean().optional(),
    require2fa: z.boolean().optional(),
    // BetterAuth SSO provisioning supports member|admin only.
    ssoDefaultRole: z.enum(["member", "admin"]).optional(),
    scimEnabled: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Provide at least one field to update.",
  });

registerComponentSchema(
  "OrgSecurityResponse",
  z.object({
    ssoEnforced: z.boolean(),
    require2fa: z.boolean(),
    ssoDefaultRole: z.string(),
    scimEnabled: z.boolean(),
  }),
);
registerComponentSchema(
  "ScimTokenListResponse",
  z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      lastFour: z.string(),
      lastUsedAt: z.string().nullable(),
      expiresAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
);
registerComponentSchema(
  "ScimTokenCreatedResponse",
  z.object({
    token: z.object({
      id: z.string(),
      name: z.string(),
      lastFour: z.string(),
      // The plaintext bearer, returned ONCE at creation.
      token: z.string(),
    }),
  }),
);

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/security",
  summary: "Get organization security posture",
  description:
    "Read an organization's SSO enforcement, required-2FA, SSO default role, and SCIM enablement. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  responses: {
    200: { description: "The security posture.", schemaName: "OrgSecurityResponse" },
    403: { description: "Only owners and admins can view these settings." },
  },
});
registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/security",
  summary: "Update organization security posture",
  description:
    "Enable/disable SSO enforcement, required 2FA, SCIM provisioning, and set the SSO default role. Owner/admin only. Enforcing SSO or 2FA blocks non-owner members who do not comply until they do.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  request: { body: updateSecurity },
  responses: {
    200: { description: "The updated posture.", schemaName: "OrgSecurityResponse" },
    403: { description: "Only owners and admins can change these settings." },
    422: { description: "The submitted data failed validation." },
  },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/security/scim-tokens",
  summary: "List SCIM tokens",
  description: "List an organization's active SCIM bearer tokens as masked metadata. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  responses: { 200: { description: "Active SCIM tokens (masked).", schemaName: "ScimTokenListResponse" } },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/security/scim-tokens",
  summary: "Mint a SCIM token",
  description:
    "Create a SCIM bearer token for the organization's identity provider. The plaintext is returned once at creation and never again. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  responses: {
    201: { description: "The token, including its plaintext (returned once).", schemaName: "ScimTokenCreatedResponse" },
    403: { description: "Only owners and admins can mint SCIM tokens." },
    422: { description: "The submitted data failed validation." },
  },
});
registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/security/scim-tokens/{id}",
  summary: "Revoke a SCIM token",
  description: "Revoke one of the organization's SCIM tokens. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: "The organization slug.", id: "The SCIM token id." },
  responses: {
    200: { description: "The token was revoked.", schemaName: "DeleteAck" },
    403: { description: "Only owners and admins can revoke SCIM tokens." },
    404: { description: "No SCIM token with that id." },
  },
});

/**
 * SSO, SCIM, and 2FA enforcement are paid capabilities. This is enforced HERE,
 * server-side — the console hides the controls from Hobby, but the API is the
 * real control plane, so a Hobby org calling the API directly must be refused.
 */
async function requirePaidPlan(
  c: Context,
  ctx: OrgContext,
): Promise<Response | null> {
  if ((await orgPlan(ctx.orgId)) === "hobby") {
    return jsonError(
      c,
      403,
      "Single sign-on, SCIM, and enforcement require a paid plan.",
    );
  }
  return null;
}

/**
 * Arming org-wide access control (require SSO / require 2FA) is an OWNER action.
 * The owner is never gated by enforcement, so restricting the toggles to them
 * makes admin self-lockout impossible: a member who could be blocked can never
 * be the one who turns the block on.
 */
function requireOwner(c: Context, ctx: OrgContext): Response | null {
  if (ctx.role !== "owner") {
    return jsonError(
      c,
      403,
      "Only the organization owner can change SSO or 2FA enforcement.",
    );
  }
  return null;
}

/** Whether the org has at least one configured SSO provider. */
async function hasSsoProvider(orgId: string): Promise<boolean> {
  const rows = await db
    .select({ id: ssoProviders.id })
    .from(ssoProviders)
    .where(eq(ssoProviders.organizationId, orgId))
    .limit(1);
  return rows.length > 0;
}

function postureOf(row: {
  ssoEnforced: boolean;
  require2fa: boolean;
  ssoDefaultRole: string;
  scimEnabled: boolean;
}) {
  return {
    ssoEnforced: row.ssoEnforced,
    require2fa: row.require2fa,
    ssoDefaultRole: row.ssoDefaultRole,
    scimEnabled: row.scimEnabled,
  };
}

security_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const [row] = await db
    .select({
      ssoEnforced: organizations.ssoEnforced,
      require2fa: organizations.require2fa,
      ssoDefaultRole: organizations.ssoDefaultRole,
      scimEnabled: organizations.scimEnabled,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  return c.json(postureOf(row));
});

security_.patch("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const unpaid = await requirePaidPlan(c, ctx);
  if (unpaid) return unpaid;

  const parsed = updateSecurity.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const patch = parsed.data;

  // Changing enforcement (require SSO / require 2FA) is owner-only, so a member
  // who could be blocked can never be the one who arms the block.
  if (patch.ssoEnforced !== undefined || patch.require2fa !== undefined) {
    const notOwner = requireOwner(c, ctx);
    if (notOwner) return notOwner;
  }

  // Never let an org enforce SSO with no provider to sign in against — every
  // non-owner member would be locked out with nowhere to authenticate.
  if (patch.ssoEnforced === true && !(await hasSsoProvider(ctx.orgId))) {
    return jsonError(
      c,
      422,
      "Configure a single sign-on provider before requiring SSO.",
    );
  }

  const [row] = await db
    .update(organizations)
    .set(patch)
    .where(eq(organizations.id, ctx.orgId))
    .returning({
      ssoEnforced: organizations.ssoEnforced,
      require2fa: organizations.require2fa,
      ssoDefaultRole: organizations.ssoDefaultRole,
      scimEnabled: organizations.scimEnabled,
    });
  return c.json(postureOf(row));
});

// --- SCIM tokens -------------------------------------------------------------

const createScimToken = z.object({
  name: z.string().trim().min(1).max(120),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

function serializeScimToken(t: {
  id: string;
  name: string;
  lastFour: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: t.id,
    name: t.name,
    lastFour: t.lastFour,
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    expiresAt: t.expiresAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

async function listActiveScimTokens(orgId: string) {
  return db
    .select({
      id: scimTokens.id,
      name: scimTokens.name,
      lastFour: scimTokens.lastFour,
      lastUsedAt: scimTokens.lastUsedAt,
      expiresAt: scimTokens.expiresAt,
      createdAt: scimTokens.createdAt,
    })
    .from(scimTokens)
    .where(
      and(eq(scimTokens.organizationId, orgId), isNull(scimTokens.revokedAt)),
    )
    .orderBy(desc(scimTokens.createdAt));
}

security_.get("/scim-tokens", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const rows = await listActiveScimTokens(ctx.orgId);
  return c.json(rows.map(serializeScimToken));
});

security_.post("/scim-tokens", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const unpaid = await requirePaidPlan(c, ctx);
  if (unpaid) return unpaid;

  const parsed = createScimToken.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const secret = randomBytes(24).toString("base64url");
  const token = `flagon_scim_${secret}`;
  const [row] = await db
    .insert(scimTokens)
    .values({
      organizationId: ctx.orgId,
      name: parsed.data.name,
      tokenHash: hashToken(token),
      lastFour: token.slice(-4),
      createdByUserId: ctx.actorUserId,
      expiresAt: parsed.data.expiresInDays
        ? new Date(Date.now() + parsed.data.expiresInDays * DAY_MS)
        : null,
    })
    .returning({
      id: scimTokens.id,
      name: scimTokens.name,
      lastFour: scimTokens.lastFour,
    });
  return c.json({ token: { ...row, token } }, 201);
});

security_.delete("/scim-tokens/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const [row] = await db
    .update(scimTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(scimTokens.id, c.req.param("id")),
        eq(scimTokens.organizationId, ctx.orgId),
        isNull(scimTokens.revokedAt),
      ),
    )
    .returning({ id: scimTokens.id });
  if (!row) return jsonError(c, 404, "SCIM token not found.");
  return c.json({ ok: true });
});
