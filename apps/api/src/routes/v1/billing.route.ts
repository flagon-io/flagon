import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { authContext, getAuth } from "../../lib/auth-context.js";
import { jsonError } from "../../lib/http.js";
import { resolveOrg, requireBillingManager } from "../../lib/org-context.js";
import {
  createCheckoutUrl,
  createPortalUrl,
  getBillingOrgById,
  getBillingSummary,
} from "../../lib/billing.js";
import { isBillingConfigured } from "../../lib/stripe.js";
import { statusEntitlesPro } from "../../lib/entitlement.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Billing — start a Pro subscription (Checkout) or manage an existing one
 * (Billing Portal). Mounted under /v1/orgs/:org/billing.
 *
 * Owner/admin only. Unlike the rest of the management surface, these endpoints
 * resolve the org with `allowLocked: true`: a locked (lapsed/unpaid) org must
 * still be able to reach checkout to reactivate. Both return a Stripe URL for
 * the caller to redirect the browser to.
 */
export const billing_ = new Hono();

billing_.use("*", authContext);

const BILLING_TAG = "Billing";
const billingParams = { org: "The organization slug." };

registerComponentSchema(
  "BillingSessionResponse",
  z.object({ url: z.string().url().describe("The Stripe URL to redirect to.") }),
);

registerComponentSchema(
  "BillingSummaryResponse",
  z.object({
    summary: z
      .object({
        status: z.string(),
        currentPeriodEnd: z.string().nullable(),
        cancelAtPeriodEnd: z.boolean(),
        discount: z
          .object({
            name: z.string().nullable(),
            percentOff: z.number().nullable(),
            amountOffCents: z.number().nullable(),
            endsAt: z.string().nullable(),
          })
          .nullable(),
      })
      .nullable()
      .describe("The subscription summary, or null when there is no subscription."),
  }),
);

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/billing/checkout",
  summary: "Start a Pro checkout",
  description:
    "Create a Stripe Checkout session to start the $50/mo Pro subscription (or, when a subscription is already active, a portal session to manage it) and return its URL. Owner/admin only.",
  tags: [BILLING_TAG],
  auth: true,
  paramDescriptions: billingParams,
  responses: {
    200: {
      description: "The Stripe URL to redirect to.",
      schemaName: "BillingSessionResponse",
    },
    403: { description: "Only owners and admins can manage billing." },
    503: { description: "Billing is not configured on this deployment." },
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/billing/summary",
  summary: "Get the billing summary",
  description:
    "The organization's live subscription summary (status, period end, and any active discount) read from Stripe. Any member may read it; it powers the billing page, including the clear indication that a comped organization carrying a 100%-off coupon is not being charged. Returns null when the organization has no Stripe subscription.",
  tags: [BILLING_TAG],
  auth: true,
  paramDescriptions: billingParams,
  responses: {
    200: {
      description: "The subscription summary (or null).",
      schemaName: "BillingSummaryResponse",
    },
    503: { description: "Billing is not configured on this deployment." },
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/billing/portal",
  summary: "Open the billing portal",
  description:
    "Create a Stripe Billing Portal session to manage the subscription (card, invoices, cancel) and return its URL. Owner/admin only.",
  tags: [BILLING_TAG],
  auth: true,
  paramDescriptions: billingParams,
  responses: {
    200: {
      description: "The Stripe URL to redirect to.",
      schemaName: "BillingSessionResponse",
    },
    400: { description: "This organization has no billing account yet." },
    403: { description: "Only owners and admins can manage billing." },
  },
});

/** The acting user's contact details, when the caller is a user (not an org token). */
function actorFrom(c: Context) {
  const auth = getAuth(c);
  return auth?.kind === "user"
    ? { email: auth.user.email, name: auth.user.name }
    : {};
}

billing_.post("/checkout", async (c) => {
  const ctx = await resolveOrg(c, { allowLocked: true, allowBillingWrite: true });
  if (ctx instanceof Response) return ctx;
  const denied = requireBillingManager(c, ctx);
  if (denied) return denied;
  if (!isBillingConfigured())
    return jsonError(c, 503, "Billing is not available on this deployment.");

  const org = await getBillingOrgById(ctx.orgId);
  if (!org) return jsonError(c, 404, "Organization not found.");

  try {
    // Already subscribed? Send them to manage it, not to buy a second one.
    if (org.stripeSubscriptionId && statusEntitlesPro(org.subscriptionStatus)) {
      return c.json({ url: await createPortalUrl(org) });
    }
    return c.json({ url: await createCheckoutUrl(org, actorFrom(c)) });
  } catch (err) {
    console.error("[billing] checkout failed:", err);
    return jsonError(c, 502, "Could not start checkout. Please try again.");
  }
});

billing_.get("/summary", async (c) => {
  // A read any member can make (the billing page shows it). allowLocked so a locked
  // or comped org can still see why. No billing-manager gate — it exposes no secret,
  // just the plan's public-to-the-org state.
  const ctx = await resolveOrg(c, { allowLocked: true });
  if (ctx instanceof Response) return ctx;
  if (!isBillingConfigured())
    return jsonError(c, 503, "Billing is not available on this deployment.");

  const org = await getBillingOrgById(ctx.orgId);
  if (!org) return jsonError(c, 404, "Organization not found.");

  try {
    return c.json({ summary: await getBillingSummary(org) });
  } catch (err) {
    console.error("[billing] summary failed:", err);
    return jsonError(c, 502, "Could not load the billing summary. Please try again.");
  }
});

billing_.post("/portal", async (c) => {
  const ctx = await resolveOrg(c, { allowLocked: true, allowBillingWrite: true });
  if (ctx instanceof Response) return ctx;
  const denied = requireBillingManager(c, ctx);
  if (denied) return denied;

  const org = await getBillingOrgById(ctx.orgId);
  if (!org) return jsonError(c, 404, "Organization not found.");
  if (!org.stripeCustomerId)
    return jsonError(c, 400, "This organization has no billing account yet.");

  try {
    return c.json({ url: await createPortalUrl(org) });
  } catch (err) {
    console.error("[billing] portal failed:", err);
    return jsonError(c, 502, "Could not open the billing portal. Please try again.");
  }
});
