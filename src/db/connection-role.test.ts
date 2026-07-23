import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { resolveAppUrl } from "../../scripts/db-urls.mjs";

/**
 * The connection is what it claims to be.
 *
 * src/db/tenancy.test.ts proves the POLICIES are right. This proves the thing
 * policies cannot: that the application actually connects as a role those
 * policies apply to.
 *
 * That distinction matters because the failure mode is silent. A deploy that
 * connects as the owner runs every query successfully, returns correct-looking
 * data, and has no tenant isolation whatsoever - there is no error to notice
 * and no request that fails. It is a configuration mistake, so it is caught by
 * asking the database who we are, not by reading code.
 */
const appUrl = process.env.DATABASE_URL_APP;
const canRun = Boolean(appUrl);

describe.skipIf(!canRun)("application database connection", () => {
  let app: ReturnType<typeof postgres>;

  beforeAll(() => {
    app = postgres(appUrl as string, { max: 1 });
  });

  afterAll(async () => {
    await app?.end();
  });

  it("cannot bypass row-level security", async () => {
    const [role] = await app`
      SELECT current_user AS name, rolbypassrls, rolsuper
      FROM pg_roles WHERE rolname = current_user
    `;
    expect(
      role.rolbypassrls,
      `${role.name} can bypass RLS: tenant isolation would be absent`,
    ).toBe(false);
    expect(
      role.rolsuper,
      `${role.name} is a superuser: tenant isolation would be absent`,
    ).toBe(false);
  });

  it("is not the owner of the tables it queries", async () => {
    // An owner is exempt from RLS on its own tables unless FORCE is set, so
    // "not superuser, not bypassrls" is necessary but not sufficient.
    const [{ owns }] = await app`
      SELECT count(*)::int AS owns
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND pg_get_userbyid(c.relowner) = current_user
    `;
    expect(owns, "the app role owns tables, so RLS may not apply to them").toBe(
      0,
    );
  });

  /**
   * Deny-by-default, demonstrated rather than assumed: with no tenant GUC set,
   * a tenant table returns nothing at all. If this ever returns rows, either a
   * policy is wrong or the connection is not the restricted role.
   */
  it("sees no tenant rows without a tenant context", async () => {
    const [{ visible }] = await app`
      SELECT count(*)::int AS visible FROM projects
    `;
    expect(visible).toBe(0);
  });
});

/**
 * The resolver must never produce a connection that silently falls through to
 * libpq's PG* environment defaults - which, on a Neon/Vercel deployment, are
 * the owner.
 */
describe("app URL resolution", () => {
  /** The resolver reads a plain env bag; NODE_ENV is irrelevant to it. */
  const env = (vars: Record<string, string>) =>
    vars as unknown as NodeJS.ProcessEnv;

  it("returns null rather than an empty string when unconfigured", () => {
    expect(resolveAppUrl(env({}))).toBeNull();
    // A base URL with no app password is NOT enough: swapping in the role name
    // without its password would fail, and falling back would be worse.
    expect(
      resolveAppUrl(env({ POSTGRES_URL: "postgres://owner:pw@host/db" })),
    ).toBeNull();
  });

  it("prefers the explicit app URL", () => {
    expect(
      resolveAppUrl(
        env({
          DATABASE_URL_APP: "postgres://flagon_app:pw@host/db",
          POSTGRES_URL: "postgres://owner:pw@host/db",
        }),
      ),
    ).toBe("postgres://flagon_app:pw@host/db");
  });

  it("derives the app role from an owner URL plus the app password", () => {
    const url = resolveAppUrl(
      env({
        POSTGRES_URL: "postgres://owner:ownerpw@host/db",
        FLAGON_APP_PASSWORD: "apppw",
      }),
    );
    expect(url).toContain("flagon_app:apppw@");
    expect(url).not.toContain("owner:ownerpw");
  });
});
