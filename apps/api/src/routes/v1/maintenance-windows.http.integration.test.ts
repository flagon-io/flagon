import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Maintenance windows end-to-end over the real Hono app: create/list/get/patch/delete +
 * validation (endsAt must follow startsAt). Proves the CRUD + tenant scoping are wired.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("maintenance windows http", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `mw-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const auth = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
  const post = (p: string, b: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "POST", headers: auth, body: JSON.stringify(b) });
  const patch = (p: string, b: unknown) => app.request(`/v1/orgs/${slug}${p}`, { method: "PATCH", headers: auth, body: JSON.stringify(b) });
  const get = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { headers: { Authorization: `Bearer ${ownerToken}` } });
  const del = (p: string) => app.request(`/v1/orgs/${slug}${p}`, { method: "DELETE", headers: { Authorization: `Bearer ${ownerToken}` } });

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "MW", slug, plan: "pro" });
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
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) => tx.delete(schema.maintenanceWindows).where(eq(schema.maintenanceWindows.organizationId, orgId)));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
  });

  let id = "";

  it("creates a window", async () => {
    const res = await post("/maintenance-windows", {
      name: "Nightly deploy",
      tags: ["api"],
      startsAt: "2026-09-01T02:00:00.000Z",
      endsAt: "2026-09-01T04:00:00.000Z",
      repeat: "daily",
    });
    expect(res.status).toBe(200);
    const { window } = await res.json();
    id = window.id;
    expect(window.name).toBe("Nightly deploy");
    expect(window.tags).toEqual(["api"]);
    expect(window.repeat).toBe("daily");
    expect(window.repeatEndsAt).toBeNull();
  });

  it("rejects endsAt before startsAt", async () => {
    const res = await post("/maintenance-windows", {
      name: "Bad",
      startsAt: "2026-09-01T04:00:00.000Z",
      endsAt: "2026-09-01T02:00:00.000Z",
    });
    expect(res.status).toBe(422);
  });

  it("lists and gets the window", async () => {
    const { windows } = await (await get("/maintenance-windows")).json();
    expect(windows.some((w: { id: string }) => w.id === id)).toBe(true);
    const one = await (await get(`/maintenance-windows/${id}`)).json();
    expect(one.window.id).toBe(id);
  });

  it("edits the window", async () => {
    const res = await patch(`/maintenance-windows/${id}`, { repeat: "weekly", tags: ["api", "web"] });
    expect(res.status).toBe(200);
    const { window } = await res.json();
    expect(window.repeat).toBe("weekly");
    expect(window.tags).toEqual(["api", "web"]);
  });

  it("deletes the window", async () => {
    expect((await del(`/maintenance-windows/${id}`)).status).toBe(200);
    const { windows } = await (await get("/maintenance-windows")).json();
    expect(windows.some((w: { id: string }) => w.id === id)).toBe(false);
  });
});
