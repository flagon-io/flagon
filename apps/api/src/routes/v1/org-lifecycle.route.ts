import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organizations } from "../../db/auth-tables.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError } from "../../lib/http.js";
import { resolveOrg } from "../../lib/org-context.js";
import { isBillingConfigured } from "../../lib/stripe.js";
import { getBillingOrgById, getSettlement, settleAndCancel } from "../../lib/billing.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Organization lifecycle — the settlement-gated SOFT delete. Mounted under
 * /v1/orgs/:org/lifecycle.
 *
 * Deleting an org must never be an escape hatch from an outstanding balance, and it
 * must never orphan data, so:
 *  - GET /settlement previews what's owed (open invoices + Stripe balance + whether
 *    a live subscription is still accruing usage).
 *  - POST /delete SETTLES first (cancels the subscription, invoicing accrued usage
 *    now, and force-collects open invoices from the card on file), refuses if
 *    anything is still owed, and only then SOFT-deletes (sets deleted_at). A future
 *    purge cron hard-deletes past the retention window.
 *
 * Owner-only, and only a signed-in USER (not an org token) may delete — an org
 * shouldn't be deletable by a credential that lives inside it.
 */
export const orgLifecycle_ = new Hono();
orgLifecycle_.use("*", authContext);

const LIFECYCLE_TAG = "Organization";
const lifecycleParams = { org: "The organization slug." };

const settlementSchema = z.object({
  hasActiveSubscription: z.boolean(),
  openInvoiceCount: z.number(),
  owedCents: z.number(),
  clear: z.boolean(),
  blocked: z.boolean(),
});
registerComponentSchema("Settlement", settlementSchema);
registerComponentSchema("SettlementResponse", z.object({ settlement: settlementSchema }));
registerComponentSchema(
  "DeleteOrgResponse",
  z.object({
    deleted: z.boolean(),
    settlement: settlementSchema.nullable(),
  }),
);

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/lifecycle/settlement",
  summary: "Preview deletion settlement",
  description:
    "What the organization still owes before it can be deleted: open invoices, Stripe customer balance, and whether a live subscription is still accruing usage. Read-only. Owner/admin only.",
  tags: [LIFECYCLE_TAG],
  auth: true,
  paramDescriptions: lifecycleParams,
  responses: {
    200: { description: "The settlement snapshot.", schemaName: "SettlementResponse" },
    403: { description: "Only owners and admins can view this." },
    503: { description: "Billing is not configured on this deployment." },
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/lifecycle/delete",
  summary: "Delete the organization",
  description:
    "Settle the balance (cancel the subscription, invoice accrued usage, collect open invoices) and, only if nothing remains owed, SOFT-delete the organization (retained for the retention window, then purged). Owner only, signed-in user only. Enterprise organizations are managed by our team.",
  tags: [LIFECYCLE_TAG],
  auth: true,
  paramDescriptions: lifecycleParams,
  responses: {
    200: { description: "Deleted, or blocked with the remaining settlement.", schemaName: "DeleteOrgResponse" },
    402: { description: "An outstanding balance must be settled first." },
    403: { description: "Only a signed-in owner can delete, and not enterprise orgs." },
    503: { description: "Billing is not configured on this deployment." },
  },
});

orgLifecycle_.get("/settlement", async (c) => {
  const ctx = await resolveOrg(c, { allowLocked: true });
  if (ctx instanceof Response) return ctx;
  if (ctx.role !== "owner" && ctx.role !== "admin")
    return jsonError(c, 403, "Only owners and admins can view billing settlement.");
  if (!isBillingConfigured())
    return jsonError(c, 503, "Billing is not available on this deployment.");

  const org = await getBillingOrgById(ctx.orgId);
  if (!org) return jsonError(c, 404, "Organization not found.");
  try {
    return c.json({ settlement: await getSettlement(org) });
  } catch (err) {
    console.error("[lifecycle] settlement failed:", err);
    return jsonError(c, 502, "Could not read the billing settlement. Please try again.");
  }
});

orgLifecycle_.post("/delete", async (c) => {
  const ctx = await resolveOrg(c, { allowLocked: true, allowBillingWrite: true });
  if (ctx instanceof Response) return ctx;
  // Owner-only, and only a signed-in user (an org token lives INSIDE the org).
  if (ctx.role !== "owner")
    return jsonError(c, 403, "Only the organization owner can delete it.");
  if (!ctx.actorUserId)
    return jsonError(c, 403, "Deleting an organization requires a signed-in owner, not an API token.");

  const org = await getBillingOrgById(ctx.orgId);
  if (!org) return jsonError(c, 404, "Organization not found.");
  if (org.plan === "enterprise")
    return jsonError(c, 403, "Enterprise organizations are managed by our team. Contact support to close one.");

  try {
    // Settle first: cancel + invoice accrued usage + collect. Skip Stripe entirely
    // when billing isn't configured or the org never had a customer (free Hobby).
    const settlement =
      isBillingConfigured() && org.stripeCustomerId
        ? await settleAndCancel(org)
        : { hasActiveSubscription: false, openInvoiceCount: 0, owedCents: 0, clear: true, blocked: false };

    if (!settlement.clear) {
      return c.json(
        {
          errorCode: "PAYMENT_REQUIRED",
          errorDetails:
            "Settle the outstanding balance in the billing portal before deleting this organization.",
          settlement,
        },
        402,
      );
    }

    // Clear: SOFT-delete. The row stays (retained for churn visibility + the future
    // purge cron); it just vanishes from every access path (deleted_at filter).
    await db
      .update(organizations)
      .set({
        deletedAt: new Date(),
        deletedByUserId: ctx.actorUserId,
        subscriptionStatus: "canceled",
        stripeSubscriptionId: null,
      })
      .where(eq(organizations.id, ctx.orgId));

    return c.json({ deleted: true, settlement });
  } catch (err) {
    console.error("[lifecycle] delete failed:", err);
    return jsonError(c, 502, "Could not delete the organization. Please try again.");
  }
});
