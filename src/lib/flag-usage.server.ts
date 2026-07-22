import { createHash } from "node:crypto";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  flagExposureSamples,
  flagUsageRollups,
  organizations,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { FLAG_KEY_PATTERN } from "./flags";
import {
  isExposureReason,
  type ExposureReason,
  type FlagUsage,
  type UsagePoint,
  type VariantCount,
} from "./flag-metrics";

/**
 * The database side of per-flag usage (drizzle/0031). Exposures come in
 * pre-aggregated by (flag, variant, reason, hour); this folds them into the
 * hourly rollup, and reads them back for the list and the detail page.
 *
 * Never sees a targeting identity: an exposure entry is a count, not a who.
 */

/** One pre-aggregated exposure line from a client batch. */
export type ExposureEntry = {
  flagKey: string;
  variantKey: string;
  reason: ExposureReason;
  /** Start of the hour the checks fell in (UTC). */
  hour: Date;
  count: number;
};

export type ExposureBatchOutcome =
  { status: "recorded"; entries: number } | { status: "duplicate" };

/** Truncate a moment to the start of its UTC hour. */
export function hourBucket(at: Date): Date {
  const d = new Date(at);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/** A single batch entry cannot claim more checks than this. */
export const MAX_ENTRY_COUNT = 1_000_000_000;
/** How far outside "now" an entry's hour may fall before it is dropped. */
const MAX_FUTURE_MS = 2 * 86_400_000; // clock skew, generously
const MAX_PAST_MS = 400 * 86_400_000; // beyond any retention window
const MAX_VARIANT_LEN = 128; // matches the variant key pattern's bound

/**
 * Validate and normalize a raw batch entry, or null if it is unusable.
 *
 * This is a client-controlled body on an open ingest endpoint, so every field
 * is bounded rather than trusted: the flag key must match the real key shape
 * (which caps its length and rejects garbage, while still accepting the key of a
 * since-deleted flag, so history survives), the variant is length-capped, the
 * reason must be one of the three OFREP reasons, the count is capped so a single
 * entry cannot claim an implausible number of checks, and the hour must sit in a
 * sane window around now so a client cannot write rows at arbitrary timestamps
 * to dodge retention or pollute a series. A bad entry is dropped, not fatal.
 */
export function normalizeEntry(
  raw: unknown,
  now: Date = new Date(),
): ExposureEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const flagKey = typeof e.flag_key === "string" ? e.flag_key : "";
  const variantKey = typeof e.variant === "string" ? e.variant : "";
  const reason = typeof e.reason === "string" ? e.reason : "";
  const count = Number(e.count);
  const hourValue = typeof e.hour === "string" ? Date.parse(e.hour) : NaN;

  if (!FLAG_KEY_PATTERN.test(flagKey)) return null;
  if (!variantKey || variantKey.length > MAX_VARIANT_LEN) return null;
  if (!isExposureReason(reason)) return null;
  if (!Number.isFinite(count) || count <= 0) return null;
  if (!Number.isFinite(hourValue)) return null;

  const nowMs = now.getTime();
  if (hourValue > nowMs + MAX_FUTURE_MS) return null;
  if (hourValue < nowMs - MAX_PAST_MS) return null;

  return {
    flagKey,
    variantKey,
    reason,
    hour: hourBucket(new Date(hourValue)),
    count: Math.min(Math.floor(count), MAX_ENTRY_COUNT),
  };
}

/**
 * Fold a pre-aggregated exposure batch into the hourly rollup, idempotently.
 *
 * The batch id is the dedupe unit (a pre-aggregated batch has no per-event key):
 * its receipt is inserted first, and a conflict means the whole batch is a
 * replay and is dropped without touching a single count. Everything runs in one
 * transaction, so a replay can never apply half a batch.
 */
export async function recordExposureBatch(input: {
  orgId: string;
  batchId: string;
  entries: ExposureEntry[];
}): Promise<ExposureBatchOutcome> {
  if (!input.entries.length) return { status: "recorded", entries: 0 };

  return withTenant(input.orgId, async (tx) => {
    const receipt = (await tx.execute(sql`
      INSERT INTO flag_exposure_batches (organization_id, batch_id)
      VALUES (${input.orgId}::uuid, ${input.batchId})
      ON CONFLICT (organization_id, batch_id) DO NOTHING
      RETURNING id
    `)) as unknown as { id: string }[];

    // Already applied: a redelivered batch must add nothing.
    if (!receipt.length) return { status: "duplicate" as const };

    for (const entry of input.entries) {
      await tx.execute(sql`
        INSERT INTO flag_usage_rollups (
          organization_id, flag_key, hour, variant_key, reason, count
        )
        VALUES (
          ${input.orgId}::uuid, ${entry.flagKey},
          ${entry.hour.toISOString()}::timestamptz,
          ${entry.variantKey}, ${entry.reason}, ${entry.count}
        )
        ON CONFLICT (organization_id, flag_key, hour, variant_key, reason)
        DO UPDATE SET
          count = flag_usage_rollups.count + EXCLUDED.count,
          updated_at = now()
      `);
    }

    return { status: "recorded" as const, entries: input.entries.length };
  });
}

