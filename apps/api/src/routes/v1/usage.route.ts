import { Hono } from "hono";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { authContext } from "../../lib/auth-context.js";
import { validationError } from "../../lib/http.js";
import { resolveOrg, orgPlan } from "../../lib/org-context.js";
import { orgUsage } from "../../usage/org-usage.js";
import { eventsAllowanceStatus } from "../../usage/allowance.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Organization usage. Mounted at /v1/orgs/:org/usage.
 *
 * A read-only, org-wide rollup of evaluation usage priced through the meter
 * registry — what powers the console's Usage page (the Vercel-style consumption
 * chart + line-item table + credit burn-down). Any member may read it; there is
 * no write side. Enforcement/billing is separate; this is the picture.
 */
export const usage_ = new Hono();

usage_.use("*", authContext);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const GROUP_BY = ["meter", "flag", "environment", "reason"] as const;

const usageQuery = z.object({
  from: z.string().regex(DAY, "Use a YYYY-MM-DD date.").optional(),
  to: z.string().regex(DAY, "Use a YYYY-MM-DD date.").optional(),
  groupBy: z.enum(GROUP_BY).default("meter"),
});

/** UTC day string `offsetDays` before today (0 = today). */
function dayString(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

const usageResponseSchema = z.object({
  usage: z.object({
    range: z.object({ from: z.string(), to: z.string() }),
    groupBy: z.enum(GROUP_BY),
    currency: z.literal("usd"),
    product: z.string(),
    periods: z.array(z.string()),
    series: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        usage: z.number(),
        chargeCents: z.number(),
        billable: z.boolean(),
        tracked: z.boolean(),
        unit: z.string(),
        pricePerMillionCents: z.number(),
        points: z.array(
          z.object({
            start: z.string(),
            usage: z.number(),
            chargeCents: z.number(),
          }),
        ),
      }),
    ),
    totals: z.object({
      usage: z.number(),
      billableUsage: z.number(),
      chargeCents: z.number(),
    }),
  }),
  // The events-allowance picture for the CURRENT month (independent of the chart
  // range above): what the plan includes, what's used, and whether the org is over.
  // Measured always; ingest is only refused when `entitlement.hardCap` is true.
  entitlement: z.object({
    plan: z.string(),
    overageMode: z.enum(["cap", "bill", "contract"]),
    period: z.object({ from: z.string(), to: z.string() }),
    includedEvents: z.number(),
    usedEvents: z.number(),
    remainingEvents: z.number().nullable(),
    overageEvents: z.number(),
    isOver: z.boolean(),
    overageCents: z.number(),
    hardCap: z.boolean(),
    creditCents: z.number(),
    creditUsedCents: z.number(),
  }),
});

registerComponentSchema("OrgUsageResponse", usageResponseSchema);

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/usage",
  summary: "Get organization usage",
  description:
    "Org-wide usage over a date range, priced through the meter registry, for the usage page. Flag checks are free/unlimited; the billable meter is events. Optional query parameters: `from` and `to` (YYYY-MM-DD, default the trailing 30 days) bound the range; `groupBy` chooses how the returned series are split — `meter` (the default: the billing view, listing the free Flag checks meter and the billable Events meter), or the lenses `flag`, `environment`, and `reason` (OFREP resolution reason) which slice the free checks meter. Daily points are always returned zero-filled across the range; the client rebuckets to weekly/monthly.",
  tags: ["Usage"],
  auth: true,
  paramDescriptions: { org: "The organization slug." },
  responses: {
    200: {
      description: "The organization's usage over the range.",
      schemaName: "OrgUsageResponse",
    },
    422: { description: "The query parameters failed validation." },
  },
});

usage_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const parsed = usageQuery.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
    groupBy: c.req.query("groupBy"),
  });
  if (!parsed.success) return validationError(c, parsed.error);

  // Default to the trailing 30 days (inclusive of today) when unbounded.
  const to = parsed.data.to ?? dayString(0);
  const from = parsed.data.from ?? dayString(29);

  const plan = await orgPlan(ctx.orgId);
  const { usage, entitlement } = await withOrg(ctx.orgId, async (tx) => ({
    usage: await orgUsage(tx, { from, to, groupBy: parsed.data.groupBy }),
    entitlement: await eventsAllowanceStatus(tx, plan),
  }));

  return c.json({ usage, entitlement });
});
