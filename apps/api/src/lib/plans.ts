/**
 * Plan constants the API's BetterAuth org hooks need. Duplicated (id + availability
 * + the two helpers) from the source of truth in packages/design/src/plans.ts —
 * the API deliberately does NOT import @flagon/design (it would drag React peers
 * into the Hono bundle). Keep the ids/availability in sync with that file.
 */
export type PlanId = "hobby" | "pro" | "enterprise";

/**
 * How a plan treats usage past its included allowance (mirrors design plans.ts):
 * - "cap": a hard free-tier ceiling; never charged past it (Hobby).
 * - "bill": overage metered and billed at the events rate (Pro).
 * - "contract": trued up against a negotiated envelope (Enterprise).
 * Unknown plans fail safe to "cap" — never surprise-bill.
 */
export type OverageMode = "cap" | "bill" | "contract";

const PLAN_AVAILABILITY: Record<PlanId, boolean> = {
  hobby: true,
  pro: true,
  enterprise: false,
};

/**
 * The monthly included analytics-events allowance and overage mode per plan. These
 * MIRROR the source of truth in packages/design/src/plans.ts (the API deliberately
 * doesn't import @flagon/design); the events overage RATE lives in the meter
 * registry (usage/meters.ts). Keep the numbers in sync with that file.
 */
const PLAN_EVENTS: Record<PlanId, { included: number; overage: OverageMode }> = {
  hobby: { included: 2_000_000, overage: "cap" },
  pro: { included: 5_000_000, overage: "bill" },
  enterprise: { included: 0, overage: "contract" },
};

/** The monthly included events allowance for a plan; 0 for unknown/contracted. */
export function planIncludedEvents(id: string): number {
  return PLAN_EVENTS[id as PlanId]?.included ?? 0;
}

/** How a plan treats events past its allowance; unknown plans fail safe to "cap". */
export function planOverage(id: string): OverageMode {
  return PLAN_EVENTS[id as PlanId]?.overage ?? "cap";
}

export const DEFAULT_PLAN: PlanId = "hobby";

/** A known plan that can be chosen right now (mirrors PLANS.filter(p => p.available)). */
export function isSelectablePlan(value: string): value is PlanId {
  return value in PLAN_AVAILABILITY && PLAN_AVAILABILITY[value as PlanId];
}

/**
 * Whether a plan can invite additional members. Hobby is single-user; teams need
 * Pro or above. (Self-hosting has no user limit and is called out separately.)
 */
export function planAllowsInvites(id: string): boolean {
  return id !== "hobby";
}
