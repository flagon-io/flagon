import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

/**
 * Integration test proving tenant isolation is enforced by Postgres RLS, not by
 * application code. Runs only when a database is configured (local compose or
 * CI service); skipped otherwise so `npm run test` stays green without a DB.
 *
 *   npm run db:up && npm run db:migrate && npm run test
 */
const ownerUrl = process.env.DATABASE_URL_OWNER;
const appUrl = process.env.DATABASE_URL_APP;
const canRun = Boolean(ownerUrl && appUrl);

describe.skipIf(!canRun)("row-level security", () => {
  let owner: ReturnType<typeof postgres>;
  let withTenant: typeof import("./tenant").withTenant;
  let closePool: typeof import("./client").closePool;
  let schema: typeof import("./schema").schema;

  let orgA = "";
  let orgB = "";
  const tag = Date.now();

  beforeAll(async () => {
    owner = postgres(ownerUrl as string, { max: 1 });
    ({ withTenant } = await import("./tenant"));
    ({ closePool, schema } = await import("./client"));

    // Provisioning is a privileged (owner) operation: create two tenants...
    const [a] = await owner`
      INSERT INTO organizations (slug, name)
      VALUES (${`org-a-${tag}`}, 'Org A') RETURNING id
    `;
    const [b] = await owner`
      INSERT INTO organizations (slug, name)
      VALUES (${`org-b-${tag}`}, 'Org B') RETURNING id
    `;
    orgA = a.id;
    orgB = b.id;

    // ...each with one project.
    await owner`INSERT INTO projects (organization_id, slug, name) VALUES (${orgA}, 'a1', 'A One')`;
    await owner`INSERT INTO projects (organization_id, slug, name) VALUES (${orgB}, 'b1', 'B One')`;
  });

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM organizations WHERE id IN (${orgA}, ${orgB})`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("only sees its own tenant's rows", async () => {
    const a = await withTenant(orgA, (tx) => tx.select().from(schema.projects));
    expect(a.map((r) => r.slug)).toEqual(["a1"]);

    const b = await withTenant(orgB, (tx) => tx.select().from(schema.projects));
    expect(b.map((r) => r.slug)).toEqual(["b1"]);
  });

  it("denies by default when no tenant context is set", async () => {
    const { db } = await import("./client");
    const rows = await db.select().from(schema.projects);
    expect(rows).toHaveLength(0);
  });

  it("cannot write into another tenant (WITH CHECK)", async () => {
    await expect(
      withTenant(orgA, (tx) =>
        tx
          .insert(schema.projects)
          .values({ organizationId: orgB, slug: "hijack", name: "nope" }),
      ),
    ).rejects.toThrow();
  });

  it("can write within its own tenant", async () => {
    const slug = `a2-${tag}`;
    await withTenant(orgA, (tx) =>
      tx
        .insert(schema.projects)
        .values({ organizationId: orgA, slug, name: "A Two" }),
    );
    const rows = await withTenant(orgA, (tx) =>
      tx.select().from(schema.projects),
    );
    expect(rows.map((r) => r.slug)).toContain(slug);
  });
});