/**
 * Record one exposure from the server itself - the single-flag OFREP endpoint,
 * which knows exactly which flag was evaluated. A real per-flag data source that
 * works before any client adopts the exposure hook, using the same rollup.
 *
 * Best-effort by contract: callers swallow failures so a metering hiccup never
 * fails an evaluation. Not deduped - a genuine evaluation is a genuine check.
 */
export async function recordServerExposure(input: {
  orgId: string;
  flagKey: string;
  variantKey: string;
  reason: ExposureReason;
  at?: Date;
}): Promise<void> {
  const hour = hourBucket(input.at ?? new Date());
  await withTenant(input.orgId, (tx) =>
    tx.execute(sql`
      INSERT INTO flag_usage_rollups (
        organization_id, flag_key, hour, variant_key, reason, count
      )
      VALUES (
        ${input.orgId}::uuid, ${input.flagKey}, ${hour.toISOString()}::timestamptz,
        ${input.variantKey}, ${input.reason}, 1
      )
      ON CONFLICT (organization_id, flag_key, hour, variant_key, reason)
      DO UPDATE SET
        count = flag_usage_rollups.count + 1,
        updated_at = now()
    `),
  );
}

/**
 * Salt for hashing a targeting key before it is stored in a sample. Reuses the
 * app secret rather than adding a config knob; its only job is to make the
 * digest non-reversible without a rainbow table, so the sample stream can say "a
 * user" without ever storing which. Absent (self-host without the secret) means
 * samples carry no key at all - degrade to anonymous, never store the raw value.
 */
