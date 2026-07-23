import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The guard refuses a connection that can bypass RLS.
 *
 * connection-role.test.ts asserts the REAL app connection is restricted. This
 * asserts the opposite direction: that when the connection is wrong, the guard
 * actually stops it. A check that has never been observed failing is not a
 * check - it is a comment that happens to compile.
 *
 * The scenario is the realistic one, not a contrived one: DATABASE_URL_APP
 * pointing at the owner. That is exactly what a Vercel deploy gets if
 * FLAGON_APP_PASSWORD is missing and libpq's PG* defaults take over, and it is
 * indistinguishable from a healthy deploy in every other respect.
 */
const ownerUrl = process.env.DATABASE_URL_OWNER;
const canRun = Boolean(ownerUrl);

/**
 * Outside production the client caches its pool on globalThis so Next's hot
 * reload does not leak a pool per recompile. `vi.resetModules()` does not clear
 * globalThis, so without this each test would silently reuse - and then use
 * past the close of - the previous test's pool.
 */
function clearCachedPool(): void {
  delete (globalThis as { __flagonPgClient?: unknown }).__flagonPgClient;
}

describe.skipIf(!canRun)("RLS guard", () => {
  beforeEach(() => {
    vi.resetModules();
    clearCachedPool();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    clearCachedPool();
  });

  it("rejects a tenant query when connected as a role that bypasses RLS", async () => {
    vi.stubEnv("DATABASE_URL_APP", ownerUrl as string);

    const { assertRestrictedRole, closePool } = await import("./client");
    await expect(assertRestrictedRole()).rejects.toThrow(
      /can bypass row-level security/,
    );
    await closePool();
  });

  it("blocks withTenant, so no cross-tenant data is served", async () => {
    vi.stubEnv("DATABASE_URL_APP", ownerUrl as string);

    const { withTenant } = await import("./tenant");
    const { closePool } = await import("./client");

    // The callback must never run: the guard has to fail BEFORE any query, not
    // report afterwards. A post-hoc alarm would have already leaked the rows.
    const ran = vi.fn();
    await expect(
      withTenant("00000000-0000-0000-0000-000000000000", async () => {
        ran();
        return null;
      }),
    ).rejects.toThrow(/bypass row-level security/);
    expect(ran).not.toHaveBeenCalled();

    await closePool();
  });

  it("reports the problem through the health probe rather than throwing", async () => {
    vi.stubEnv("DATABASE_URL_APP", ownerUrl as string);

    const { connectionIdentity, closePool } = await import("./client");
    const identity = await connectionIdentity();

    // The probe must keep answering: an endpoint that 500s tells you something
    // is wrong, but not what, and that is the whole reason it exists.
    expect("role" in identity).toBe(true);
    if ("role" in identity) {
      expect(identity.bypassesRls || identity.superuser).toBe(true);
    }
    await closePool();
  });

  it("refuses to connect at all when nothing is configured", async () => {
    // The dangerous case: postgres("") silently falls back to PGHOST/PGUSER,
    // which on a Neon/Vercel deployment are the OWNER.
    vi.stubEnv("DATABASE_URL_APP", "");
    vi.stubEnv("POSTGRES_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("FLAGON_APP_PASSWORD", "");

    const { assertRestrictedRole } = await import("./client");
    await expect(assertRestrictedRole()).rejects.toThrow(
      /No application database URL/,
    );
  });
});
