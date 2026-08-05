import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

/**
 * Organization security posture API (/v1/orgs/:org/security). The audit found
 * the entitlement was UI-only; these lock the SERVER-side gates in place:
 *   - SSO/SCIM/2FA enforcement is Pro+ (a Hobby org is refused).
 *   - Arming enforcement (require SSO / require 2FA) is OWNER-only (so a member
 *     who could be blocked can never turn the block on).
 *   - You cannot require SSO with no provider configured (would lock members out).
 *
 * Runs only with a migrated DB reachable (CI, or locally with DATABASE_URL).
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("org security posture API", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: (typeof import("../../db/client.js"))["db"];
  let authTables: typeof import("../../db/auth-tables.js");
  let hashToken: (typeof import("../../lib/token-hash.js"))["hashToken"];

  const orgId = randomUUID();
  const slug = `acme-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const adminToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;

  const patch = (token: string, body: Record<string, unknown>) =>
    app.request(`/v1/orgs/${slug}/security`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const mintScim = (token: string) =>
    app.request(`/v1/orgs/${slug}/security/scim-tokens`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "okta" }),
    });

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    authTables = await import("../../db/auth-tables.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "Acme", slug, plan: "pro" });
    await db.insert(authTables.users).values([
      { id: ownerId, name: "Owner", email: `owner-${orgId}@example.com` },
      { id: adminId, name: "Admin", email: `admin-${orgId}@example.com` },
    ]);
    await db.insert(authTables.members).values([
      { id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" },
      { id: randomUUID(), organizationId: orgId, userId: adminId, role: "admin" },
    ]);
    await db.insert(authTables.accessTokens).values([
      { id: randomUUID(), type: "personal", name: "owner", tokenHash: hashToken(ownerToken), prefix: "flagon_pat", lastFour: ownerToken.slice(-4), userId: ownerId },
      { id: randomUUID(), type: "personal", name: "admin", tokenHash: hashToken(adminToken), prefix: "flagon_pat", lastFour: adminToken.slice(-4), userId: adminId },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(sql`DELETE FROM sso_providers WHERE organization_id = ${orgId}`);
    await db.execute(sql`DELETE FROM scim_tokens WHERE organization_id = ${orgId}`);
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, adminId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
    await db.delete(authTables.users).where(eq(authTables.users.id, adminId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
  });

  it("owner-only: an admin cannot arm require-2FA (403)", async () => {
    const res = await patch(adminToken, { require2fa: true });
    expect(res.status).toBe(403);
  });

  it("an admin CAN toggle SCIM (not enforcement) on a paid org (200)", async () => {
    const res = await patch(adminToken, { scimEnabled: true });
    expect(res.status).toBe(200);
  });

  it("the owner can arm require-2FA (200)", async () => {
    const res = await patch(ownerToken, { require2fa: true });
    expect(res.status).toBe(200);
    expect((await res.json()).require2fa).toBe(true);
  });

  it("refuses to require SSO with no provider configured (422)", async () => {
    const res = await patch(ownerToken, { ssoEnforced: true });
    expect(res.status).toBe(422);
  });

  it("allows requiring SSO once a provider exists (200)", async () => {
    await db.execute(sql`
      INSERT INTO sso_providers (id, issuer, domain, provider_id, organization_id, domain_verified)
      VALUES (${randomUUID()}, 'https://idp.example.com', 'acme.test', ${`sso-${orgId}`}, ${orgId}, false)
    `);
    const res = await patch(ownerToken, { ssoEnforced: true });
    expect(res.status).toBe(200);
    expect((await res.json()).ssoEnforced).toBe(true);
  });

  it("Pro+ gate: a Hobby org is refused (403) for posture and SCIM tokens", async () => {
    await db.update(authTables.organizations).set({ plan: "hobby" }).where(eq(authTables.organizations.id, orgId));
    expect((await patch(ownerToken, { scimEnabled: true })).status).toBe(403);
    expect((await mintScim(ownerToken)).status).toBe(403);
    // restore for a clean teardown
    await db.update(authTables.organizations).set({ plan: "pro" }).where(eq(authTables.organizations.id, orgId));
  });

  it("PAT enforcement: with SSO enforced, a non-owner personal token is blocked (403) but the owner passes", async () => {
    // ssoEnforced was turned on above (provider exists). The admin PAT has no
    // active SSO session, so enforcement gates it; the owner is always exempt.
    const adminRes = await patch(adminToken, { scimEnabled: false });
    expect(adminRes.status).toBe(403);
    const ownerRes = await app.request(`/v1/orgs/${slug}/security`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerRes.status).toBe(200);
  });
});
