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
 * Pricing philosophy: the base fee IS a usage credit — $50 buys exactly $50 of events,
 * dollar-for-dollar, no subsidy. The meter rate ($0.03/1K, usage/meters.ts) is set as
 * high as it can go while keeping Flagon's total bill at or under Statsig's at EVERY
 * volume: with a $50 credit the two curves meet exactly at Statsig's 5M bundle edge and
 * Flagon is cheaper on either side. At $0.03/1K, $50 covers ~1,666,667 events; overage
 * past that bills at the same rate. We do NOT hand out more events than the money buys
 * (no "3M for $50") — the value scales with what a customer pays, we just price each
 * event a hair under Statsig so we never lose the comparison. Pro's `included` is
 * CREDIT-DERIVED ($50 credit ÷ $0.03/1K ≈ 1.67M; drives the usage page + Stripe credit
 * grant, see lib/billing-credits.ts, usage/report.ts), not a hard cap. Hobby is 500K
 * free (a try-before-Pro wedge).
 */
const PLAN_EVENTS: Record<
  PlanId,
  { included: number; overage: OverageMode; hardCap: boolean }
> = {
  hobby: { included: 500_000, overage: "cap", hardCap: true },
  // ~1.67M = $50 credit ÷ $0.03/1K. Keep in sync with PRO_CREDIT_CENTS and the meter rate.
  pro: { included: 1_666_667, overage: "bill", hardCap: false },
  enterprise: { included: 0, overage: "contract", hardCap: false },
};

/**
 * The monthly metered usage credit (cents) a plan carries — the amount granted per
 * period in Stripe (lib/billing-credits.ts) that offsets metered charges. It equals
 * the Pro base fee: $50, which at the meter rate ($0.03/1K) covers Pro's ~1,666,667
 * included events. The base fee IS the credit — $50 in, $50 of events out. Free/
 * contracted plans have no credit.
 */
export const PRO_CREDIT_CENTS = 5000;

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

/**
 * The Checks product's billing. Both units are USAGE-METERED and draw down the SAME
 * shared $50 monthly credit as events — there is NO separate free allowance on top of
 * the credit (Stripe credit grants only apply to metered prices, so everything billable
 * is metered):
 *
 *   - UPTIME monitors bill per ACTIVE MONITOR per month ($0.32), metered as a GAUGE
 *     (the sweep reports the current count; Stripe's `last` aggregation bills it). The
 *     $50 credit covers ~156 monitors before any overage — see usage/meters.ts +
 *     lib/billing.ts + scripts/sync-stripe.ts.
 *   - SYNTHETIC checks (browser today, API/multistep later) bill per RUN, metered
 *     through the durable events spine at their own rate (usage/meters.ts).
 *
 * `planIncludedUptimeMonitors` is CREDIT-DERIVED for Pro (how many fit in the $50), a
 * hard FREE cap for Hobby (which has no subscription to meter), and 0/contract for
 * Enterprise. Mirror in packages/design/src/plans.ts.
 */

/** Monthly price of one active uptime monitor, in cents — the committed launch rate,
 *  matching Checkly's ~$0.32/monitor economics. The $50 credit covers the bill; every
 *  monitor draws it down from #1 (no separate free tier). Mirror of METERS uptime rate. */
export const UPTIME_MONITOR_CENTS = 32;

const PLAN_UPTIME_MONITORS: Record<PlanId, { included: number; overage: OverageMode; hardCap: boolean }> = {
  // Hobby has no subscription to meter, so its monitors are genuinely free up to a hard cap.
  hobby: { included: 10, overage: "cap", hardCap: true },
  // Pro: credit-derived — how many monitors the $50 credit covers ($50 / $0.32 ≈ 156).
  pro: { included: Math.floor(PRO_CREDIT_CENTS / UPTIME_MONITOR_CENTS), overage: "bill", hardCap: false },
  enterprise: { included: 0, overage: "contract", hardCap: false },
};

/** The monthly included active-uptime-monitor allowance for a plan (credit-derived for
 *  Pro; a hard free cap for Hobby); 0 for unknown/contracted. */
export function planIncludedUptimeMonitors(id: string): number {
  return PLAN_UPTIME_MONITORS[id as PlanId]?.included ?? 0;
}
/** How a plan treats uptime monitors past its allowance; unknown plans fail safe to "cap". */
export function planUptimeOverage(id: string): OverageMode {
  return PLAN_UPTIME_MONITORS[id as PlanId]?.overage ?? "cap";
}
/** Whether a plan HARD-CAPS the active uptime-monitor count at its included allowance
 *  (Hobby, which can't meter). Unknown plans fail safe to false. */
export function planUptimeHardCaps(id: string): boolean {
  return PLAN_UPTIME_MONITORS[id as PlanId]?.hardCap ?? false;
}

/** Monthly included SYNTHETIC check-run allowance per plan + type. Browser today; API
 *  lands with that adapter. 0 for unknown/contracted. */
const PLAN_SYNTHETIC_RUNS: Record<PlanId, { browser: number; api: number; overage: OverageMode; hardCap: boolean }> = {
  hobby: { browser: 1_000, api: 10_000, overage: "cap", hardCap: true },
  pro: { browser: 12_000, api: 100_000, overage: "bill", hardCap: false },
  enterprise: { browser: 0, api: 0, overage: "contract", hardCap: false },
};

export function planIncludedSyntheticRuns(id: string, kind: "browser" | "api"): number {
  const p = PLAN_SYNTHETIC_RUNS[id as PlanId];
  return p ? p[kind] : 0;
}
export function planSyntheticOverage(id: string): OverageMode {
  return PLAN_SYNTHETIC_RUNS[id as PlanId]?.overage ?? "cap";
}

/**
 * Whether a plan may use CHECK incident automation — a failing check auto-opening
 * an Incident on a linked service. Pro-gated, mirroring how Checkly gates incident
 * automation to Team+. Unknown/Hobby plans cannot.
 */
export function planAllowsIncidentAutomation(id: string): boolean {
  return id === "pro" || id === "enterprise";
}
