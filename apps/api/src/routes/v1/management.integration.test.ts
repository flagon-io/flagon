import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Full-loop integration: drive the management API over HTTP (as an org token),
 * then evaluate the result through OFREP with a minted SDK key. This exercises
 * auth -> org resolution -> withOrg/RLS -> create/seed -> per-env config ->
 * SDK-key issuance -> evaluation, exactly as the console + an SDK would.
 *
 * Runs only with a migrated DB reachable (CI, or locally with DATABASE_URL);
 * skipped otherwise. Needs BOTH the API migrations and the console's auth
 * migration applied (organizations/access_tokens live in the latter).
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("management API + OFREP (integration)", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `acme-${randomBytes(4).toString("hex")}`;
  const orgToken = `flagon_oat_${randomBytes(24).toString("base64url")}`;

  const auth = () => ({
    Authorization: `Bearer ${orgToken}`,
    "Content-Type": "application/json",
  });
  const base = `/v1/orgs/${slug}`;

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db
      .insert(authTables.organizations)
      .values({ id: orgId, name: "Acme", slug, plan: "pro" });
    await db.insert(authTables.accessTokens).values({
      id: randomUUID(),
      type: "organization",
      name: "test token",
      tokenHash: hashToken(orgToken),
      prefix: "flagon_oat",
      lastFour: orgToken.slice(-4),
      organizationId: orgId,
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.sdkKeys).where(eq(schema.sdkKeys.organizationId, orgId));
    await db.delete(schema.flags).where(eq(schema.flags.organizationId, orgId));
    await db.delete(schema.segments).where(eq(schema.segments.organizationId, orgId));
    await db.delete(schema.entities).where(eq(schema.entities.organizationId, orgId));
    await db.delete(schema.environments).where(eq(schema.environments.organizationId, orgId));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
  });

  it("creates a boolean flag (seeding on/off + 3 environments)", async () => {
    const res = await app.request(`${base}/flags`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "checkout", type: "boolean" }),
    });
    expect(res.status).toBe(201);
    const { flag } = await res.json();
    expect(flag).toMatchObject({ key: "checkout", type: "boolean" });
  });

  it("creates a multivariate string flag with variants", async () => {
    const res = await app.request(`${base}/flags`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        slug: "color",
        type: "string",
        variants: [{ value: "red" }, { value: "green" }, { value: "blue" }],
      }),
    });
    expect(res.status).toBe(201);
  });

  it("rejects a duplicate slug (409) and a bad variant type (422)", async () => {
    const dup = await app.request(`${base}/flags`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "checkout", type: "boolean" }),
    });
    expect(dup.status).toBe(409);

    const bad = await app.request(`${base}/flags`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "oops", type: "number", variants: [{ value: "not-a-number" }] }),
    });
    expect(bad.status).toBe(422);
  });

  it("lists flags and returns detail with 3 environments", async () => {
    const list = await (await app.request(`${base}/flags`, { headers: auth() })).json();
    expect(list.map((f: { key: string }) => f.key).sort()).toEqual(["checkout", "color"]);

    const detail = await (await app.request(`${base}/flags/checkout`, { headers: auth() })).json();
    expect(detail.environments.map((e: { key: string }) => e.key)).toEqual([
      "production",
      "preview",
      "development",
    ]);
    expect(detail.environments.every((e: { enabled: boolean }) => !e.enabled)).toBe(true);
  });

  it("refuses an org the token is not authorized for", async () => {
    const res = await app.request(`/v1/orgs/not-my-org/flags`, { headers: auth() });
    expect(res.status).toBe(404);
  });

  it("enables a flag, mints an SDK key, and evaluates it via OFREP", async () => {
    const enable = await app.request(`${base}/flags/checkout/environments/production`, {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ enabled: true }),
    });
    expect(enable.status).toBe(200);

    const keyRes = await app.request(`${base}/client-keys`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ name: "prod key", environment: "production" }),
    });
    expect(keyRes.status).toBe(201);
    const { key } = await keyRes.json();
    expect(key.token).toMatch(/^flagon_client_/);

    const evalRes = await app.request(`/ofrep/v1/evaluate/flags/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ context: { targetingKey: "user-1" } }),
    });
    expect(evalRes.status).toBe(200);
    expect(await evalRes.json()).toMatchObject({ key: "checkout", value: true, reason: "STATIC" });

    // A key with no SDK auth is rejected.
    const noauth = await app.request(`/ofrep/v1/evaluate/flags/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: {} }),
    });
    expect(noauth.status).toBe(401);
  });

  it("bulk-evaluates with ETag caching and rejects a malformed body", async () => {
    const keyRes = await app.request(`${base}/client-keys`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ name: "bulk key", environment: "production" }),
    });
    const { key } = await keyRes.json();
    const sdkAuth = {
      Authorization: `Bearer ${key.token}`,
      "Content-Type": "application/json",
    };

    // Bulk eval returns a flags array and an ETag over the config version.
    const bulk = await app.request(`/ofrep/v1/evaluate/flags`, {
      method: "POST",
      headers: sdkAuth,
      body: JSON.stringify({ context: { targetingKey: "u1" } }),
    });
    expect(bulk.status).toBe(200);
    const etag = bulk.headers.get("etag");
    expect(etag).toBeTruthy();
    // OFREP bulk is a spec-defined envelope `{ flags: [...] }`, NOT one of our
    // bare-array /v1 lists. Leave it shaped per the OFREP spec.
    const body = await bulk.json();
    expect(Array.isArray(body.flags)).toBe(true);
    expect(
      body.flags.find((f: { key: string }) => f.key === "checkout"),
    ).toMatchObject({ value: true });

    // Re-request with the ETag → 304 Not Modified, no body.
    const notModified = await app.request(`/ofrep/v1/evaluate/flags`, {
      method: "POST",
      headers: { ...sdkAuth, "If-None-Match": etag as string },
      body: JSON.stringify({ context: { targetingKey: "u1" } }),
    });
    expect(notModified.status).toBe(304);

    // A malformed JSON body is a 400 PARSE_ERROR (not a silently-empty context).
    const bad = await app.request(`/ofrep/v1/evaluate/flags/checkout`, {
      method: "POST",
      headers: sdkAuth,
      body: "{ not valid json",
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ errorCode: "PARSE_ERROR" });
  });

  it("targets a multivariate flag by segment and evaluates via OFREP", async () => {
    // A reusable segment: internal users.
    const seg = await app.request(`${base}/segments`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        key: "internal",
        name: "Internal users",
        conditions: [{ attribute: "email", op: "ends_with", values: ["@flagon.io"] }],
      }),
    });
    expect(seg.status).toBe(201);

    // Enable the color flag in production (default variant-1 = red).
    await app.request(`${base}/flags/color/environments/production`, {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ enabled: true }),
    });

    // Rule: internal users get blue (variant-3).
    const rule = await app.request(
      `${base}/flags/color/environments/production/rules`,
      {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({
          conditions: [{ segment: "internal" }],
          serve: { variant: "variant-3" },
        }),
      },
    );
    expect(rule.status).toBe(201);

    // A rule referencing an unknown variant is rejected.
    const badRule = await app.request(
      `${base}/flags/color/environments/production/rules`,
      {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ conditions: [], serve: { variant: "ghost" } }),
      },
    );
    expect(badRule.status).toBe(422);

    // Mint a production key and evaluate.
    const { key } = await (
      await app.request(`${base}/client-keys`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ name: "color key", environment: "production" }),
      })
    ).json();

    const evalHeaders = {
      Authorization: `Bearer ${key.token}`,
      "Content-Type": "application/json",
    };

    const internal = await (
      await app.request(`/ofrep/v1/evaluate/flags/color`, {
        method: "POST",
        headers: evalHeaders,
        body: JSON.stringify({ context: { targetingKey: "u", email: "robin@flagon.io" } }),
      })
    ).json();
    expect(internal).toMatchObject({ value: "blue", variant: "variant-3", reason: "TARGETING_MATCH" });

    const external = await (
      await app.request(`/ofrep/v1/evaluate/flags/color`, {
        method: "POST",
        headers: evalHeaders,
        body: JSON.stringify({ context: { targetingKey: "u", email: "x@other.com" } }),
      })
    ).json();
    expect(external).toMatchObject({ value: "red", variant: "variant-1", reason: "DEFAULT" });
  });

  it("targets with a nested AND/OR rule", async () => {
    // internal users OR (plan=pro AND seats>=5) -> blue
    await app.request(`${base}/flags/color/environments/preview`, {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ enabled: true }),
    });
    const rule = await app.request(
      `${base}/flags/color/environments/preview/rules`,
      {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({
          conditions: [
            {
              any: [
                { segment: "internal" },
                {
                  all: [
                    { attribute: "plan", op: "eq", values: ["pro"] },
                    { attribute: "seats", op: "gte", values: [5] },
                  ],
                },
              ],
            },
          ],
          serve: { variant: "variant-3" },
        }),
      },
    );
    expect(rule.status).toBe(201);

    const { key } = await (
      await app.request(`${base}/client-keys`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ name: "preview", environment: "preview" }),
      })
    ).json();
    const h = { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" };

    const proTeam = await (
      await app.request(`/ofrep/v1/evaluate/flags/color`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ context: { targetingKey: "u", plan: "pro", seats: 9 } }),
      })
    ).json();
    expect(proTeam).toMatchObject({ value: "blue", reason: "TARGETING_MATCH" });

    const soloPro = await (
      await app.request(`/ofrep/v1/evaluate/flags/color`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ context: { targetingKey: "u", plan: "pro", seats: 1 } }),
      })
    ).json();
    expect(soloPro.reason).toBe("DEFAULT");
  });

  it("sets tags, returns revisions, and lists members", async () => {
    await app.request(`${base}/flags`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "meta", type: "boolean", tags: ["alpha"] }),
    });

    const patch = await app.request(`${base}/flags/meta`, {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ tags: ["alpha", "beta"], description: "A metadata flag" }),
    });
    expect(patch.status).toBe(200);

    const detail = await (await app.request(`${base}/flags/meta`, { headers: auth() })).json();
    expect(detail.flag.tags).toEqual(["alpha", "beta"]);
    expect(detail.flag.description).toBe("A metadata flag");
    // Most-recent-first: created + updated at least.
    expect(detail.revisions.length).toBeGreaterThanOrEqual(2);
    expect(detail.revisions[0].action).toBe("updated");

    // The flag list carries tags too.
    const list = await (await app.request(`${base}/flags`, { headers: auth() })).json();
    const meta = list.find((f: { key: string }) => f.key === "meta");
    expect(meta.tags).toEqual(["alpha", "beta"]);

    // Members endpoint responds (empty is fine for this seeded org).
    const members = await app.request(`${base}/members`, { headers: auth() });
    expect(members.status).toBe(200);
    expect(Array.isArray(await members.json())).toBe(true);
  });

  it("archives, restores, and permanently deletes a flag", async () => {
    await app.request(`${base}/flags`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "temp", type: "boolean" }),
    });

    expect(
      (await app.request(`${base}/flags/temp/archive`, { method: "POST", headers: auth() }))
        .status,
    ).toBe(200);
    let detail = await (await app.request(`${base}/flags/temp`, { headers: auth() })).json();
    expect(detail.flag.archivedAt).not.toBeNull();

    expect(
      (await app.request(`${base}/flags/temp/restore`, { method: "POST", headers: auth() }))
        .status,
    ).toBe(200);
    detail = await (await app.request(`${base}/flags/temp`, { headers: auth() })).json();
    expect(detail.flag.archivedAt).toBeNull();

    expect(
      (await app.request(`${base}/flags/temp`, { method: "DELETE", headers: auth() })).status,
    ).toBe(200);
    expect((await app.request(`${base}/flags/temp`, { headers: auth() })).status).toBe(404);
  });

  it("freezes config writes on an archived flag (409) until restored", async () => {
    await app.request(`${base}/flags`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "frozen", type: "boolean" }),
    });
    await app.request(`${base}/flags/frozen/archive`, { method: "POST", headers: auth() });

    // Env config, meta, and rule writes are all rejected while archived.
    const envRes = await app.request(`${base}/flags/frozen/environments/development`, {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ enabled: true }),
    });
    expect(envRes.status).toBe(409);

    const metaRes = await app.request(`${base}/flags/frozen`, {
      method: "PATCH",
      headers: auth(),
      body: JSON.stringify({ description: "nope" }),
    });
    expect(metaRes.status).toBe(409);

    const ruleRes = await app.request(
      `${base}/flags/frozen/environments/development/rules`,
      {
        method: "PUT",
        headers: auth(),
        body: JSON.stringify({ rules: [] }),
      },
    );
    expect(ruleRes.status).toBe(409);

    // Restoring lifts the freeze.
    await app.request(`${base}/flags/frozen/restore`, { method: "POST", headers: auth() });
    const afterRestore = await app.request(
      `${base}/flags/frozen/environments/development`,
      {
        method: "PATCH",
        headers: auth(),
        body: JSON.stringify({ enabled: true }),
      },
    );
    expect(afterRestore.status).toBe(200);
  });
});