function saltedKeyHash(targetingKey: string): string | null {
  const salt = process.env.BETTER_AUTH_SECRET;
  if (!salt) return null;
  return createHash("sha256")
    .update(salt)
    .update("\0")
    .update(targetingKey)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Deterministic 1-in-N sampler for the raw sample stream: hash the identifying
 * tuple and keep one bucket. Deterministic (not random) so the same evaluation
 * is always in or out - no `Math.random`, and a retried request never
 * double-writes a sample.
 */
const SAMPLE_ONE_IN = 10;
function sampled(seed: string): boolean {
  const h = createHash("sha256").update(seed).digest();
  return h[0] % SAMPLE_ONE_IN === 0;
}

/**
 * Record a sampled raw exposure for the detail page's recent-checks stream. Only
 * the server bridge can feed this: client batches are pre-aggregated and carry
 * no per-event data. Sampled and hashed; a diagnostics aid, not an accounting
 * source (the rollups are that). Best-effort, like the exposure it accompanies.
 */
export async function recordExposureSample(input: {
  orgId: string;
  flagKey: string;
  variantKey: string;
  reason: ExposureReason;
  targetingKey: string;
  at?: Date;
}): Promise<void> {
  const at = input.at ?? new Date();
  if (!sampled(`${input.flagKey}:${input.targetingKey}:${at.getUTCHours()}`)) {
    return;
  }
  await withTenant(input.orgId, (tx) =>
    tx.insert(flagExposureSamples).values({
      organizationId: input.orgId,
      flagKey: input.flagKey,
      variantKey: input.variantKey,
      reason: input.reason,
      targetingKeyHash: saltedKeyHash(input.targetingKey),
      occurredAt: at,
    }),
  );
}

export type ExposureSample = {
  variantKey: string;
  reason: ExposureReason;
  targetingKeyHash: string | null;
  occurredAt: string;
};

/** The most recent sampled exposures for a flag, for the detail page stream. */
export async function recentExposureSamples(
  orgId: string,
  flagKey: string,
  limit = 20,
): Promise<ExposureSample[]> {
  const rows = await withTenant(orgId, (tx) =>
    tx
      .select({
        variantKey: flagExposureSamples.variantKey,
        reason: flagExposureSamples.reason,
        targetingKeyHash: flagExposureSamples.targetingKeyHash,
        occurredAt: flagExposureSamples.occurredAt,
      })
      .from(flagExposureSamples)
      .where(
        and(
          eq(flagExposureSamples.organizationId, orgId),
          eq(flagExposureSamples.flagKey, flagKey),
        ),
      )
      .orderBy(desc(flagExposureSamples.occurredAt))
      .limit(limit),
  );
  return rows.map((r) => ({
    variantKey: r.variantKey,
    reason: isExposureReason(r.reason) ? r.reason : "STATIC",
    targetingKeyHash: r.targetingKeyHash,
    occurredAt: r.occurredAt.toISOString(),
  }));
}

/** Empty reason tally, so every FlagUsage has all three keys. */
function emptyReasons(): Record<ExposureReason, number> {
  return { STATIC: 0, TARGETING_MATCH: 0, SPLIT: 0 };
}

type RawRow = {
  flagKey: string;
  variantKey: string;
  reason: string;
  bucket: string;
  count: number;
};

/**
 * Assemble per-flag FlagUsage from grouped rollup rows. Shared by the summary
 * and the detail read so the list and the detail page can never disagree.
 */
function buildUsage(rows: RawRow[]): FlagUsage {
  const byVariant = new Map<string, number>();
  const byReason = emptyReasons();
  const series = new Map<string, number>();
  let total = 0;
  let lastCheckedAt: string | null = null;

  for (const row of rows) {
    const count = Number(row.count);
    total += count;
    byVariant.set(row.variantKey, (byVariant.get(row.variantKey) ?? 0) + count);
    if (isExposureReason(row.reason)) byReason[row.reason] += count;
    series.set(row.bucket, (series.get(row.bucket) ?? 0) + count);
    if (!lastCheckedAt || row.bucket > lastCheckedAt)
      lastCheckedAt = row.bucket;
  }

  const variants: VariantCount[] = [...byVariant.entries()].map(
    ([variantKey, count]) => ({ variantKey, count }),
  );
  const points: UsagePoint[] = [...series.entries()]
    .map(([at, count]) => ({ at, count }))
    .sort((a, b) => a.at.localeCompare(b.at));

  return {
    totalChecks: total,
    // checksPerHour is derived by the caller (it needs `now`); leave 0 here and
    // let the metric functions in flag-metrics.ts compute it from `series`.
    checksPerHour: 0,
    lastCheckedAt,
    byVariant: variants,
    byReason,
    series: points,
  };
}

/**
 * Usage for every flag that has any exposures in the window, keyed by flag_key.
 * One grouped query over the hourly rollup; flags with no exposures are simply
 * absent from the map, which the list renders as "no data yet".
 */
export async function flagUsageSummary(
  orgId: string,
  windowDays = 30,
): Promise<Map<string, FlagUsage>> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = (await withTenant(orgId, (tx) =>
    tx
      .select({
        flagKey: flagUsageRollups.flagKey,
        variantKey: flagUsageRollups.variantKey,
        reason: flagUsageRollups.reason,
        bucket: sql<string>`to_char(${flagUsageRollups.hour}, 'YYYY-MM-DD"T"HH24:00:00"Z"')`,
        count: sql<number>`sum(${flagUsageRollups.count})::bigint`,
      })
      .from(flagUsageRollups)
      .where(
        and(
          eq(flagUsageRollups.organizationId, orgId),
          gte(flagUsageRollups.hour, since),
        ),
      )
      .groupBy(
        flagUsageRollups.flagKey,
        flagUsageRollups.variantKey,
        flagUsageRollups.reason,
        sql`to_char(${flagUsageRollups.hour}, 'YYYY-MM-DD"T"HH24:00:00"Z"')`,
      ),
  )) as RawRow[];

  const byFlag = new Map<string, RawRow[]>();
  for (const row of rows) {
    const list = byFlag.get(row.flagKey) ?? [];
    list.push(row);
    byFlag.set(row.flagKey, list);
  }

  const usage = new Map<string, FlagUsage>();
  for (const [flagKey, flagRows] of byFlag)
    usage.set(flagKey, buildUsage(flagRows));
  return usage;
}

/**
 * Detail for one flag: the hourly series over the window, plus variant and
 * reason breakdowns. Empty (zero, null) when the flag has no exposures yet.
 */
export async function flagUsageDetail(
  orgId: string,
  flagKey: string,
  windowDays = 30,
): Promise<FlagUsage> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = (await withTenant(orgId, (tx) =>
    tx
      .select({
        flagKey: flagUsageRollups.flagKey,
        variantKey: flagUsageRollups.variantKey,
        reason: flagUsageRollups.reason,
        bucket: sql<string>`to_char(${flagUsageRollups.hour}, 'YYYY-MM-DD"T"HH24:00:00"Z"')`,
        count: sql<number>`sum(${flagUsageRollups.count})::bigint`,
      })
      .from(flagUsageRollups)
      .where(
        and(
          eq(flagUsageRollups.organizationId, orgId),
          eq(flagUsageRollups.flagKey, flagKey),
          gte(flagUsageRollups.hour, since),
        ),
      )
      .groupBy(
        flagUsageRollups.flagKey,
        flagUsageRollups.variantKey,
        flagUsageRollups.reason,
        sql`to_char(${flagUsageRollups.hour}, 'YYYY-MM-DD"T"HH24:00:00"Z"')`,
      ),
  )) as RawRow[];

  return buildUsage(rows);
}

