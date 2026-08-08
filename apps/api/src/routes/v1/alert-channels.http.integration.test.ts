import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Alert channels — end-to-end over the real Hono app: create an email channel, list it,
 * send a test, edit it (events + enabled), subscribe a check to it, and delete it. Proves
 * the channel CRUD + the check ↔ channel subscription wiring are fully functional.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("alert channels http", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `ac-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const auth = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
  const post = (p: string, b: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "POST", headers: auth, body: JSON.stringify(b) });
  const patch = (p: string, b: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "PATCH", headers: auth, body: JSON.stringify(b) });
  const get = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { headers: { Authorization: `Bearer ${ownerToken}` } });
  const del = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { method: "DELETE", headers: { Authorization: `Bearer ${ownerToken}` } });

  let okServer: Server;
  let okUrl: string;

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "AC", slug, plan: "pro" });
    await db.insert(authTables.users).values({ id: ownerId, name: "Owner", email: `owner-${orgId}@example.com` });
    await db.insert(authTables.members).values({ id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" });
    await db.insert(authTables.accessTokens).values({
      id: randomUUID(),
      type: "personal",
      name: "pat",
      tokenHash: hashToken(ownerToken),
      prefix: "flagon_pat",
      lastFour: ownerToken.slice(-4),
      userId: ownerId,
    });
    okServer = createServer((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    okUrl = await new Promise<string>((r) =>
      okServer.listen(0, "127.0.0.1", () => {
        const a = okServer.address();
        r(`http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`);
      }),
    );
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) => tx.delete(schema.checks).where(eq(schema.checks.organizationId, orgId)));
    await withOrg(orgId, (tx) => tx.delete(schema.alertChannels).where(eq(schema.alertChannels.organizationId, orgId)));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
    await new Promise<void>((r) => okServer.close(() => r()));
  });

  let channelId = "";

  it("lists the available channel types", async () => {
    const { channelTypes } = await (await get("/alert-channels/types")).json();
    const keys = channelTypes.map((t: { key: string }) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["email", "sms", "phone", "webhook"]));
    const sms = channelTypes.find((t: { key: string }) => t.key === "sms");
    expect(sms.gatesCapability).toBe("sms");
  });

  it("creates an email channel", async () => {
    const res = await post("/alert-channels", { type: "email", name: "On-call", config: { address: "oncall@acme.test" } });
    expect(res.status).toBe(200);
    const { channel } = await res.json();
    channelId = channel.id;
    expect(channel.type).toBe("email");
    expect(channel.config.address).toBe("oncall@acme.test");
    expect(channel.enabled).toBe(true);
  });

  it("rejects a bad email address", async () => {
    const res = await post("/alert-channels", { type: "email", name: "Bad", config: { address: "not-an-email" } });
    expect(res.status).toBe(422);
  });

  it("rejects an SMS channel without a connected integration", async () => {
    const res = await post("/alert-channels", { type: "sms", name: "Pager", config: { phone: "+15551234567" } });
    expect(res.status).toBe(422);
  });

  it("creates a webhook channel and delivers a real test POST", async () => {
    const res = await post("/alert-channels", { type: "webhook", name: "Hook", config: { url: okUrl, secret: "shh" } });
    expect(res.status).toBe(200);
    const { channel } = await res.json();
    expect(channel.type).toBe("webhook");
    expect(channel.config.url).toBe(okUrl);
    // The test endpoint POSTs to the local server, which returns 200.
    const test = await post(`/alert-channels/${channel.id}/test`, {});
    expect(test.status).toBe(200);
    await del(`/alert-channels/${channel.id}`);
  });

  it("lists the channel", async () => {
    const { channels } = await (await get("/alert-channels")).json();
    expect(channels.some((c: { id: string }) => c.id === channelId)).toBe(true);
  });

  it("sends a test (console sender in dev)", async () => {
    const res = await post(`/alert-channels/${channelId}/test`, {});
    expect(res.status).toBe(200);
  });

  it("edits events + disables the channel", async () => {
    const res = await patch(`/alert-channels/${channelId}`, { sendOnDegraded: true, enabled: false });
    expect(res.status).toBe(200);
    const { channel } = await res.json();
    expect(channel.sendOnDegraded).toBe(true);
    expect(channel.enabled).toBe(false);
  });

  it("a check subscribes to the channel", async () => {
    const create = await post("/checks", {
      name: "Home",
      key: "home",
      type: "url",
      config: { url: okUrl },
      alertChannelIds: [channelId],
    });
    expect(create.status).toBe(200);
    const { check } = await create.json();
    expect(check.alertChannelIds).toContain(channelId);
    // Running it should not throw even with a (disabled) channel subscribed.
    const run = await post("/checks/home/run", {});
    expect(run.status).toBe(200);
  });

  it("deletes the channel", async () => {
    expect((await del(`/alert-channels/${channelId}`)).status).toBe(200);
    const { channels } = await (await get("/alert-channels")).json();
    expect(channels.some((c: { id: string }) => c.id === channelId)).toBe(false);
  });
});
