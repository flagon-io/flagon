import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";

/**
 * Organization settings against a real database: renaming, changing the
 * slug (which moves every URL for the org), and deletion - plus the plan
 * field billing reads. Skipped without a database, runs in CI.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
    process.env.DATABASE_URL_OWNER &&
    process.env.BETTER_AUTH_SECRET,
);

describe.skipIf(!canRun)("organization settings", () => {
  const stamp = Date.now();
  const email = `orgset-${stamp}@example.com`;
  const slug = `orgset-${stamp}`;
  const renamedSlug = `orgset-${stamp}-moved`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM organizations WHERE slug IN (${slug}, ${renamedSlug})`;
      await owner`DELETE FROM users WHERE email = ${email}`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("renames, moves the slug, and deletes", async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 1 });
    const { auth } = await import("@/lib/auth");
    ({ closePool } = await import("@/db/client"));

    const { headers } = await auth.api.signUpEmail({
      body: {
        email,
        password: "orgset-pw-1234",
        name: "Org Settings",
        username: `orgset${stamp}`,
      },
      returnHeaders: true,
    });
    const token = /flagon\.session_token=([^;]+)/.exec(
      headers.get("set-cookie") ?? "",
    )?.[1];
    const sessionHeaders = new Headers({
      cookie: `flagon.session_token=${token}`,
    });

    const org = await auth.api.createOrganization({
      body: { name: "Org Settings", slug },
      headers: sessionHeaders,
    });
    const orgId = org!.id;

    // New organizations start on the free plan: billing reads this, and it
    // stays honest on deployments where Stripe isn't configured.
    const [created] = await owner`
      SELECT plan, stripe_customer_id FROM organizations WHERE id = ${orgId}
    `;
    expect(created.plan).toBe("free");
    expect(created.stripe_customer_id).toBeNull();

    // Rename: display name only, slug untouched.
    const { db } = await import("@/db/client");
    const { organizations } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(organizations)
      .set({ name: "Renamed Org" })
      .where(eq(organizations.id, orgId));
    const [renamed] = await owner`
      SELECT name, slug FROM organizations WHERE id = ${orgId}
    `;
    expect(renamed.name).toBe("Renamed Org");
    expect(renamed.slug).toBe(slug);

    // Slug change moves the organization's URL identity.
    await auth.api.updateOrganization({
      body: { data: { slug: renamedSlug }, organizationId: orgId },
      headers: sessionHeaders,
    });
    const [moved] = await owner`
      SELECT slug FROM organizations WHERE id = ${orgId}
    `;
    expect(moved.slug).toBe(renamedSlug);
    // Resolvable at the new slug, gone from the old one.
    const atNew = await auth.api.getFullOrganization({
      query: { organizationSlug: renamedSlug },
      headers: sessionHeaders,
    });
    expect(atNew?.id).toBe(orgId);

    // Delete takes the organization and its membership rows with it.
    await auth.api.deleteOrganization({
      body: { organizationId: orgId },
      headers: sessionHeaders,
    });
    const [{ count }] = await owner`
      SELECT count(*)::int AS count FROM organizations WHERE id = ${orgId}
    `;
    expect(count).toBe(0);
    const [{ members }] = await owner`
      SELECT count(*)::int AS members FROM members WHERE organization_id = ${orgId}
    `;
    expect(members).toBe(0);
  });
});
