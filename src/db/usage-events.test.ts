import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

/**
 * The durable ingest path, end to end against a real database.
 *
 * These are the properties that cost money when they break, so each one is
 * tested against Postgres rather than a mock: a receipt that does not
 * deduplicate over-bills, a reservation that is not atomic lets a capped org
 * run free, a compaction that is not exactly-once double-counts, and a claim
 * that two workers can hold puts the same usage on an invoice twice.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
    process.env.DATABASE_URL_OWNER &&
    process.env.BETTER_AUTH_SECRET,
);

const HOBBY_LIMIT = 10_000_000;
const METER = "flags.evaluations";
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe.skipIf(!canRun)("durable usage ingest", () => {
  const stamp = Date.now();
  const hobbySlug = `ingest-hobby-${stamp}`;
  const proSlug = `ingest-pro-${stamp}`;
  const otherSlug = `ingest-other-${stamp}`;

  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let hobbyOrg = "";
  let proOrg = "";
  let otherOrg = "";

  beforeAll(async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 5 });
    ({ closePool } = await import("@/db/client"));

    // Provisioning an org is a privileged operation (see tenancy.test.ts).
    const [hobby] = await owner`
      INSERT INTO organizations (slug, name, plan)
      VALUES (${hobbySlug}, 'Hobby Org', 'free') RETURNING id
    `;
    const [pro] = await owner`
      INSERT INTO organizations (slug, name, plan)
      VALUES (${proSlug}, 'Pro Org', 'pro') RETURNING id
    `;
    const [other] = await owner`
      INSERT INTO organizations (slug, name, plan)
      VALUES (${otherSlug}, 'Other Org', 'pro') RETURNING id
    `;
    hobbyOrg = hobby.id as string;
    proOrg = pro.id as string;
    otherOrg = other.id as string;
  });

  afterAll(async () => {
    if (owner) {
      await owner`
        DELETE FROM organizations
        WHERE slug IN (${hobbySlug}, ${proSlug}, ${otherSlug})
      `;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  /**
   * The counter key these orgs accrue into. Counters follow the org's own
   * billing window (drizzle/0027); a test org has no subscription, so its
   * window is the current calendar month. Note this is keyed on NOW, not on
   * an event's occurredAt: quota is a question about the period you are in.
   */
  const PERIOD = (() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  })();

  /** Seeds the counter directly, so a cap can be probed without actually
   *  ingesting ten million evaluations. */
  const seedCounter = async (orgId: string, used: number, meter = METER) => {
    await owner`
      INSERT INTO evaluation_counters (organization_id, meter, period_start, used)
      VALUES (${orgId}::uuid, ${meter}, ${PERIOD}::date, ${used})
      ON CONFLICT (organization_id, meter, period_start)
      DO UPDATE SET used = EXCLUDED.used
    `;
  };

  const counterOf = async (orgId: string, meter = METER) => {
    const rows = await owner`
      SELECT used::bigint AS used FROM evaluation_counters
      WHERE organization_id = ${orgId}::uuid AND meter = ${meter}
        AND period_start = ${PERIOD}::date
    `;
    return rows.length ? Number(rows[0].used) : 0;
  };

  const eventsOf = async (orgId: string) => {
    const rows = await owner`
      SELECT count(*)::int AS count FROM usage_events
      WHERE organization_id = ${orgId}::uuid
    `;
    return rows[0].count as number;
  };

  it("records an event once and treats the replay as a no-op", async () => {
    const { recordUsageEvent } = await import("@/lib/usage-events.server");
    const at = day("2026-05-04");
    const first = await recordUsageEvent({
      orgId: proOrg,
      meter: METER,
      quantity: 40,
      eventKey: "evt-replay",
      at,
    });
    expect(first.status).toBe("recorded");

    // The same event id, three more times, including concurrently: the
    // receipt is the unique index, so this is settled by Postgres rather than
    // by a read-then-write that could interleave.
    const replays = await Promise.all([
      recordUsageEvent({ orgId: proOrg, meter: METER, quantity: 40, eventKey: "evt-replay", at }),
      recordUsageEvent({ orgId: proOrg, meter: METER, quantity: 40, eventKey: "evt-replay", at }),
      recordUsageEvent({ orgId: proOrg, meter: METER, quantity: 999, eventKey: "evt-replay", at }),
    ]);
    for (const replay of replays) expect(replay.status).toBe("duplicate");

    // Neither the raw event nor the reservation moved.
    expect(await eventsOf(proOrg)).toBe(1);
    expect(await counterOf(proOrg)).toBe(40);

    // A DIFFERENT id for the same work is genuinely new usage, and counted.
    const distinct = await recordUsageEvent({
      orgId: proOrg,
      meter: METER,
      quantity: 40,
      eventKey: "evt-distinct",
      at,
    });
    expect(distinct.status).toBe("recorded");
    expect(await counterOf(proOrg)).toBe(80);
  });

  it("admits usage up to the Hobby cap and refuses the unit past it", async () => {
    const { recordUsageEvent } = await import("@/lib/usage-events.server");
    const at = day("2026-05-04");
    await seedCounter(hobbyOrg, HOBBY_LIMIT - 1);

    // Landing exactly ON the allowance is allowed.
    const atLimit = await recordUsageEvent({
      orgId: hobbyOrg, meter: METER, quantity: 1, eventKey: "evt-at-limit", at,
    });
    expect(atLimit.status).toBe("recorded");
    expect(await counterOf(hobbyOrg)).toBe(HOBBY_LIMIT);

    // One past it is not.
    const over = await recordUsageEvent({
      orgId: hobbyOrg, meter: METER, quantity: 1, eventKey: "evt-over", at,
    });
    expect(over.status).toBe("quota_exceeded");
    if (over.status === "quota_exceeded") {
      expect(over.allowance).toBe(HOBBY_LIMIT);
      expect(over.used).toBe(HOBBY_LIMIT);
    }

    // THE INVARIANT: a rejected request leaves NEITHER a receipt NOR a
    // reservation. If the receipt survived, this event id could never be
    // retried and that usage would be lost forever.
    expect(await counterOf(hobbyOrg)).toBe(HOBBY_LIMIT);
    const receipts = await owner`
      SELECT count(*)::int AS count FROM usage_events
      WHERE organization_id = ${hobbyOrg}::uuid AND event_key = 'evt-over'
    `;
    expect(receipts[0].count).toBe(0);

    // Which means the same id is accepted once there is room again.
    await seedCounter(hobbyOrg, HOBBY_LIMIT - 1);
    const retried = await recordUsageEvent({
      orgId: hobbyOrg, meter: METER, quantity: 1, eventKey: "evt-over", at,
    });
    expect(retried.status).toBe("recorded");
  });

  it("rejects a batch that would straddle the cap, whole", async () => {
    const { recordUsageEvent } = await import("@/lib/usage-events.server");
    const at = day("2026-06-04");
    await seedCounter(hobbyOrg, HOBBY_LIMIT - 4);

    const straddle = await recordUsageEvent({
      orgId: hobbyOrg, meter: METER, quantity: 10, eventKey: "evt-straddle", at,
    });
    expect(straddle.status).toBe("quota_exceeded");
    // Not partially served: the counter is untouched, so the receipt and the
    // response can never describe different amounts of work.
    expect(await counterOf(hobbyOrg)).toBe(HOBBY_LIMIT - 4);
  });

  it("never lets concurrent requests overrun the cap", async () => {
    const { recordUsageEvent } = await import("@/lib/usage-events.server");
    const at = day("2026-07-04");
    const headroom = 5;
    await seedCounter(hobbyOrg, HOBBY_LIMIT - headroom);

    // Ten distinct events, all in flight at once, with room for five. A
    // read-then-write reservation would let most of them through; the upsert's
    // row lock serializes them so exactly the ones that fit are admitted.
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        recordUsageEvent({
          orgId: hobbyOrg,
          meter: METER,
          quantity: 1,
          eventKey: `evt-race-${index}`,
          at,
        }),
      ),
    );

    const recorded = outcomes.filter((o) => o.status === "recorded").length;
    const rejected = outcomes.filter((o) => o.status === "quota_exceeded").length;
    expect(recorded).toBe(headroom);
    expect(rejected).toBe(10 - headroom);
    expect(await counterOf(hobbyOrg)).toBe(HOBBY_LIMIT);

    // And only the admitted ones left receipts behind.
    const receipts = await owner`
      SELECT count(*)::int AS count FROM usage_events
      WHERE organization_id = ${hobbyOrg}::uuid AND event_key LIKE 'evt-race-%'
    `;
    expect(receipts[0].count).toBe(headroom);
  });

  it("compacts into rollups exactly once, however many times it runs", async () => {
    const { recordUsageEvent, compactUsageEvents } = await import(
      "@/lib/usage-events.server"
    );
    const at = day("2026-08-09");

    const [project] = await owner`
      INSERT INTO projects (organization_id, slug, name)
      VALUES (${otherOrg}, 'compact', 'Compact') RETURNING id
    `;
    const projectId = project.id as string;

    // Three events on one day: two org-level, one project-scoped. They should
    // fold into two rollup rows, not three.
    await recordUsageEvent({ orgId: otherOrg, meter: METER, quantity: 100, eventKey: "c1", at });
    await recordUsageEvent({ orgId: otherOrg, meter: METER, quantity: 250, eventKey: "c2", at });
    await recordUsageEvent({
      orgId: otherOrg, meter: METER, quantity: 70, eventKey: "c3", at, projectId,
    });

    const first = await compactUsageEvents({ orgId: otherOrg });
    expect(first.events).toBe(3);
    expect(first.rollups).toBe(2);

    const totalOf = async () => {
      const rows = await owner`
        SELECT COALESCE(sum(quantity), 0)::bigint AS total FROM usage_rollups
        WHERE organization_id = ${otherOrg}::uuid
      `;
      return Number(rows[0].total);
    };
    expect(await totalOf()).toBe(420);

    // Re-running is the crash-and-retry case: already-compacted rows are not
    // pending, so there is nothing to fold in again.
    const second = await compactUsageEvents({ orgId: otherOrg });
    expect(second.events).toBe(0);
    expect(await totalOf()).toBe(420);

    // Concurrent workers do not double-count either: FOR UPDATE SKIP LOCKED
    // means the second one takes only rows the first has not claimed.
    await recordUsageEvent({ orgId: otherOrg, meter: METER, quantity: 33, eventKey: "c4", at });
    await Promise.all([
      compactUsageEvents({ orgId: otherOrg }),
      compactUsageEvents({ orgId: otherOrg }),
      compactUsageEvents({ orgId: otherOrg }),
    ]);
    expect(await totalOf()).toBe(453);

    // Nothing is left pending.
    const pending = await owner`
      SELECT count(*)::int AS count FROM usage_events
      WHERE organization_id = ${otherOrg}::uuid AND compacted_at IS NULL
    `;
    expect(pending[0].count).toBe(0);
  });

  it("meters syncs separately, under their own ceiling", async () => {
    const { recordUsageEvent } = await import("@/lib/usage-events.server");
    const SYNC = "flags.syncs";
    const at = day("2026-11-02");

    // One request can produce an evaluation event AND a sync event under the
    // SAME key: receipts are scoped per meter, so the two do not collide.
    const shared = "req-shared-1";
    expect((await recordUsageEvent({ orgId: proOrg, meter: METER, quantity: 12, eventKey: shared, at })).status).toBe("recorded");
    expect((await recordUsageEvent({ orgId: proOrg, meter: SYNC, quantity: 1, eventKey: shared, at })).status).toBe("recorded");

    // ...and a retry of that request deduplicates against both.
    expect((await recordUsageEvent({ orgId: proOrg, meter: METER, quantity: 12, eventKey: shared, at })).status).toBe("duplicate");
    expect((await recordUsageEvent({ orgId: proOrg, meter: SYNC, quantity: 1, eventKey: shared, at })).status).toBe("duplicate");
    expect(await counterOf(proOrg, SYNC)).toBe(1);

    // Pro is never refused syncs: its 50M is an allowance to be billed past,
    // not a ceiling.
    await seedCounter(proOrg, 200_000_000, SYNC);
    expect((await recordUsageEvent({ orgId: proOrg, meter: SYNC, quantity: 1, eventKey: "pro-sync-over", at })).status).toBe("recorded");

    // Hobby IS refused, at its own 5M ceiling and independently of its
    // evaluation counter: a polling fleet burns syncs without evaluating.
    await seedCounter(hobbyOrg, 5_000_000, SYNC);
    await seedCounter(hobbyOrg, 0);
    const refused = await recordUsageEvent({ orgId: hobbyOrg, meter: SYNC, quantity: 1, eventKey: "hobby-sync-over", at });
    expect(refused.status).toBe("quota_exceeded");
    if (refused.status === "quota_exceeded") expect(refused.allowance).toBe(5_000_000);
    // Evaluations still work: the two ceilings are independent.
    expect((await recordUsageEvent({ orgId: hobbyOrg, meter: METER, quantity: 1, eventKey: "hobby-eval-ok", at })).status).toBe("recorded");
  });

  it("marks orgs with pending work and only sweeps those", async () => {
    const { recordUsageEvent, sweepUsageEvents } = await import(
      "@/lib/usage-events.server"
    );
    const at = day("2026-10-05");

    const markerOf = async (orgId: string) => {
      const rows = await owner`
        SELECT usage_pending_at FROM organizations WHERE id = ${orgId}::uuid
      `;
      return rows[0].usage_pending_at as Date | null;
    };

    // Recording sets the marker, in the same transaction as the receipt.
    await recordUsageEvent({
      orgId: proOrg, meter: METER, quantity: 7, eventKey: "mark-1", at,
    });
    expect(await markerOf(proOrg)).not.toBeNull();

    // The sweep compacts it, but the marker STAYS set: compacted receipts are
    // still work, they have a retention purge waiting for them. Clearing here
    // would drop the org out of the sweep and strand those rows forever.
    await sweepUsageEvents();
    expect(await markerOf(proOrg)).not.toBeNull();
    const stillPending = await owner`
      SELECT count(*)::int AS count FROM usage_events
      WHERE organization_id = ${proOrg}::uuid AND compacted_at IS NULL
    `;
    expect(stillPending[0].count).toBe(0);

    // Once retention removes the last event, the org genuinely has no work and
    // drops out of the sweep.
    await owner`
      UPDATE usage_events SET compacted_at = now() - interval '90 days'
      WHERE organization_id = ${proOrg}::uuid AND compacted_at IS NOT NULL
    `;
    await sweepUsageEvents({ retentionDays: 30 });
    expect(await markerOf(proOrg)).toBeNull();

    // An unmarked org is not visited at all, which is the whole point: idle
    // organizations cost the sweep nothing.
    const swept = await sweepUsageEvents();
    expect(swept.events).toBe(0);
  });

  it("keeps events, counters, and claims behind tenant isolation", async () => {
    const { db } = await import("@/db/client");
    const { usageEvents, evaluationCounters, billingInvoiceClaims } =
      await import("@/db/schema");

    // No tenant GUC, no rows - on every one of the new tables.
    expect(await db.select().from(usageEvents)).toHaveLength(0);
    expect(await db.select().from(evaluationCounters)).toHaveLength(0);
    expect(await db.select().from(billingInvoiceClaims)).toHaveLength(0);

    // And one tenant's context never reaches another's rows.
    const { withTenant } = await import("@/db/tenant");
    const seen = await withTenant(hobbyOrg, (tx) => tx.select().from(usageEvents));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((row) => row.organizationId === hobbyOrg)).toBe(true);
  });

  it("lets exactly one claimant invoice, and makes completion terminal", async () => {
    const { claimInvoice, completeInvoiceClaim, releaseInvoiceClaim } =
      await import("@/lib/invoice-claims.server");
    const invoiceId = `in_test_${stamp}`;

    // Five concurrent deliveries of the same invoice.created. Exactly one wins
    // the lease; the rest are told to stand down.
    const claims = await Promise.all(
      Array.from({ length: 5 }, () =>
        claimInvoice({ orgId: proOrg, stripeInvoiceId: invoiceId }),
      ),
    );
    const winners = claims.filter((claim) => claim !== null);
    expect(winners).toHaveLength(1);

    // A live lease keeps everyone else out.
    expect(await claimInvoice({ orgId: proOrg, stripeInvoiceId: invoiceId })).toBeNull();

    // Completion is terminal: no later delivery can bill this invoice again.
    await completeInvoiceClaim({ orgId: proOrg, claimId: winners[0]!.id });
    expect(await claimInvoice({ orgId: proOrg, stripeInvoiceId: invoiceId })).toBeNull();

    // ...and a release cannot resurrect a completed claim.
    await releaseInvoiceClaim({ orgId: proOrg, claimId: winners[0]!.id });
    expect(await claimInvoice({ orgId: proOrg, stripeInvoiceId: invoiceId })).toBeNull();
  });

  it("makes a failed or expired claim retryable", async () => {
    const { claimInvoice, releaseInvoiceClaim } = await import(
      "@/lib/invoice-claims.server"
    );
    const failed = `in_fail_${stamp}`;
    const expired = `in_expire_${stamp}`;

    // A worker that errors releases its claim, and the next delivery retries
    // immediately rather than waiting out the lease.
    const first = await claimInvoice({ orgId: proOrg, stripeInvoiceId: failed });
    expect(first).not.toBeNull();
    await releaseInvoiceClaim({
      orgId: proOrg,
      claimId: first!.id,
      error: "stripe timed out",
    });
    const retry = await claimInvoice({ orgId: proOrg, stripeInvoiceId: failed });
    expect(retry).not.toBeNull();
    expect(retry!.attempts).toBe(2);

    // A worker that DIES leaves a live lease behind. It has to age out, or one
    // crash would wedge that invoice permanently unbilled.
    const dead = await claimInvoice({
      orgId: proOrg,
      stripeInvoiceId: expired,
      leaseSeconds: -1,
    });
    expect(dead).not.toBeNull();
    const reclaimed = await claimInvoice({ orgId: proOrg, stripeInvoiceId: expired });
    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.attempts).toBe(2);
  });

  it("runs the invoicing side effect once under concurrency", async () => {
    const { withInvoiceClaim } = await import("@/lib/invoice-claims.server");
    const invoiceId = `in_once_${stamp}`;
    let sideEffects = 0;

    // The shape the Stripe webhook uses: whatever else happens, the block that
    // adds invoice items runs exactly once.
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        withInvoiceClaim({ orgId: proOrg, stripeInvoiceId: invoiceId }, async () => {
          sideEffects += 1;
          return "billed";
        }),
      ),
    );

    expect(sideEffects).toBe(1);
    expect(results.filter((r) => r.status === "done")).toHaveLength(1);
    expect(results.filter((r) => r.status === "skipped")).toHaveLength(3);

    // Redelivery long after the fact is still a no-op.
    const later = await withInvoiceClaim(
      { orgId: proOrg, stripeInvoiceId: invoiceId },
      async () => {
        sideEffects += 1;
        return "billed";
      },
    );
    expect(later.status).toBe("skipped");
    expect(sideEffects).toBe(1);
  });

  it("purges compacted receipts only after their retention window", async () => {
    const { recordUsageEvent, compactUsageEvents, purgeCompactedEvents } =
      await import("@/lib/usage-events.server");
    const at = day("2026-09-01");

    await recordUsageEvent({ orgId: otherOrg, meter: METER, quantity: 5, eventKey: "p1", at });
    await compactUsageEvents({ orgId: otherOrg });
    await recordUsageEvent({ orgId: otherOrg, meter: METER, quantity: 5, eventKey: "p2", at });

    // Nothing is old enough yet, and the pending one is unbilled usage that
    // must never be dropped by age.
    expect(await purgeCompactedEvents({ orgId: otherOrg, retentionDays: 30 })).toBe(0);

    // Age the compacted rows past the window.
    await owner`
      UPDATE usage_events SET compacted_at = now() - interval '60 days'
      WHERE organization_id = ${otherOrg}::uuid AND compacted_at IS NOT NULL
    `;
    const purged = await purgeCompactedEvents({ orgId: otherOrg, retentionDays: 30 });
    expect(purged).toBeGreaterThan(0);

    const remaining = await owner`
      SELECT count(*)::int AS count FROM usage_events
      WHERE organization_id = ${otherOrg}::uuid AND compacted_at IS NULL
    `;
    expect(remaining[0].count).toBe(1);
  });
});
