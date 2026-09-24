// One-time rename of BetterAuth's default singular tables (and our user_email
// table) to our plural naming convention. Runs BEFORE `better-auth migrate`, so
// the CLI finds the already-correctly-named tables instead of creating new empty
// ones. Idempotent: renames only when the old name exists and the new doesn't,
// so it's a no-op on fresh databases (BetterAuth then creates plural tables from
// the modelName config) and on already-migrated ones.
import { Client } from "pg";
import { pgConfig } from "./pg-config.mjs";

// Tables first, then their indexes (RENAME TABLE doesn't rename indexes).
const TABLE_RENAMES = [
  ["user", "users"],
  ["session", "sessions"],
  ["account", "accounts"],
  ["verification", "verifications"],
  ["twoFactor", "two_factors"],
  ["user_email", "user_emails"],
];

const INDEX_RENAMES = [
  ["user_email_user_id_idx", "user_emails_user_id_idx"],
  ["user_email_one_primary_per_user", "user_emails_one_primary_per_user"],
];

async function exists(client, kind, name) {
  if (kind === "table") {
    const { rows } = await client.query(
      `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1`,
      [name],
    );
    return rows.length > 0;
  }
  const { rows } = await client.query(
    `select 1 from pg_indexes where schemaname = 'public' and indexname = $1`,
    [name],
  );
  return rows.length > 0;
}

async function main() {
  const client = new Client(pgConfig());
  await client.connect();
  try {
    for (const [from, to] of TABLE_RENAMES) {
      if ((await exists(client, "table", from)) && !(await exists(client, "table", to))) {
        await client.query(`ALTER TABLE "${from}" RENAME TO "${to}"`);
        console.log(`renamed table ${from} -> ${to}`);
      }
    }
    for (const [from, to] of INDEX_RENAMES) {
      if ((await exists(client, "index", from)) && !(await exists(client, "index", to))) {
        await client.query(`ALTER INDEX "${from}" RENAME TO "${to}"`);
        console.log(`renamed index ${from} -> ${to}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
