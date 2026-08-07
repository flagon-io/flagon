import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Persistence + API surface for BYO integrations. The store layer is exercised
 * directly (so encryption, masking, and findCapable are proven without touching
 * the network — provider.test() is the only thing that would), and the HTTP
 * surface is checked for the hermetic authorization/validation paths that run
 * BEFORE any live provider call.
 *
 * Needs a migrated DB (CI, or locally with DATABASE_URL). INTEGRATIONS_SECRET_KEY
 * must be set for secret storage; we seed one if the environment hasn't.
 */
process.env.INTEGRATIONS_SECRET_KEY ||= "test-integrations-key-0123456789abcdef";
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("integrations store + API", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: (typeof import("../db/client.js"))["db"];
  let withOrg: (typeof import("../db/tenant.js"))["withOrg"];
  let schema: typeof import("../db/schema.js");
  let authTables: typeof import("../db/auth-tables.js");
  let hashToken: (typeof import("../lib/token-hash.js"))["hashToken"];
  let store: typeof import("./store.js");
  let getProvider: (typeof import("./providers.js"))["getProvider"];

  const orgId = randomUUID();
  const slug = `acme-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const memberToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;

  const creds = {
    accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    authToken: "super-secret-auth-token-9999",
    from: "+15551234567",
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = (await import("../index.js")).default as typeof app;
    ({ db } = await import("../db/client.js"));
    ({ withOrg } = await import("../db/tenant.js"));
    schema = await import("../db/schema.js");
    authTables = await import("../db/auth-tables.js");
    ({ hashToken } = await import("../lib/token-hash.js"));
    store = await import("./store.js");
    ({ getProvider } = await import("./providers.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "Acme", slug, plan: "pro" });
    await db.insert(authTables.users).values([
      { id: ownerId, name: "Owner", email: `owner-${orgId}@example.com` },
      { id: memberId, name: "Member", email: `member-${orgId}@example.com` },
    ]);
    await db.insert(authTables.members).values([
      { id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" },
      { id: randomUUID(), organizationId: orgId, userId: memberId, role: "member" },
    ]);
    await db.insert(authTables.accessTokens).values([
      { id: randomUUID(), type: "personal", name: "owner", tokenHash: hashToken(ownerToken), prefix: "flagon_pat", lastFour: ownerToken.slice(-4), userId: ownerId },
      { id: randomUUID(), type: "personal", name: "member", tokenHash: hashToken(memberToken), prefix: "flagon_pat", lastFour: memberToken.slice(-4), userId: memberId },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) =>
      tx.delete(schema.orgIntegrations).where(eq(schema.orgIntegrations.organizationId, orgId)),
    );
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, memberId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
    await db.delete(authTables.users).where(eq(authTables.users.id, memberId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
  });

  it("stores credentials encrypted and returns only a masked view", async () => {
    const twilio = getProvider("twilio")!;
    const view = await store.saveIntegration({
      orgId,
      provider: twilio,
      values: { config: { accountSid: creds.accountSid, from: creds.from }, secrets: { authToken: creds.authToken } },
      actorUserId: ownerId,
      test: { ok: true, detected: ["sms", "voice"] },
    });

    expect(view.provider).toBe("twilio");
    expect(view.status).toBe("connected");
    expect(view.connected).toBe(true);
    expect(view.config).toMatchObject({ accountSid: creds.accountSid, from: creds.from });
    // Options seeded to their defaults on first connect.
    expect(view.config.options).toEqual({ sms: true, voice: false });
    // Detected sender capabilities are persisted for correct delivery.
    expect(view.config.detected).toEqual(["sms", "voice"]);
    // Masked hint only; never the secret itself.
    expect(view.hints.authToken).toBe("9999");
    expect(JSON.stringify(view)).not.toContain(creds.authToken);

    // The persisted ciphertext must not contain the plaintext token.
    const [row] = await withOrg(orgId, (tx) =>
      tx.select().from(schema.orgIntegrations).where(eq(schema.orgIntegrations.organizationId, orgId)).limit(1),
    );
    expect(row!.secretCiphertext).toBeTruthy();
    expect(row!.secretCiphertext).not.toContain(creds.authToken);
  });

  it("decrypts credentials for internal use", async () => {
    const loaded = await store.loadCredentials(orgId, "twilio");
    expect(loaded).not.toBeNull();
    expect(loaded!.secrets.authToken).toBe(creds.authToken);
    expect(loaded!.config.accountSid).toBe(creds.accountSid);
  });

  it("gates delivery on the org's option choices (sms on, voice opt-in)", async () => {
    // Defaults on a fresh connect: SMS deliverable, voice off.
    const sms = await store.findCapable(orgId, "sms");
    expect(sms).not.toBeNull();
    expect(sms!.provider.key).toBe("twilio");
    expect(sms!.values.secrets.authToken).toBe(creds.authToken);
    expect(await store.findCapable(orgId, "voice")).toBeNull();

    // Turn voice on, SMS off — findCapable follows the toggle, not just the creds.
    const twilio = getProvider("twilio")!;
    const updated = await store.updateOptions(orgId, twilio, { voice: true, sms: false });
    expect(updated).not.toBeNull();
    expect(await store.findCapable(orgId, "voice")).not.toBeNull();
    expect(await store.findCapable(orgId, "sms")).toBeNull();

    // Restore defaults for the remaining tests.
    await store.updateOptions(orgId, twilio, { sms: true, voice: false });
  });

  it("exposes deliverable capabilities without decrypting secrets", async () => {
    // Defaults: sms deliverable, voice off.
    expect(await store.availableCapabilities(orgId)).toEqual({ sms: true, voice: false });
    expect(await store.hasCapability(orgId, "sms")).toBe(true);
    expect(await store.hasCapability(orgId, "voice")).toBe(false);

    // Over the API, for other surfaces to gate on ("Not configured").
    const res = await app.request(`/v1/orgs/${slug}/integrations/capabilities`, {
      headers: auth(memberToken),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).capabilities).toEqual({ sms: true, voice: false });

    // Enabling voice makes it deliverable (the sender supports it).
    const twilio = getProvider("twilio")!;
    await store.updateOptions(orgId, twilio, { voice: true });
    expect(await store.hasCapability(orgId, "voice")).toBe(true);
    await store.updateOptions(orgId, twilio, { voice: false });
  });

  it("never leaks the secret over the API list", async () => {
    const res = await app.request(`/v1/orgs/${slug}/integrations`, { headers: auth(memberToken) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.secretsEnabled).toBe(true);
    const twilio = body.providers.find((p: { key: string }) => p.key === "twilio");
    expect(twilio.integration.connected).toBe(true);
    expect(twilio.integration.hints.authToken).toBe("9999");
    expect(JSON.stringify(body)).not.toContain(creds.authToken);
  });

  it("updates behavior options over the API (manager only, no credential change)", async () => {
    const forbidden = await app.request(`/v1/orgs/${slug}/integrations/twilio`, {
      method: "PATCH",
      headers: { ...auth(memberToken), "Content-Type": "application/json" },
      body: JSON.stringify({ options: { voice: true } }),
    });
    expect(forbidden.status).toBe(403);

    const res = await app.request(`/v1/orgs/${slug}/integrations/twilio`, {
      method: "PATCH",
      headers: { ...auth(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ options: { voice: true } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.integration.config.options.voice).toBe(true);
    // Credentials untouched: still connected, still masked.
    expect(body.integration.connected).toBe(true);
    expect(JSON.stringify(body)).not.toContain(creds.authToken);

    // A non-boolean option value is rejected.
    const bad = await app.request(`/v1/orgs/${slug}/integrations/twilio`, {
      method: "PATCH",
      headers: { ...auth(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ options: { voice: "yes" } }),
    });
    expect(bad.status).toBe(422);

    // Reset to the default for the remaining tests.
    await app.request(`/v1/orgs/${slug}/integrations/twilio`, {
      method: "PATCH",
      headers: { ...auth(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ options: { voice: false } }),
    });
  });

  it("requires a manager to configure an integration", async () => {
    const res = await app.request(`/v1/orgs/${slug}/integrations/twilio`, {
      method: "PUT",
      headers: { ...auth(memberToken), "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    expect(res.status).toBe(403);
  });

  it("404s an unknown provider", async () => {
    const res = await app.request(`/v1/orgs/${slug}/integrations/pigeon`, {
      method: "PUT",
      headers: { ...auth(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("422s invalid configuration before any provider call", async () => {
    const res = await app.request(`/v1/orgs/${slug}/integrations/twilio`, {
      method: "PUT",
      headers: { ...auth(ownerToken), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it("removes an integration (manager only), after which nothing is capable", async () => {
    const forbidden = await app.request(`/v1/orgs/${slug}/integrations/twilio`, {
      method: "DELETE",
      headers: auth(memberToken),
    });
    expect(forbidden.status).toBe(403);

    const res = await app.request(`/v1/orgs/${slug}/integrations/twilio`, {
      method: "DELETE",
      headers: auth(ownerToken),
    });
    expect(res.status).toBe(200);

    expect(await store.getIntegration(orgId, "twilio")).toBeNull();
    expect(await store.findCapable(orgId, "sms")).toBeNull();

    const gone = await app.request(`/v1/orgs/${slug}/integrations/twilio`, {
      method: "DELETE",
      headers: auth(ownerToken),
    });
    expect(gone.status).toBe(404);
  });
});
