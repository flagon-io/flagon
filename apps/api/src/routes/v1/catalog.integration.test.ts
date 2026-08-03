import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Catalog ops-level buildout — end-to-end over the real Hono app: project catalog
 * metadata (kind/domains/links + manual repo linking with provider parsing) and
 * project relations (add/list/remove + guards, from either endpoint).
 *
 * Runs only with a migrated DB reachable (CI, or locally with DATABASE_URL). Seeds
 * an isolated random org, like the other integration suites.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("catalog ops buildout", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `acme-${randomBytes(4).toString("hex")}`;
  const ownerId = randomUUID();
  const ownerToken = `flagon_pat_${randomBytes(24).toString("base64url")}`;

  const auth = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
  const post = (path: string, body: unknown) =>
    app.request(`/v1/orgs/${slug}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const patch = (path: string, body: unknown) =>
    app.request(`/v1/orgs/${slug}${path}`, { method: "PATCH", headers: auth, body: JSON.stringify(body) });
  const get = (path: string) =>
    app.request(`/v1/orgs/${slug}${path}`, { headers: { Authorization: `Bearer ${ownerToken}` } });
  const del = (path: string) =>
    app.request(`/v1/orgs/${slug}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${ownerToken}` } });

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "Acme", slug, plan: "pro" });
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
  });

  afterAll(async () => {
    if (!db) return;
    // project_relations cascade on project delete.
    await withOrg(orgId, (tx) => tx.delete(schema.projects).where(eq(schema.projects.organizationId, orgId)));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.userId, ownerId));
    await db.delete(authTables.members).where(eq(authTables.members.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
    await db.delete(authTables.users).where(eq(authTables.users.id, ownerId));
  });

  it("creates a project with catalog metadata and parses the repo URL", async () => {
    const res = await post("/projects", {
      name: "Web App",
      key: "web-app",
      kind: "service",
      description: "The storefront.",
      domains: ["Payments", "payments", "GROWTH"],
      links: [{ type: "runbook", url: "https://wiki.example.com/runbook" }],
      repoUrl: "https://github.com/acme/web-app",
    });
    expect(res.status).toBe(201);
    const { project } = await res.json();
    expect(project.kind).toBe("service");
    expect(project.repo).toEqual({
      url: "https://github.com/acme/web-app",
      provider: "github",
      name: "acme/web-app",
      defaultBranch: null,
      visibility: null,
    });
    // domains lowercased + deduped
    expect([...project.domains].sort()).toEqual(["growth", "payments"]);
    // link label defaults to null
    expect(project.links).toEqual([{ type: "runbook", label: null, url: "https://wiki.example.com/runbook" }]);
  });

  it("updates catalog metadata", async () => {
    await post("/projects", { name: "Bare", key: "bare" });
    const res = await patch("/projects/bare", {
      description: "Now described.",
      lifecycle: "ga",
      tier: "1",
      kind: "library",
      domains: ["core"],
      readme: "# Bare",
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()).project;
    expect(updated.kind).toBe("library");
    expect(updated.lifecycle).toBe("ga");
    expect(updated.domains).toEqual(["core"]);
  });

  it("clears the repo linkage when repoUrl is set to null", async () => {
    await post("/projects", { name: "Repo", key: "repo-proj", repoUrl: "https://gitlab.com/acme/thing" });
    const res = await patch("/projects/repo-proj", { repoUrl: null });
    const project = (await res.json()).project;
    expect(project.repo).toBeNull();
  });

  it("adds, lists, and removes a relation, with guards", async () => {
    await post("/projects", { name: "Ledger", key: "ledger" });
    // depends_on: web-app -> ledger
    const add = await post("/projects/web-app/relations", { type: "depends_on", targetKey: "ledger" });
    expect(add.status).toBe(201);

    // outgoing on the source
    const src = await (await get("/projects/web-app/relations")).json();
    expect(src.outgoing).toHaveLength(1);
    expect(src.outgoing[0].type).toBe("depends_on");
    expect(src.outgoing[0].project.key).toBe("ledger");
    const relationId = src.outgoing[0].id;

    // incoming on the target
    const tgt = await (await get("/projects/ledger/relations")).json();
    expect(tgt.incoming).toHaveLength(1);
    expect(tgt.incoming[0].project.key).toBe("web-app");

    // guards
    expect((await post("/projects/web-app/relations", { type: "depends_on", targetKey: "web-app" })).status).toBe(400);
    expect((await post("/projects/web-app/relations", { type: "depends_on", targetKey: "nope" })).status).toBe(400);
    expect((await post("/projects/web-app/relations", { type: "depends_on", targetKey: "ledger" })).status).toBe(409);

    // remove
    expect((await del(`/projects/web-app/relations/${relationId}`)).status).toBe(200);
    const after = await (await get("/projects/web-app/relations")).json();
    expect(after.outgoing).toHaveLength(0);
    // a bad id 404s rather than erroring
    expect((await del("/projects/web-app/relations/not-a-uuid")).status).toBe(404);
  });

  it("removes a relation from the target (incoming) side", async () => {
    await post("/projects", { name: "Search", key: "search" });
    await post("/projects/web-app/relations", { type: "depends_on", targetKey: "search" });
    const rels = await (await get("/projects/search/relations")).json();
    expect(rels.incoming).toHaveLength(1);
    const id = rels.incoming[0].id;
    // delete via the TARGET project (search), not the source (web-app)
    expect((await del(`/projects/search/relations/${id}`)).status).toBe(200);
    const after = await (await get("/projects/web-app/relations")).json();
    expect(
      after.outgoing.find((r: { project: { key: string } }) => r.project.key === "search"),
    ).toBeUndefined();
  });

  it("cascades relations when a related project is deleted", async () => {
    await post("/projects", { name: "Cache", key: "cache" });
    await post("/projects/web-app/relations", { type: "depends_on", targetKey: "cache" });
    expect((await del("/projects/cache")).status).toBe(200);
    const after = await (await get("/projects/web-app/relations")).json();
    expect(after.outgoing.find((r: { project: { key: string } }) => r.project.key === "cache")).toBeUndefined();
  });
});