/**
 * Whether the org emits exposures at all: does ANY flag have a check in the
 * window. This is what tells staleness whether to trust the traffic signal (see
 * assessFlag) - an org that has not wired up exposure logging has none for every
 * flag, and no flag should be called stale on that basis.
 */
export async function orgEmitsExposures(
  orgId: string,
  windowDays = 30,
): Promise<boolean> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const [row] = (await withTenant(orgId, (tx) =>
    tx
      .select({ any: sql<number>`1` })
      .from(flagUsageRollups)
      .where(
        and(
          eq(flagUsageRollups.organizationId, orgId),
          gte(flagUsageRollups.hour, since),
        ),
      )
      .limit(1),
  )) as { any: number }[];
  return Boolean(row);
}

/** How long hourly rollups and sampled exposures are kept before the sweep. */
export const HOURLY_RETENTION_DAYS = 90;
export const SAMPLE_RETENTION_DAYS = 7;
/** Only recent days are re-folded: older days are settled and never change. */
const FOLD_LOOKBACK_DAYS = 2;

/**
 * Fold recent hourly rollups into flag_usage_daily for one org, so staleness
 * (which reads the daily table) survives hourly retention.
 *
 * Idempotent AND bounded: the daily upsert re-sums from the hourly source, but
 * only over the last FOLD_LOOKBACK_DAYS - older days were already folded and
 * their hourly rows do not change, so re-scanning all 90 days every run would be
 * waste. A re-run lands the same totals rather than double-counting.
 */
export async function foldFlagUsageDaily(orgId: string): Promise<number> {
  const cutoff = new Date(Date.now() - FOLD_LOOKBACK_DAYS * 86_400_000);
  return withTenant(orgId, async (tx) => {
    const folded = (await tx.execute(sql`
      INSERT INTO flag_usage_daily (
        organization_id, flag_key, day, variant_key, count, last_seen_at
      )
      SELECT
        organization_id, flag_key, date_trunc('day', hour)::date AS day,
        variant_key, sum(count) AS count, max(hour) AS last_seen_at
      FROM flag_usage_rollups
      WHERE organization_id = ${orgId}::uuid
        AND hour >= ${cutoff.toISOString()}::timestamptz
      GROUP BY organization_id, flag_key, date_trunc('day', hour)::date, variant_key
      ON CONFLICT (organization_id, flag_key, day, variant_key)
      DO UPDATE SET
        count = EXCLUDED.count,
        last_seen_at = GREATEST(flag_usage_daily.last_seen_at, EXCLUDED.last_seen_at),
        updated_at = now()
      RETURNING id
    `)) as unknown as { id: string }[];
    return folded.length;
  });
}

/**
 * Daily maintenance for the exposure pipeline: fold recent hourly rollups into
 * the daily table, then trim hourly rollups and sampled exposures past their
 * retention. Enumerates orgs from the auth-layer organizations table (readable
 * without a tenant scope), then does the per-tenant work through withTenant.
 *
 * Runs from the daily cleanup cron. A fold over an org with no exposures is a
 * cheap no-op, so iterating every org is acceptable at this cadence.
 */
export async function sweepFlagUsage(): Promise<{
  organizations: number;
  folded: number;
  trimmedHourly: number;
  trimmedSamples: number;
}> {
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  const hourlyCutoff = new Date(
    Date.now() - HOURLY_RETENTION_DAYS * 86_400_000,
  );
  const sampleCutoff = new Date(
    Date.now() - SAMPLE_RETENTION_DAYS * 86_400_000,
  );

  let touched = 0;
  let folded = 0;
  let trimmedHourly = 0;
  let trimmedSamples = 0;

  for (const org of orgs) {
    const foldedRows = await foldFlagUsageDaily(org.id);
    const trims = await withTenant(org.id, async (tx) => {
      const hourly = await tx
        .delete(flagUsageRollups)
        .where(
          and(
            eq(flagUsageRollups.organizationId, org.id),
            lt(flagUsageRollups.hour, hourlyCutoff),
          ),
        )
        .returning({ id: flagUsageRollups.id });
      const samples = await tx
        .delete(flagExposureSamples)
        .where(
          and(
            eq(flagExposureSamples.organizationId, org.id),
            lt(flagExposureSamples.occurredAt, sampleCutoff),
          ),
        )
        .returning({ id: flagExposureSamples.id });
      return { hourly: hourly.length, samples: samples.length };
    });

    if (foldedRows || trims.hourly || trims.samples) touched += 1;
    folded += foldedRows;
    trimmedHourly += trims.hourly;
    trimmedSamples += trims.samples;
  }

  return { organizations: touched, folded, trimmedHourly, trimmedSamples };
}
