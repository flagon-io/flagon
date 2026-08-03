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
 * The monthly included analytics-events allowance and overage mode per plan. The
 * `included`/`overage` numbers MIRROR the source of truth in
 * packages/design/src/plans.ts (the API deliberately doesn't import @flagon/design);
 * the events overage RATE lives in the meter registry (usage/meters.ts). Keep those
 * in sync with that file.
 *
 * `hardCap` is an API-only ENFORCEMENT policy (not display, so not mirrored to
 * design): when true, a "cap" plan over its allowance is refused ingest (a 403 on
 * POST /ofrep/v1/exposures); when false the overage is only measured + warned. It
 * replaces the old EVENTS_ENFORCEMENT env flag: the policy lives with the plan, so
 * turning a cap on/off is one reviewed line here, not an ops toggle.
 *
 * Hobby hard-caps: past its 500K included exposures a Hobby org is refused further
 * event ingest (flag EVALUATION is always free and unaffected — only metering stops).
 * The warn-first emails (usage/notify.ts) still fire at 80% and 100%, so the cap never
 * arrives unannounced: an org gets both the heads-up and the ceiling.
 *
 * Calibrated to real feature-flag consumption at Statsig's overage rate. Statsig is
 * $150 Pro / 5M included / 2M free at $0.05/1K, but their 5M gets eaten by analytics +
 * session replays + experiments; our meter is flag exposures + experiment goal events,
 * so 3M of FLAG events is genuinely generous. Pro is $50/mo and INCLUDES ~3M events;
 * overage at $0.05/1K (= Statsig, so we converge at scale and never cross above them).
 * A ~3.6M-flag customer (a real Statsig-account data point) pays ~$80 here vs $150 on
 * Statsig — real margin, still cheaper. Hobby is 1M free (a try-before-Pro wedge).
 * Pro's `included` is CREDIT-DERIVED (drives the usage page + Stripe credit grant, see
 * lib/billing-credits.ts, usage/report.ts), not a hard cap.
 */
const PLAN_EVENTS: Record<
  PlanId,
  { included: number; overage: OverageMode; hardCap: boolean }
> = {
  hobby: { included: 1_000_000, overage: "cap", hardCap: true },
  pro: { included: 3_000_000, overage: "bill", hardCap: false },
  enterprise: { included: 0, overage: "contract", hardCap: false },
};

/**
 * The monthly metered usage credit (cents) a plan carries — the amount granted per
 * period in Stripe (lib/billing-credits.ts) that offsets metered charges. It exactly
 * covers Pro's `included` at the meter rate: 3,000,000 events x $0.05/1K = $150.
 * (Customers never see this dollar figure; the plan is "$50/mo, ~3M events included" —
 * the credit is the internal Stripe mechanism.) Free/contracted plans have no credit.
 */
export const PRO_CREDIT_CENTS = 15000;

/** The monthly usage credit (cents) for a plan; 0 for free/contracted. */
export function planCreditCents(id: string): number {
  return id === "pro" ? PRO_CREDIT_CENTS : 0;
}

/** The monthly included events allowance for a plan; 0 for unknown/contracted. */
export function planIncludedEvents(id: string): number {
  return PLAN_EVENTS[id as PlanId]?.included ?? 0;
}

/** How a plan treats events past its allowance; unknown plans fail safe to "cap". */
export function planOverage(id: string): OverageMode {
  return PLAN_EVENTS[id as PlanId]?.overage ?? "cap";
}

/**
 * Whether a plan HARD-CAPS ingest once over its allowance (refuse events past the
 * ceiling). Unknown plans fail safe to false — never cut off a plan we don't model.
 * Only meaningful together with overage === "cap".
 */
export function planHardCaps(id: string): boolean {
  return PLAN_EVENTS[id as PlanId]?.hardCap ?? false;
}

/**
 * Whether ANY plan hard-caps. A static compile-time fact used to keep the ingest
 * hot path free: while every plan is warn-first (all hardCap:false today), the
 * enforcement check is skipped before it ever loads a plan or touches the DB. The
 * moment a plan's hardCap flips true, enforcement starts consulting per org.
 */
export function anyPlanHardCaps(): boolean {
  return Object.values(PLAN_EVENTS).some((p) => p.hardCap);
}

/**
 * How far back a plan can ANALYZE outcome history (flag impact + experiments), in
 * days. Every exposure/track event is billed at ingest regardless; this only bounds
 * the analysis WINDOW, which keeps stored detail cheap and makes "I need more
 * history" a direct upsell. `null` = unlimited (Enterprise / contract). An org can
 * carry a higher override (a paid add-on) above its plan base — see
 * lib/retention.ts effectiveRetentionDays(). Mirror these with the design source of
 * truth (packages/design/src/plans.ts) so pricing copy matches enforcement.
 */
const PLAN_RETENTION_DAYS: Record<PlanId, number | null> = {
  hobby: 7,
  pro: 30,
  enterprise: null,
};

/** The base analysis-retention window (days) for a plan; null = unlimited. Unknown
 *  plans fail safe to the Hobby window. */
export function planRetentionDays(id: string): number | null {
  return id in PLAN_RETENTION_DAYS
    ? PLAN_RETENTION_DAYS[id as PlanId]
    : PLAN_RETENTION_DAYS.hobby;
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
