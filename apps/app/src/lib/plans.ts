/**
 * Plans now live in the shared design package so the marketing pricing page and
 * this app's create-organization picker stay in lockstep. Re-exported here so
 * existing `@/lib/plans` imports keep working.
 */
export {
  PLANS,
  DEFAULT_PLAN,
  SELECTABLE_PLANS,
  SELF_HOST_NOTE,
  isPlanId,
  isSelectablePlan,
  planName,
  planAllowsInvites,
} from "@flagon/design/plans";
export type { Plan, PlanId, PlanPrice } from "@flagon/design/plans";
