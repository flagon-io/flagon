/**
 * Plan constants the API's BetterAuth org hooks need. Duplicated (id + availability
 * + the two helpers) from the source of truth in packages/design/src/plans.ts —
 * the API deliberately does NOT import @flagon/design (it would drag React peers
 * into the Hono bundle). Keep the ids/availability in sync with that file.
 */
export type PlanId = "hobby" | "pro" | "enterprise";

const PLAN_AVAILABILITY: Record<PlanId, boolean> = {
  hobby: true,
  pro: true,
  enterprise: false,
};

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
