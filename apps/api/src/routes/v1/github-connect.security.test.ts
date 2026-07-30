import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Security regression for the GitHub connect flow. The setup endpoint must never
 * bind an installation the caller cannot prove they control on GitHub — otherwise
 * a manager of any org could enumerate installation ids and attach (and read the
 * repos of) another tenant's installation. We mock only the GitHub network calls
 * (code exchange, /user/installations, installation metadata); the state signing
 * and every authorization check run for real.
 *
 * Runs only with a migrated DB reachable (CI, or locally with DATABASE_URL).
 */
vi.mock("../../lib/github.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/github.js")>();
  return {
    ...actual,
    isGithubConfigured: () => true,
    isGithubOAuthConfigured: () => true,
    exchangeUserCode: vi.fn(async () => "user-token"),
    listUserInstallationIds: vi.fn(async () => [] as string[]),
    getInstallation: vi.fn(async () => ({
      installationId: "999",
      accountLogin: "victim-org",
      accountType: "Organization" as const,
      accountAvatarUrl: null,
    })),
  };
});

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("GitHub connect ownership guard", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let github: typeof import("../../lib/github.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  // github_installations is a FORCE-RLS tenant table, so it is only visible with
  // an org context set — read it the same way the route writes it.
  const installationRows = (installationId: string) =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(schema.githubInstallations)
        .where(
          and(
            eq(schema.githubInstallations.organizationId, orgId),
            eq(schema.githubInstallations.installationId, installationId),
          ),
        ),
    );

  const orgId = randomUUID();
  const slug = `acme-${randomBytes(4).toString("hex")}`;
  // A manager (owner) and a plain member of the same org, each with a personal token.
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;
  const memberToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;

  const post = (body: unknown, token: string) =>
    app.request("/v1/integrations/github/setup", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    github = await import("../../lib/github.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

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
      {
        id: randomUUID(),
        type: "personal",
        name: "owner pat",
        tokenHash: hashToken(ownerToken),
        prefix: "flagon_pat",
        lastFour: ownerToken.slice(-4),
        userId: ownerId,
      },
      {
        id: randomUUID(),
        type: "personal",
        name: "member pat",
        tokenHash: hashToken(memberToken),
        prefix: "flagon_pat",
        lastFour: memberToken.slice(-4),
        userId: memberId,
      },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) =>
      tx.delete(schema.githubInstallations).where(eq(schema.githubInstallations.organizationId, orgId)),
    );
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, memberId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
    await db.delete(authTables.users).where(eq(authTables.users.id, memberId));
  });

  it("rejects an installation the caller does not control (the IDOR guard)", async () => {
    // The owner is a manager, but their GitHub token cannot access installation 999.
    (github.listUserInstallationIds as unknown as Mock).mockResolvedValue(["111"]);
    const state = github.signConnectState(slug, "999");

    const res = await post({ state, code: "any" }, ownerToken);

    expect(res.status).toBe(403);
    expect(await installationRows("999")).toHaveLength(0);
  });

  it("rejects a non-manager even when they control the installation", async () => {
    (github.listUserInstallationIds as unknown as Mock).mockResolvedValue(["999"]);
    const state = github.signConnectState(slug, "999");

    const res = await post({ state, code: "any" }, memberToken);

    expect(res.status).toBe(403);
  });

  it("records the installation when the caller is a manager who controls it", async () => {
    (github.listUserInstallationIds as unknown as Mock).mockResolvedValue(["999"]);
    const state = github.signConnectState(slug, "999");

    const res = await post({ state, code: "any" }, ownerToken);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgSlug: slug });
    const rows = await installationRows("999");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.accountLogin).toBe("victim-org");
  });

  it("rejects a tampered/garbage state", async () => {
    const res = await post({ state: "not-a-real-state", code: "any" }, ownerToken);
    expect(res.status).toBe(400);
  });
});
