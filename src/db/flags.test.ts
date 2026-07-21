import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const canRun = Boolean(process.env.DATABASE_URL_APP && process.env.DATABASE_URL_OWNER);
describe.skipIf(!canRun)("organization feature flags", () => {
  const slug = `flags-${Date.now()}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let orgId = "";
  afterAll(async () => {
    if (owner) { if (orgId) await owner`DELETE FROM access_tokens WHERE subject_type = 'organization' AND subject_id = ${orgId}`; await owner`DELETE FROM organizations WHERE slug = ${slug}`; await owner.end(); }
    if (closePool) await closePool();
  });
  it("creates typed flags, segments, and both credential classes under RLS", async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 1 });
    const [org] = await owner`INSERT INTO organizations (slug, name) VALUES (${slug}, 'Flags') RETURNING id`;
    orgId = org.id as string;
    ({ closePool } = await import("@/db/client"));
    const { createFlag, getFlag, updateFlag } = await import("@/lib/flags.server");
    const { createSegment } = await import("@/lib/segments.server");
    const { createAccessToken, authenticateAccessToken } = await import("@/lib/access-tokens.server");
    const { createClientToken, authenticateClientToken } = await import("@/lib/client-tokens.server");
    expect((await createFlag(orgId, { key: "new-checkout", name: "New checkout" })).ok).toBe(true);
    expect((await getFlag(orgId, "new-checkout"))?.defaultVariant).toBe("off");
    const updated = await updateFlag(orgId, "new-checkout", { defaultVariant: "on" });
    expect(updated.ok && updated.flag.defaultVariant).toBe("on");
    expect((await createSegment(orgId, { key: "beta", name: "Beta", criteria: { operator: "all", items: [] } })).ok).toBe(true);
    const server = await createAccessToken({ subjectType: "organization", subjectId: orgId, name: "Production", scopes: ["flags:evaluate"] });
    expect(server.ok).toBe(true);
    if (server.ok) expect(await authenticateAccessToken(`Bearer ${server.token}`, "flags:evaluate")).toMatchObject({ subjectId: orgId });
    const client = await createClientToken(orgId, "iOS app");
    expect(client.ok).toBe(true);
    if (client.ok) expect(await authenticateClientToken(`Bearer ${client.token}`)).toMatchObject({ organizationId: orgId });
    if (!server.ok || !client.ok) throw new Error("Evaluation credentials were not created.");

    const { POST: bulkEvaluate } = await import("@/app/api/ofrep/v1/evaluate/flags/route");
    const bulkRequest = (etag?: string) => new Request("https://api.flagon.io/ofrep/v1/evaluate/flags", {
      method: "POST",
      headers: { authorization: `Bearer ${client.token}`, "content-type": "application/json", ...(etag ? { "if-none-match": etag } : {}) },
      body: JSON.stringify({ context: { targetingKey: "browser-demo", environment: "production" } }),
    });
    const firstBulk = await bulkEvaluate(bulkRequest());
    expect(firstBulk.status).toBe(200);
    expect(firstBulk.headers.get("access-control-allow-origin")).toBe("*");
    expect((await firstBulk.json()).flags).toMatchObject([{ key: "new-checkout", value: true }]);
    const etag = firstBulk.headers.get("etag");
    expect(etag).toBeTruthy();
    expect((await bulkEvaluate(bulkRequest(etag ?? undefined))).status).toBe(304);

    const { POST: singleEvaluate } = await import("@/app/api/ofrep/v1/evaluate/flags/[key]/route");
    const single = await singleEvaluate(new Request("https://api.flagon.io/ofrep/v1/evaluate/flags/new-checkout", {
      method: "POST", headers: { authorization: `Bearer ${server.token}`, "content-type": "application/json" }, body: JSON.stringify({ context: { targetingKey: "server-request" } }),
    }), { params: Promise.resolve({ key: "new-checkout" }) });
    expect(single.status).toBe(200);
    const singleEtag = single.headers.get("etag");
    expect(singleEtag).toBeTruthy();
    expect(await single.json()).toMatchObject({ key: "new-checkout", value: true, variant: "on" });

    // The single-flag route revalidates too. A 304 carries no body and,
    // crucially, meters nothing - it served no new decision, so billing for one would charge for
    // work nobody did.
    const revalidated = await singleEvaluate(new Request("https://api.flagon.io/ofrep/v1/evaluate/flags/new-checkout", {
      method: "POST", headers: { authorization: `Bearer ${server.token}`, "content-type": "application/json", "if-none-match": singleEtag ?? "" }, body: JSON.stringify({ context: { targetingKey: "server-request" } }),
    }), { params: Promise.resolve({ key: "new-checkout" }) });
    expect(revalidated.status).toBe(304);

    // A CLIENT token may evaluate a single flag, exactly as it may evaluate in
    // bulk. Refusing it would be theatre: the bulk endpoint already accepts an
    // arbitrary context from the same publishable token and returns every
    // flag, so one flag discloses strictly less.
    const clientSingle = await singleEvaluate(new Request("https://api.flagon.io/ofrep/v1/evaluate/flags/new-checkout", {
      method: "POST", headers: { authorization: `Bearer ${client.token}`, "content-type": "application/json" }, body: JSON.stringify({ context: { targetingKey: "browser-single" } }),
    }), { params: Promise.resolve({ key: "new-checkout" }) });
    expect(clientSingle.status).toBe(200);
    expect(await clientSingle.json()).toMatchObject({ key: "new-checkout", value: true });

    // A DIFFERENT context is a different representation, so it is not a hit.
    const otherContext = await singleEvaluate(new Request("https://api.flagon.io/ofrep/v1/evaluate/flags/new-checkout", {
      method: "POST", headers: { authorization: `Bearer ${server.token}`, "content-type": "application/json", "if-none-match": singleEtag ?? "" }, body: JSON.stringify({ context: { targetingKey: "someone-else" } }),
    }), { params: Promise.resolve({ key: "new-checkout" }) });
    expect(otherContext.status).toBe(200);

    // Evaluations meter through the durable event path now: a receipt per
    // request first, folded into the rollup by compaction. Four 200s served
    // decisions (bulk, single, client-single, single-other-context); the two
    // 304s did not.
    const [pending] = await owner`SELECT count(*)::int AS count, COALESCE(sum(quantity), 0)::int AS quantity FROM usage_events WHERE organization_id = ${orgId} AND meter = 'flags.evaluations'`;
    expect(pending.count).toBe(4);
    expect(pending.quantity).toBe(4);

    // Only the BULK route serves a full configuration payload, so only it
    // counts as a sync. The single-flag lookups are not config downloads, and
    // the bulk 304 was not one either.
    const [syncs] = await owner`SELECT COALESCE(sum(quantity), 0)::int AS quantity FROM usage_events WHERE organization_id = ${orgId} AND meter = 'flags.syncs'`;
    expect(syncs.quantity).toBe(1);

    const { compactUsageEvents } = await import("@/lib/usage-events.server");
    await compactUsageEvents({ orgId });
    const [metered] = await owner`SELECT quantity FROM usage_rollups WHERE organization_id = ${orgId} AND meter = 'flags.evaluations'`;
    expect(Number(metered.quantity)).toBe(4);
    const [meteredSyncs] = await owner`SELECT quantity FROM usage_rollups WHERE organization_id = ${orgId} AND meter = 'flags.syncs'`;
    expect(Number(meteredSyncs.quantity)).toBe(1);
    const { listClientTokens, rotateClientToken } = await import("@/lib/client-tokens.server");
    expect((await listClientTokens(orgId))[0].token).toBe(client.token);
    const rotatedClient = await rotateClientToken(orgId, client.clientToken.id);
    expect(rotatedClient.ok).toBe(true);
    expect(await authenticateClientToken(`Bearer ${client.token}`)).toBeNull();
    if (rotatedClient.ok) expect(await authenticateClientToken(`Bearer ${rotatedClient.token}`)).toMatchObject({ id: client.clientToken.id });

    const { rotateAccessToken } = await import("@/lib/access-tokens.server");
    const rotatedServer = await rotateAccessToken("organization", orgId, server.accessToken.id);
    expect(rotatedServer.ok).toBe(true);
    expect(await authenticateAccessToken(`Bearer ${server.token}`, "flags:evaluate")).toBeNull();
    const { db } = await import("@/db/client");
    const { featureFlags, clientTokens, segments } = await import("@/db/schema");
    expect(await db.select().from(featureFlags)).toHaveLength(0);
    expect(await db.select().from(clientTokens)).toHaveLength(0);
    expect(await db.select().from(segments)).toHaveLength(0);
  });
});
