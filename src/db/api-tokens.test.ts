import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

/**
 * The API token system, against a real database.
 *
 * These are the properties that decide whether a leaked credential is a
 * contained incident or a breach, so each is pinned rather than assumed: a
 * token must not exceed its scopes, must not reach another organization, must
 * not outrun the person behind it, and must never be able to mint another
 * token.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
  process.env.DATABASE_URL_OWNER &&
  process.env.BETTER_AUTH_SECRET,
);

const BASE = "https://api.flagon.io";

describe.skipIf(!canRun)("api tokens", () => {
  const stamp = Date.now();
  const slugA = `tok-a-${stamp}`;
  const slugB = `tok-b-${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let orgA = "";
  let orgB = "";

  beforeAll(async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 3 });
    ({ closePool } = await import("@/db/client"));
    const [a] = await owner`
      INSERT INTO organizations (slug, name) VALUES (${slugA}, 'Org A') RETURNING id`;
    const [b] = await owner`
      INSERT INTO organizations (slug, name) VALUES (${slugB}, 'Org B') RETURNING id`;
    orgA = a.id as string;
    orgB = b.id as string;
  });

  afterAll(async () => {
    if (owner) {
      for (const id of [orgA, orgB]) {
        if (id) await owner`DELETE FROM access_tokens WHERE subject_id = ${id}`;
      }
      await owner`DELETE FROM organizations WHERE slug IN (${slugA}, ${slugB})`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  const get = (token: string, slug: string, path = "usage/evaluations") =>
    new Request(`${BASE}/api/v1/orgs/${slug}/${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });

  it("implies read from write, and nothing across resources", async () => {
    const { satisfiesScope } = await import("@/lib/access-tokens.server");
    expect(satisfiesScope(["usage:read"], "usage:read")).toBe(true);
    // A write scope covers its own read...
    expect(satisfiesScope(["projects:write"], "projects:read")).toBe(true);
    // ...but never another resource, or a token scoped to one product would
    // quietly become a reader of the whole organization.
    expect(satisfiesScope(["flags:write"], "projects:read")).toBe(false);
    expect(satisfiesScope(["projects:read"], "projects:write")).toBe(false);
  });

  it("refuses a valid token that lacks the scope, distinctly from a bad one", async () => {
    const { createAccessToken } = await import("@/lib/access-tokens.server");
    const { GET } =
      await import("@/app/api/v1/orgs/[slug]/usage/evaluations/route");
    const params = { params: Promise.resolve({ slug: slugA }) };

    const wrong = await createAccessToken({
      subjectType: "organization",
      subjectId: orgA,
      name: "Flags only",
      scopes: ["flags:evaluate"],
    });
    if (!wrong.ok) throw new Error("token not created");

    // 403 with a named scope, NOT 401: a scope mistake and a bad credential
    // must not look the same, or every debugging session starts in the wrong
    // place.
    const denied = await GET(get(wrong.token, slugA), params);
    expect(denied.status).toBe(403);
    const body = await denied.json();
    expect(body.code).toBe("insufficient_scope");
    expect(body.message).toContain("usage:read");

    // A garbage credential is a 401.
    const bogus = await GET(get("flagon_org_nonsense", slugA), params);
    expect(bogus.status).toBe(401);

    const right = await createAccessToken({
      subjectType: "organization",
      subjectId: orgA,
      name: "Usage",
      scopes: ["usage:read"],
    });
    if (!right.ok) throw new Error("token not created");
    expect((await GET(get(right.token, slugA), params)).status).toBe(200);
  });

  it("binds an organization token to exactly one organization", async () => {
    const { createAccessToken } = await import("@/lib/access-tokens.server");
    const { GET } =
      await import("@/app/api/v1/orgs/[slug]/usage/evaluations/route");

    const token = await createAccessToken({
      subjectType: "organization",
      subjectId: orgA,
      name: "A only",
      scopes: ["usage:read"],
    });
    if (!token.ok) throw new Error("token not created");

    expect(
      (
        await GET(get(token.token, slugA), {
          params: Promise.resolve({ slug: slugA }),
        })
      ).status,
    ).toBe(200);

    // Pointing it at another org must be indistinguishable from that org not
    // existing: a 403 would confirm the slug is real.
    const crossed = await GET(get(token.token, slugB), {
      params: Promise.resolve({ slug: slugB }),
    });
    expect(crossed.status).toBe(404);
  });

  it("gives a personal token only what its owner already has", async () => {
    const { createAccessToken } = await import("@/lib/access-tokens.server");
    const { GET } =
      await import("@/app/api/v1/orgs/[slug]/usage/evaluations/route");

    const [user] = await owner`
      INSERT INTO users (id, name, email, email_verified)
      VALUES (${`u-${stamp}`}, 'Robin Vale', ${`robin+tok${stamp}@example.com`}, true)
      RETURNING id`;
    const userId = user.id as string;

    const pat = await createAccessToken({
      subjectType: "user",
      subjectId: userId,
      name: "Robin CLI",
      scopes: ["usage:read"],
    });
    if (!pat.ok) throw new Error("token not created");

    // Not a member yet: the org must look like it does not exist, even though
    // the scope is right and the org is real.
    expect(
      (
        await GET(get(pat.token, slugA), {
          params: Promise.resolve({ slug: slugA }),
        })
      ).status,
    ).toBe(404);

    await owner`
      INSERT INTO members (id, organization_id, user_id, role)
      VALUES (uuid_generate_v7(), ${orgA}::uuid, ${userId}, 'member')`;

    expect(
      (
        await GET(get(pat.token, slugA), {
          params: Promise.resolve({ slug: slugA }),
        })
      ).status,
    ).toBe(200);

    // Membership ending ends the token's reach, without revoking the token.
    await owner`DELETE FROM members WHERE organization_id = ${orgA}::uuid AND user_id = ${userId}`;
    expect(
      (
        await GET(get(pat.token, slugA), {
          params: Promise.resolve({ slug: slugA }),
        })
      ).status,
    ).toBe(404);

    await owner`DELETE FROM access_tokens WHERE subject_id = ${userId}`;
    await owner`DELETE FROM users WHERE id = ${userId}`;
  });

  it("never lets a token manage tokens", async () => {
    const { createAccessToken } = await import("@/lib/access-tokens.server");
    const { GET } = await import("@/app/api/v1/orgs/[slug]/tokens/route");

    // Deliberately the broadest token available: even org:write must not open
    // the credential surface, or a leak could never be contained.
    const token = await createAccessToken({
      subjectType: "organization",
      subjectId: orgA,
      name: "Everything",
      scopes: [
        "org:write",
        "flags:write",
        "projects:write",
        "members:write",
        "usage:read",
      ],
    });
    if (!token.ok) throw new Error("token not created");

    const response = await GET(get(token.token, slugA, "tokens"), {
      params: Promise.resolve({ slug: slugA }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("session_required");
  });

  it("records last use so a stale credential is visible", async () => {
    const { createAccessToken, authenticateToken } =
      await import("@/lib/access-tokens.server");
    const created = await createAccessToken({
      subjectType: "organization",
      subjectId: orgA,
      name: "Used",
      scopes: ["usage:read"],
    });
    if (!created.ok) throw new Error("token not created");
    expect(created.accessToken.lastUsedAt).toBeNull();

    await authenticateToken(`Bearer ${created.token}`);
    // The write is fire-and-forget so it never delays the request it
    // describes; give it a moment to land.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const [row] = await owner`
      SELECT last_used_at FROM access_tokens WHERE id = ${created.accessToken.id}::uuid`;
    expect(row.last_used_at).not.toBeNull();
  });
});
