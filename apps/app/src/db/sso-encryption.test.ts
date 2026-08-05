import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";

/**
 * The SSO provider secret columns (oidc_config / saml_config) must be encrypted
 * AT REST and transparently decrypted on read — the same path BetterAuth's
 * drizzle adapter uses. This proves the `encryptedText` customType round-trips
 * through drizzle: a plaintext write lands as `enc:v1:` ciphertext in Postgres,
 * and the drizzle read returns the original plaintext.
 *
 * Runs only with a migrated DB reachable.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("sso provider secrets are encrypted at rest", () => {
  let db: (typeof import("./client"))["db"];
  let schema: typeof import("./schema");
  let raw: ReturnType<typeof postgres>;

  const orgId = randomUUID();
  const providerRowId = randomUUID();
  const providerId = `sso-test-${orgId}`;
  const secret = JSON.stringify({ clientSecret: "sk_live_do_not_store_plain" });

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET ??= "sso-encryption-test-secret-32-chars-min";
    ({ db } = await import("./client"));
    schema = await import("./schema");
    raw = postgres(DATABASE_URL as string, { max: 1 });

    await db
      .insert(schema.organizations)
      .values({ id: orgId, name: "EncTest", slug: `enc-${orgId.slice(0, 8)}` });
    await db.insert(schema.ssoProviders).values({
      id: providerRowId,
      issuer: "https://idp.example.com",
      domain: "enc.test",
      providerId,
      organizationId: orgId,
      samlConfig: secret,
    });
  });

  afterAll(async () => {
    if (db) {
      await db.delete(schema.ssoProviders).where(eq(schema.ssoProviders.id, providerRowId));
      await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    }
    await raw?.end();
  });

  it("stores ciphertext in Postgres, not plaintext", async () => {
    const rows = await raw`SELECT saml_config FROM sso_providers WHERE id = ${providerRowId}`;
    const stored = rows[0]?.saml_config as string;
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(stored).not.toContain("sk_live_do_not_store_plain");
  });

  it("decrypts transparently on a drizzle read", async () => {
    const rows = await db
      .select({ samlConfig: schema.ssoProviders.samlConfig })
      .from(schema.ssoProviders)
      .where(eq(schema.ssoProviders.id, providerRowId));
    expect(rows[0]?.samlConfig).toBe(secret);
  });

  it("keeps the SQL column type as plain text (no migration change)", async () => {
    const rows = await raw`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'sso_providers' AND column_name = 'saml_config'
    `;
    expect(rows[0]?.data_type).toBe("text");
  });
});
