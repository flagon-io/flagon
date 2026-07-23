import { eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { organizations, usageEvents } from "../db/schema";
import { withTenant } from "../db/tenant";
import { currentPeriodFor, isoDay } from "./billing-period";
import { getMeter } from "./meters";
import { isPlanId, type PlanId } from "./plans";
import { EVALUATION_METER, counterPeriodStart } from "./quota";
import {
  capForMeter,
  planDefaults,
  type Entitlements,
} from "./entitlements";
import { orgEntitlementContext } from "./entitlements.server";
import { uuidv7 } from "./uuidv7";

/**
 * Durable usage ingest: the write path.
 *
 * usage.server.ts READS the compacted ledger. This module WRITES, and it has
 * exactly two jobs that must both be true or neither:
 *
 *   1. Persist an idempotency receipt, so a retried event never bills twice.
 *   2. Reserve quota, so a capped org cannot outrun its allowance by fanning
 *      requests out across connections.
 *
 * Both happen in ONE transaction. A request rejected for quota rolls back the
 * receipt with it, which is what makes rejection retryable: the caller can
 * upgrade and replay the same event id, and it will be accepted exactly once.
 * Recording the receipt and then failing the quota check would burn the id and
 * silently drop that usage forever.
 *
 * Raw events are folded into usage_rollups by compactUsageEvents(), which is
 * where the money side picks them up. Nothing in the billing path reads this
 * table directly.
 */

/** How a caller supplies its idempotency key, in precedence order. */
const EVENT_ID_HEADERS = [
  "x-flagon-event-id",
  "idempotency-key",
  "x-request-id",
];

export type UsageIngestOutcome =
  /** Written for the first time; quota reserved. */
  | {
      status: "recorded";
      eventId: string;
      used: number;
      allowance: number | null;
    }
  /** This event id was already recorded. Nothing changed, and that is success. */
  | { status: "duplicate"; used: number; allowance: number | null }
  /** Over the plan's hard cap. Neither receipt nor reservation was kept. */
  | { status: "quota_exceeded"; used: number; allowance: number };

/**
 * Sentinel used to unwind the ingest transaction on a quota rejection.
 *
 * Throwing is the mechanism, not an error condition: it is the only way to
 * make Postgres discard the receipt and the counter increment together. It is
 * caught immediately below and never escapes this module.
 */
class QuotaExceeded extends Error {
  constructor(
    readonly used: number,
    readonly allowance: number,
  ) {
    super("quota_exceeded");
  }
}

/**
 * The idempotency key for a request, from the caller when it offers one.
 *
 * OFREP does not define a request id, and inventing a required header would
 * break spec-compliant clients, so this reads headers that are already
 * conventional and IGNORED by clients that do not set them. Compatibility is
 * preserved either way.
 *
 * THE FALLBACK IS DELIBERATE AND WEAKER. With no caller-supplied id we mint a
 * fresh UUIDv7 per request, which makes ingest idempotent per REQUEST but not
 * across client retries: if the client resends a request whose response it
 * never saw, that is two events. The alternative - hashing the request body -
 * would be worse in the other direction, silently collapsing two genuinely
 * distinct evaluations of the same context into one and UNDER-billing. Over
 * counting a rare retry is recoverable; systematically dropping usage is not.
 * Callers that care send the header.
 */
export function eventKeyFrom(request: Request): string {
  for (const header of EVENT_ID_HEADERS) {
    const value = request.headers.get(header)?.trim();
    // Bounded: the key is stored and indexed, so a caller cannot make us
    // persist an unbounded string.
    if (value && value.length <= 200) return value;
  }
  return uuidv7();
}

/**
 * Records one usage event and reserves its quota, atomically.
 *
 * Returns an outcome rather than throwing for the expected cases (replay, over
 * quota); genuine faults still throw.
 */
export async function recordUsageEvent(input: {
  orgId: string;
  meter: string;
  quantity: number;
  eventKey: string;
  plan?: PlanId | string | null;
  projectId?: string | null;
  at?: Date;
}): Promise<UsageIngestOutcome> {
  if (!getMeter(input.meter)) {
    throw new Error(`Unknown meter: ${input.meter}`);
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("Usage quantity must be a positive integer.");
  }

  const context = await quotaContextFor(input.orgId);
  const plan: PlanId =
    input.plan && isPlanId(input.plan) ? input.plan : context.plan;
  // The org's negotiated terms only apply when the caller is talking about the
  // plan the org is actually on. A caller asserting a DIFFERENT plan is asking
  // a hypothetical, and answering it with this org's overrides would apply one
  // customer's bespoke cap to a plan they are not on.
  const entitlements =
    plan === context.plan ? context.entitlements : planDefaults(plan);
  const allowance = capForMeter(entitlements, input.meter);
  const at = input.at ?? new Date();
  const period = context.periodStart;
  const projectId = input.projectId ?? null;

  try {
    return await withTenant(input.orgId, async (tx) => {
      // The receipt. ON CONFLICT DO NOTHING returns no row for a replay,
      // which is how a duplicate is detected without a prior read (and
      // without the race a read-then-write would open).
      const inserted = (await tx.execute(sql`
        INSERT INTO usage_events (
          organization_id, project_id, meter, event_key, quantity, occurred_at, day
        )
        VALUES (
          ${input.orgId}::uuid, ${projectId}::uuid, ${input.meter},
          ${input.eventKey}, ${input.quantity}, ${at.toISOString()}::timestamptz,
          ${isoDay(at)}::date
        )
        ON CONFLICT (organization_id, meter, event_key) DO NOTHING
        RETURNING id
      `)) as unknown as { id: string }[];

      if (!inserted.length) {
        return {
          status: "duplicate" as const,
          used: await readCounter(tx, input.orgId, input.meter, period),
          allowance,
        };
      }

      // The reservation. The upsert takes a row lock on the counter, so
      // concurrent ingests for the same org serialize here and each one sees
      // every committed increment before it - no lost updates, no way to
      // slip past the cap by racing.
      const counted = (await tx.execute(sql`
        INSERT INTO evaluation_counters (organization_id, meter, period_start, used)
        VALUES (${input.orgId}::uuid, ${input.meter}, ${period}::date, ${input.quantity})
        ON CONFLICT (organization_id, meter, period_start) DO UPDATE SET
          used = evaluation_counters.used + EXCLUDED.used,
          updated_at = now()
        RETURNING used
      `)) as unknown as { used: string | number }[];
      const used = Number(counted[0].used);

      // Over the cap: unwind BOTH writes. The receipt must not survive a
      // rejection, or the caller could never retry this event id.
      if (allowance !== null && used > allowance) {
        throw new QuotaExceeded(used - input.quantity, allowance);
      }

      // Flag the org as having work for the compaction sweep. Same
      // transaction, so a committed event is never invisible to the worker.
      // Conditional, so the steady-state cost is an index probe rather than a
      // write on every single evaluation.
      await tx.execute(sql`
        UPDATE organizations SET usage_pending_at = now()
        WHERE id = ${input.orgId}::uuid AND usage_pending_at IS NULL
      `);

      return {
        status: "recorded" as const,
        eventId: inserted[0].id,
        used,
        allowance,
      };
    });
  } catch (error) {
    if (error instanceof QuotaExceeded) {
      return {
        status: "quota_exceeded" as const,
        used: error.used,
        allowance: error.allowance,
      };
    }
    throw error;
  }
}

type TenantTx = Parameters<Parameters<typeof withTenant>[1]>[0];

async function readCounter(
  tx: TenantTx,
  orgId: string,
  meter: string,
  period: string,
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT used FROM evaluation_counters
    WHERE organization_id = ${orgId}::uuid
      AND meter = ${meter}
      AND period_start = ${period}::date
  `)) as unknown as { used: string | number }[];
  return rows.length ? Number(rows[0].used) : 0;
}

/**
 * Short-lived per-process cache of org plans.
 *
 * Every evaluation request needs the plan to know whether a cap applies, and
 * a database round trip per evaluation is the wrong price for a value that
 * changes a few times in an org's entire lifetime.
 *
 * The TTL is what bounds staleness, and it is short on purpose. A stale plan
 * is only ever wrong in two ways, both benign for that window: an org that
 * just upgraded may be capped for up to a minute (and clearPlanCache is called
 * on the webhook that upgrades it, so in practice it is not), and an org that
 * just downgraded stays uncapped for up to a minute, which bills correctly
 * either way because Pro is metered rather than refused.
 *
 * Deliberately NOT invalidated across instances. Serverless means many
 * processes; a distributed invalidation would be far more machinery than a
 * 60-second window justifies.
 */
const PLAN_CACHE_TTL_MS = 60_000;
/**
 * The org's resolved entitlements ride in the cache alongside the plan.
 *
 * They have to: a custom-priced org's cap comes from its own credit and
 * allowances, so enforcement can no longer be answered by the plan id alone.
 * Resolving them per event would put two extra queries on the hottest path in
 * the system, and they change on exactly the same events the plan does - which
 * is why they are cached together and dropped together.
 */
type QuotaContext = {
  plan: PlanId;
  periodStart: string;
  entitlements: Entitlements;
};
const planCache = new Map<string, QuotaContext & { expires: number }>();

/** Drops a cached plan; called wherever a plan transition is applied. */
export function clearPlanCache(orgId?: string): void {
  if (orgId) planCache.delete(orgId);
  else planCache.clear();
}

/**
 * An org's plan and the counter key for the window it is accruing into.
 *
 * Cached together because they change together: a subscription event moves
 * both, and every plan transition already calls clearPlanCache. Caching the
 * period start rather than recomputing it per request keeps the hot path at
 * zero queries in the steady state.
 */
async function quotaContextFor(orgId: string): Promise<QuotaContext> {
  const cached = planCache.get(orgId);
  if (cached && cached.expires > Date.now()) {
    return {
      plan: cached.plan,
      periodStart: cached.periodStart,
      entitlements: cached.entitlements,
    };
  }

  const [org] = await db
    .select({
      plan: organizations.plan,
      currentPeriodStart: organizations.currentPeriodStart,
      currentPeriodEnd: organizations.currentPeriodEnd,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // Fail toward the cap: an org we cannot resolve is not granted unlimited
  // usage on the strength of a failed lookup.
  const plan: PlanId = org && isPlanId(org.plan) ? org.plan : "free";

  // Only resolved for an org that exists. An org we could not read is capped at
  // the plan default rather than given the benefit of an override we never saw.
  const entitlements = org
    ? (await orgEntitlementContext(orgId)).entitlements
    : planDefaults(plan);

  const context: QuotaContext = {
    plan,
    periodStart: counterPeriodStart(currentPeriodFor(org ?? {})),
    entitlements,
  };

  // A missing org is not cached: far more likely a transient lookup failure
  // than a real answer, and caching it would pin the org to the free cap for
  // the whole TTL.
  if (org)
    planCache.set(orgId, {
      ...context,
      expires: Date.now() + PLAN_CACHE_TTL_MS,
    });
  return context;
}

/**
 * What an org has consumed against a meter in the window it is currently
 * accruing into, for display and for the API.
 *
 * Reads the same counter enforcement reads, so a customer checking headroom
 * sees the number that would refuse them rather than one derived from the
 * rollups, which lag by a compaction cycle.
 */
export async function currentUsageCounter(input: {
  orgId: string;
  meter?: string;
}): Promise<{ used: number; periodStart: string }> {
  const { periodStart } = await quotaContextFor(input.orgId);
  const meter = input.meter ?? EVALUATION_METER;
  const used = await withTenant(input.orgId, (tx) =>
    readCounter(tx, input.orgId, meter, periodStart),
  );
  return { used, periodStart };
}

/**
 * Folds an org's pending raw events into usage_rollups.
 *
 * EXACTLY ONCE, by construction. One statement does all three things - claim,
 * aggregate, mark - so there is no interval in which a row is rolled up but
 * not marked, or marked but not rolled up. A worker that crashes mid-flight
 * rolls back to "pending" and the next run redoes it; a worker that runs
 * concurrently with another skips the rows the other has locked
 * (FOR UPDATE SKIP LOCKED) instead of double-counting them.
 *
 * Batched so one enormous backlog cannot hold a transaction (and its locks)
 * open indefinitely; callers loop until it returns 0.
 */
export async function compactUsageEvents(input: {
  orgId: string;
  batchSize?: number;
}): Promise<{ events: number; rollups: number }> {
  const batchSize = input.batchSize ?? 5_000;

  const rows = (await withTenant(input.orgId, (tx) =>
    tx.execute(sql`
      WITH pending AS (
        SELECT id, project_id, meter, day, quantity
        FROM usage_events
        WHERE organization_id = ${input.orgId}::uuid AND compacted_at IS NULL
        -- uuidv7 ids are time-ordered, so this is arrival order.
        ORDER BY id
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      ),
      grouped AS (
        SELECT project_id, meter, day, sum(quantity) AS quantity
        FROM pending
        GROUP BY project_id, meter, day
      ),
      upserted AS (
        INSERT INTO usage_rollups (organization_id, project_id, meter, day, quantity)
        SELECT ${input.orgId}::uuid, project_id, meter, day, quantity FROM grouped
        ON CONFLICT (
          organization_id,
          COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
          meter,
          day
        )
        DO UPDATE SET
          quantity = usage_rollups.quantity + EXCLUDED.quantity,
          updated_at = now()
        RETURNING 1
      ),
      marked AS (
        UPDATE usage_events SET compacted_at = now()
        WHERE id IN (SELECT id FROM pending)
        RETURNING 1
      )
      SELECT
        (SELECT count(*) FROM marked)::int AS events,
        (SELECT count(*) FROM upserted)::int AS rollups
    `),
  )) as unknown as { events: number; rollups: number }[];

  return {
    events: Number(rows[0]?.events ?? 0),
    rollups: Number(rows[0]?.rollups ?? 0),
  };
}

/**
 * Clears an org's sweep marker, but only once it has NO usage events left at
 * all - neither pending compaction nor awaiting retention.
 *
 * "No pending events" would be the tempting condition and it is wrong: it
 * would drop a busy org out of the sweep the moment it drained, and its
 * compacted receipts would then never be purged. An org with any events still
 * has work for a future run, so it stays marked. Steady-traffic orgs are
 * therefore permanently marked, which is correct - they are exactly the orgs
 * the sweep needs to visit.
 */
async function clearMarkerIfDrained(orgId: string): Promise<void> {
  await withTenant(orgId, (tx) =>
    tx.execute(sql`
      UPDATE organizations SET usage_pending_at = NULL
      WHERE id = ${orgId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM usage_events WHERE organization_id = ${orgId}::uuid
        )
    `),
  );
}

/**
 * Compacts every org with pending events, in batches until drained.
 *
 * Driven off the usage_pending_at marker (drizzle/0025), so the sweep costs
 * one indexed lookup plus a transaction per org that ACTUALLY has work,
 * instead of a transaction per org that exists. Idle organizations are free.
 *
 * The marker exists because the query you would otherwise write - "which orgs
 * have uncompacted events" - is a cross-tenant scan of tenant data, which RLS
 * correctly forbids. A boolean on the org row carries the one bit the worker
 * needs without opening usage_events to a cross-tenant read.
 */
export async function sweepUsageEvents(options?: {
  batchSize?: number;
  maxBatchesPerOrg?: number;
  retentionDays?: number;
}): Promise<{
  organizations: number;
  events: number;
  rollups: number;
  purged: number;
}> {
  const maxBatches = options?.maxBatchesPerOrg ?? 20;
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNotNull(organizations.usagePendingAt));

  let touched = 0;
  let events = 0;
  let rollups = 0;
  let purged = 0;
  for (const org of orgs) {
    let orgEvents = 0;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const result = await compactUsageEvents({
        orgId: org.id,
        batchSize: options?.batchSize,
      });
      if (!result.events) break;
      orgEvents += result.events;
      rollups += result.rollups;
    }
    // Purge AFTER compacting, so a receipt is only ever dropped once its
    // usage is safely in the rollup.
    purged += await purgeCompactedEvents({
      orgId: org.id,
      retentionDays: options?.retentionDays,
    });
    await clearMarkerIfDrained(org.id);
    if (orgEvents) {
      touched += 1;
      events += orgEvents;
    }
  }
  return { organizations: touched, events, rollups, purged };
}

/**
 * Drops compacted events past the retention window.
 *
 * Only compacted rows, and only old ones: a pending event is unbilled usage
 * and is never deleted by age. The retention window exists so the receipt
 * keeps deduplicating retries long after the usage itself has been rolled up.
 */
export async function purgeCompactedEvents(input: {
  orgId: string;
  retentionDays?: number;
}): Promise<number> {
  const cutoff = new Date(
    Date.now() - (input.retentionDays ?? 30) * 24 * 60 * 60 * 1000,
  );
  const deleted = await withTenant(input.orgId, (tx) =>
    tx
      .delete(usageEvents)
      .where(
        sql`${eq(usageEvents.organizationId, input.orgId)}
            AND ${isNotNull(usageEvents.compactedAt)}
            AND ${lt(usageEvents.compactedAt, cutoff)}`,
      )
      .returning({ id: usageEvents.id }),
  );
  return deleted.length;
}
