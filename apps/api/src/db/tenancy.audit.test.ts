import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { findTenantRlsViolations } from "./tenancy-audit.js";

/**
 * The tenancy guarantee, made mechanical.
 *
 * Every table carrying organization_id must have RLS enabled, forced, and
 * backed by a policy unless it is deliberately classified as auth-layer data
 * in tenancy-audit.ts. The deploy verifier uses this same audit.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("tenancy: org tables enforce RLS", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    sql = postgres(DATABASE_URL as string, { max: 1 });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("every organization_id table has RLS forced + a policy (or is exempt)", async () => {
    const violations = await findTenantRlsViolations(sql);

    expect(
      violations,
      `Tenant tables carrying organization_id but missing forced RLS + a policy: ${violations.join(", ")}. Add an RLS policy or, if this is deliberately app-layer data, add it to AUTH_LAYER_EXEMPT with justification.`,
    ).toEqual([]);
  });
});
