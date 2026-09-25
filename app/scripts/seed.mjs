// Seeds a demo user with a STATIC password for local development and automated
// tests, plus a baseline organization the user owns. Idempotent: re-running
// resets the password, re-verifies the email, and re-ensures the org, so the
// login flow (email or username + password) always lands somewhere real.
//
//   npm run db:seed
//
// Override any field with env vars:
//   SEED_EMAIL, SEED_USERNAME, SEED_PASSWORD, SEED_NAME
//   SEED_ORG_NAME, SEED_ORG_SLUG
//   SEED_SKIP_ORG=1  seed only the user, with no org (the e2e suite's org owner,
//                    who must stay under the free owned-org limit)
//
// The user + credential live in the app's auth DB (this script writes them
// directly). The ORG is a domain resource owned by the Go API, so we create it
// through the API's POST /orgs - the single writer of domain data - forwarding
// the demo user's identity exactly as the app gateway would. That exercises the
// real creation path (slug rules, membership, RLS) instead of duplicating it.
//
// Password hashing goes through BetterAuth's own `hashPassword` (better-auth/
// crypto), so the credential this writes is byte-for-byte what a real sign-up
// would produce - the app has no idea it was seeded.
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { pgConfig } from "./pg-config.mjs";
import { hashPassword } from "better-auth/crypto";

const email = process.env.SEED_EMAIL ?? "demo@flagon.dev";
const username = process.env.SEED_USERNAME ?? "demo";
const password = process.env.SEED_PASSWORD ?? "password12345";
const name = process.env.SEED_NAME ?? "Demo User";
const orgName = process.env.SEED_ORG_NAME ?? "Demo Org";
const orgSlug = process.env.SEED_ORG_SLUG ?? "demo";

// Guard against pointing this at a real database by accident. Local dev sets no
// NODE_ENV (or "development"); set SEED_ALLOW_PROD=1 to override deliberately.
if (process.env.NODE_ENV === "production" && !process.env.SEED_ALLOW_PROD) {
  console.error("Refusing to seed with NODE_ENV=production (set SEED_ALLOW_PROD=1 to override).");
  process.exit(1);
}

async function main() {
  const client = new Client(pgConfig());
  await client.connect();

  let userId;
  try {
    await client.query("begin");

    // 1. Upsert the BetterAuth user, verified so login needs no OTP step.
    const { rows } = await client.query(
      `insert into users (id, name, email, "emailVerified", username, "displayUsername", "createdAt", "updatedAt")
       values ($1, $2, $3, true, $4, $5, now(), now())
       on conflict (email) do update
         set "emailVerified" = true,
             name = excluded.name,
             username = coalesce(users.username, excluded.username),
             "displayUsername" = coalesce(users."displayUsername", excluded."displayUsername"),
             "updatedAt" = now()
       returning id`,
      [randomUUID(), name, email, username, username],
    );
    userId = rows[0].id;

    // 2. Upsert the credential account holding the password hash. BetterAuth
    //    stores password logins under providerId 'credential' with accountId =
    //    the user id. (The account table has no unique key to ON CONFLICT on,
    //    so update-then-insert.)
    const hash = await hashPassword(password);
    const updated = await client.query(
      `update accounts set password = $2, "updatedAt" = now()
       where "userId" = $1 and "providerId" = 'credential'`,
      [userId, hash],
    );
    if (updated.rowCount === 0) {
      await client.query(
        `insert into accounts (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         values ($1, $2, 'credential', $2, $3, now(), now())`,
        [randomUUID(), userId, hash],
      );
    }

    // 3. Mirror into our multi-email table as the verified primary address.
    await client.query(
      `insert into user_emails (id, user_id, email, verified, is_primary)
       values ($1, $2, $3, true, true)
       on conflict (email) do update set verified = true, updated_at = now()`,
      [randomUUID(), userId, email],
    );

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    await client.end();
  }

  console.log("Seeded demo user (log in with email OR username):");
  console.log(`  email:    ${email}`);
  console.log(`  username: ${username}`);
  console.log(`  password: ${password}`);

  if (process.env.SEED_SKIP_ORG) {
    console.log("\nSkipped org (SEED_SKIP_ORG is set).");
    return;
  }
  await seedOrg(userId);
}

// Creates the baseline org through the Go API (POST /orgs), forwarding the demo
// user's identity the same way the app gateway does. Idempotent (a taken slug is
// treated as already-seeded) and non-fatal: if the API is down, the user seed
// still counts - we just print how to finish the org.
async function seedOrg(userId) {
  const apiUrl = (process.env.FLAGON_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
  // Same rule as the app: the public development token only outside production.
  const token =
    process.env.FLAGON_INTERNAL_TOKEN?.trim() ||
    (process.env.NODE_ENV === "production" ? "" : "dev-internal-token");

  if (!token) {
    console.warn(`\nSkipped demo org: FLAGON_INTERNAL_TOKEN is not set.`);
    return;
  }

  let res;
  try {
    res = await fetch(`${apiUrl}/orgs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Flagon-User-Id": userId,
        "X-Flagon-User-Email": email,
      },
      body: JSON.stringify({ name: orgName, slug: orgSlug }),
    });
  } catch (err) {
    console.warn(`\nSkipped demo org: could not reach the API at ${apiUrl} (${err.cause?.code ?? err.message}).`);
    console.warn(`Start it with 'cd api && go run ./cmd/flagon-server serve', then re-run 'npm run db:seed'.`);
    return;
  }

  if (res.status === 201) {
    const org = await res.json().catch(() => null);
    console.log(`\nSeeded demo org: ${orgName}  ->  /${org?.slug ?? orgSlug}`);
    return;
  }
  if (res.status === 409) {
    console.log(`\nDemo org already exists  ->  /${orgSlug}`);
    return;
  }
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  console.warn(`\nCould not create demo org (HTTP ${res.status}). ${detail}`.trimEnd());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
