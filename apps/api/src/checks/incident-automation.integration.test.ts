import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Incident automation end-to-end against a real DB: a Pro check with automation on and a
 * linked service OPENS an incident on the first failing run, and RESOLVES it on recovery.
 * Drives the shared recordRun path (the same one the sweep uses).
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("checks incident automation", () => {
  let db: typeof import("../db/client.js")["db"];
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let authTables: typeof import("../db/auth-tables.js");
  let schema: typeof import("../db/schema.js");
  let recordRun: typeof import("./runner.js")["recordRun"];

  const orgId = randomUUID();
  const slug = `ia-${randomBytes(4).toString("hex")}`;
  const projectId = randomUUID();
  const checkId = randomUUID();

  async function loadCheck() {
    const [row] = await withOrg(orgId, (tx) =>
      tx.select().from(schema.checks).where(eq(schema.checks.id, checkId)).limit(1),
    );
    return row!;
  }

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    ({ withOrg } = await import("../db/tenant.js"));
    authTables = await import("../db/auth-tables.js");
    schema = await import("../db/schema.js");
    ({ recordRun } = await import("./runner.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "IA", slug, plan: "pro" });
    await withOrg(orgId, (tx) =>
      tx.insert(schema.projects).values({ id: projectId, organizationId: orgId, key: "web", name: "Web" }),
    );
    await withOrg(orgId, (tx) =>
      tx.insert(schema.checks).values({
        id: checkId,
        organizationId: orgId,
        key: "home",
        name: "Home",
        type: "url",
        family: "uptime",
        config: { url: "http://127.0.0.1:9" },
        incidentAutomation: true,
        linkedProjectId: projectId,
      }),
    );
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) => tx.delete(schema.checks).where(eq(schema.checks.organizationId, orgId)));
    await withOrg(orgId, (tx) => tx.delete(schema.incidents).where(eq(schema.incidents.organizationId, orgId)));
    await withOrg(orgId, (tx) => tx.delete(schema.projects).where(eq(schema.projects.organizationId, orgId)));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
  });

  it("opens an incident on the first failing run", async () => {
    const check = await loadCheck();
    const { transition } = await recordRun(orgId, slug, check, {
      status: "failing",
      latencyMs: null,
      error: { code: "ECONNREFUSED", message: "connection refused" },
    });
    expect(transition.fire).toBe("alert");

    const after = await loadCheck();
    expect(after.openIncidentId).toBeTruthy();

    const incidents = await withOrg(orgId, (tx) =>
      tx.select().from(schema.incidents).where(eq(schema.incidents.organizationId, orgId)),
    );
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.resolvedAt).toBeNull();

    const services = await withOrg(orgId, (tx) =>
      tx.select().from(schema.incidentServices).where(eq(schema.incidentServices.incidentId, incidents[0]!.id)),
    );
    expect(services[0]!.projectId).toBe(projectId);
  });

  it("does not open a second incident while one is open", async () => {
    const check = await loadCheck();
    await recordRun(orgId, slug, check, {
      status: "failing",
      latencyMs: null,
      error: { code: "ECONNREFUSED", message: "still refused" },
    });
    const incidents = await withOrg(orgId, (tx) =>
      tx.select().from(schema.incidents).where(eq(schema.incidents.organizationId, orgId)),
    );
    expect(incidents).toHaveLength(1);
  });

  it("resolves the incident on recovery", async () => {
    const check = await loadCheck();
    const { transition } = await recordRun(orgId, slug, check, { status: "passing", latencyMs: 12 });
    expect(transition.fire).toBe("recovery");

    const after = await loadCheck();
    expect(after.openIncidentId).toBeNull();

    const incidents = await withOrg(orgId, (tx) =>
      tx.select().from(schema.incidents).where(eq(schema.incidents.organizationId, orgId)),
    );
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.status).toBe("resolved");
    expect(incidents[0]!.resolvedAt).not.toBeNull();
  });
});
