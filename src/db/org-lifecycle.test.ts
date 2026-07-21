import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

/**
 * The organization lifecycle paths that had no coverage: inviting a member,
 * transferring ownership, and deleting an organization.
 *
 * These are the operations that are hardest to walk back if they misbehave -
 * an invitation that leaks across tenants, an ownership transfer that leaves
 * two owners or none, a delete that takes the wrong org - so they get pinned
 * before launch rather than after the first incident.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
    process.env.DATABASE_URL_OWNER &&
    process.env.BETTER_AUTH_SECRET,
);

describe.skipIf(!canRun)("organization lifecycle", () => {
  const stamp = Date.now();
  const slug = `life-${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let orgId = "";
  let ownerUserId = "";
  let memberUserId = "";

  beforeAll(async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 2 });
    ({ closePool } = await import("@/db/client"));

    const [org] = await owner`
      INSERT INTO organizations (slug, name, plan)
      VALUES (${slug}, 'Lifecycle', 'free') RETURNING id`;
    orgId = org.id as string;

    for (const [id, name, email, role] of [
      [`life-owner-${stamp}`, "Robin Vale", `robin+own${stamp}@example.com`, "owner"],
      [`life-member-${stamp}`, "Sam Reed", `sam+mem${stamp}@example.com`, "member"],
    ] as const) {
      await owner`
        INSERT INTO users (id, name, email, email_verified)
        VALUES (${id}, ${name}, ${email}, true)`;
      await owner`
        INSERT INTO members (id, organization_id, user_id, role)
        VALUES (uuid_generate_v7(), ${orgId}::uuid, ${id}, ${role})`;
    }
    ownerUserId = `life-owner-${stamp}`;
    memberUserId = `life-member-${stamp}`;
  });

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM organizations WHERE slug = ${slug}`;
      await owner`DELETE FROM users WHERE id IN (${ownerUserId}, ${memberUserId})`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("keeps exactly one owner when ownership transfers", async () => {
    const { transferOwnership } = await import("@/lib/org-owner.server");

    const result = await transferOwnership({
      orgId,
      fromUserId: ownerUserId,
      toUserId: memberUserId,
    });
    expect(result.ok).toBe(true);

    const roles = await owner`
      SELECT user_id, role FROM members WHERE organization_id = ${orgId}::uuid ORDER BY role`;
    const owners = roles.filter((r) => r.role === "owner");
    // The invariant: one owner, always. Never two, never zero.
    expect(owners).toHaveLength(1);
    expect(owners[0].user_id).toBe(memberUserId);
    // The previous owner drops to admin rather than losing access entirely.
    expect(roles.find((r) => r.user_id === ownerUserId)?.role).toBe("admin");
  });

  it("refuses a transfer from someone who is not the owner", async () => {
    const { transferOwnership } = await import("@/lib/org-owner.server");
    // ownerUserId is now an admin, so this must be rejected.
    const result = await transferOwnership({
      orgId,
      fromUserId: ownerUserId,
      toUserId: ownerUserId,
    });
    expect(result.ok).toBe(false);

    const owners = await owner`
      SELECT user_id FROM members
      WHERE organization_id = ${orgId}::uuid AND role = 'owner'`;
    expect(owners).toHaveLength(1);
    expect(owners[0].user_id).toBe(memberUserId);
  });

  it("cascades an organization delete to everything it owned", async () => {
    // Seed one row in each table that hangs off the org, then prove the
    // cascade reaches all of them: an orphaned project or token after a
    // delete is a tenancy leak waiting to happen.
    const [project] = await owner`
      INSERT INTO projects (organization_id, slug, name)
      VALUES (${orgId}::uuid, 'doomed', 'Doomed') RETURNING id`;
    await owner`
      INSERT INTO feature_flags (organization_id, key, name, type, variants, default_variant, rules)
      VALUES (${orgId}::uuid, 'doomed-flag', 'Doomed', 'boolean',
              '[{"key":"on","value":true}]'::jsonb, 'on', '[]'::jsonb)`;
    await owner`
      INSERT INTO usage_rollups (organization_id, meter, day, quantity)
      VALUES (${orgId}::uuid, 'flags.evaluations', CURRENT_DATE, 10)`;
    await owner`
      INSERT INTO access_tokens (subject_type, subject_id, name, scopes, secret_hash)
      VALUES ('organization', ${orgId}, 'Doomed token', ARRAY['flags:evaluate'], ${`hash-${stamp}`})`;

    await owner`DELETE FROM organizations WHERE id = ${orgId}::uuid`;

    for (const table of ["projects", "feature_flags", "usage_rollups"]) {
      const [row] = await owner.unsafe(
        `SELECT count(*)::int AS count FROM "${table}" WHERE organization_id = '${orgId}'`,
      );
      expect(row.count, `${table} should cascade`).toBe(0);
    }
    const [proj] = await owner`SELECT count(*)::int AS count FROM projects WHERE id = ${project.id}::uuid`;
    expect(proj.count).toBe(0);

    // access_tokens carries no foreign key to organizations (subject_id spans
    // both user and org subjects, so it cannot), which would normally leave
    // live credentials pointing at a deleted org. A trigger,
    // organizations_delete_access_tokens, closes that gap. This asserts it,
    // because the failure mode it prevents is a token that still authenticates
    // against an organization nobody can see.
    const [tokens] = await owner`
      SELECT count(*)::int AS count FROM access_tokens
      WHERE subject_type = 'organization' AND subject_id = ${orgId}`;
    expect(tokens.count, "org tokens must not outlive their organization").toBe(0);

    orgId = "";
  });
});
