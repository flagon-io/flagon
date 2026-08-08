import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Checks product — end-to-end over the real Hono app: create a URL check, run it,
 * read results, and verify the two invariants that matter most:
 *   - a run meters under the check-run source (checks.uptime), NOT the events counter
 *     (a check must never eat an org's exposures allowance/credit); and
 *   - incident automation is Pro-gated.
 *
 * Runs only with a migrated DB reachable (CI, or locally with DATABASE_URL). Seeds an
 * isolated random HOBBY org, like the other integration suites.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("checks http", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `mon-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const auth = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };

  let okServer: Server;
  let errServer: Server;
  let okUrl: string;
  let errUrl: string;

  const post = (path: string, body: unknown) =>
    app.request(`/v1/orgs/${slug}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const get = (path: string) =>
    app.request(`/v1/orgs/${slug}${path}`, { headers: { Authorization: `Bearer ${ownerToken}` } });

  const listen = (server: Server): Promise<string> =>
    new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "Mon", slug, plan: "hobby" });
    await db.insert(authTables.users).values({ id: ownerId, name: "Owner", email: `owner-${orgId}@example.com` });
    await db.insert(authTables.members).values({ id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" });
    await db.insert(authTables.accessTokens).values({
      id: randomUUID(),
      type: "personal",
      name: "owner pat",
      tokenHash: hashToken(ownerToken),
      prefix: "flagon_pat",
      lastFour: ownerToken.slice(-4),
      userId: ownerId,
    });

    okServer = createServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    errServer = createServer((_req, res) => {
      res.writeHead(500);
      res.end("boom");
    });
    [okUrl, errUrl] = await Promise.all([listen(okServer), listen(errServer)]);
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) => tx.delete(schema.checks).where(eq(schema.checks.organizationId, orgId)));
    await withOrg(orgId, (tx) => tx.delete(schema.usageEvents).where(eq(schema.usageEvents.organizationId, orgId)));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
    await Promise.all([okServer, errServer].map((s) => new Promise<void>((r) => s.close(() => r()))));
  });

  it("lists the live uptime monitor types (url/tcp/dns/ssl)", async () => {
    const res = await get("/checks/monitor-types");
    expect(res.status).toBe(200);
    const { monitorTypes } = await res.json();
    const keys = monitorTypes.map((t: { key: string }) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["url", "tcp", "dns", "ssl"]));
    // Synthetic checks (api, browser) are deferred to "Soon" — not registered.
    expect(keys).not.toContain("api");
    expect(keys).not.toContain("browser");
    const url = monitorTypes.find((t: { key: string }) => t.key === "url");
    expect(url.family).toBe("uptime");
    expect(url.configSchema).toBeTruthy();
  });

  it("Pro-gates incident automation on a hobby org", async () => {
    const res = await post("/checks", {
      name: "Gated",
      type: "url",
      config: { url: okUrl },
      incidentAutomation: true,
    });
    expect(res.status).toBe(403);
  });

  it("creates a URL check, runs it, and records a passing result", async () => {
    const created = await post("/checks", {
      name: "Homepage",
      key: "homepage",
      type: "url",
      config: { url: okUrl },
      frequencySeconds: 300,
    });
    expect(created.status).toBe(200);
    const { check } = await created.json();
    expect(check.type).toBe("url");
    expect(check.family).toBe("uptime");
    expect(check.currentStatus).toBe("unknown");

    const run = await post("/checks/homepage/run", {});
    expect(run.status).toBe(200);
    const result = await run.json();
    expect(result.status).toBe("passing");
    expect(result.httpStatus).toBe(200);

    const results = await get("/checks/homepage/results");
    const { results: rows } = await results.json();
    expect(rows.length).toBe(1);

    const after = await get("/checks/homepage");
    expect((await after.json()).check.currentStatus).toBe("passing");
  });

  it("does NOT run-meter uptime monitors, and never touches the events counter", async () => {
    // Uptime monitors are billed by COUNT (a licensed subscription quantity, Checkly's
    // model), so a URL run must NOT ingest any check-run usage event.
    const events = await withOrg(orgId, (tx) =>
      tx.select().from(schema.usageEvents).where(eq(schema.usageEvents.organizationId, orgId)),
    );
    expect(events.filter((e) => e.source.startsWith("checks.")).length).toBe(0);

    // And the exposures allowance/credit counter must be untouched regardless.
    const counters = await withOrg(orgId, (tx) =>
      tx.select().from(schema.usageCounters).where(eq(schema.usageCounters.organizationId, orgId)),
    );
    const total = counters.reduce((sum, c) => sum + Number(c.count), 0);
    expect(total).toBe(0);
  });

  it("records a failing status when the endpoint errors", async () => {
    await post("/checks", { name: "Broken", key: "broken", type: "url", config: { url: errUrl } });
    const run = await post("/checks/broken/run", {});
    expect((await run.json()).status).toBe("failing");
    const after = await get("/checks/broken");
    expect((await after.json()).check.currentStatus).toBe("failing");
  });
});
