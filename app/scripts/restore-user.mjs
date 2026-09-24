// Restore a soft-deleted account (support/admin action). Clears the app's
// deletedAt so the user can sign in again, and mirrors the state to the API so
// their public profile reappears.
//
//   node --env-file-if-exists=.env.local scripts/restore-user.mjs <email-or-username>
//   RESTORE_LOGIN=someone@example.com node scripts/restore-user.mjs
//
// Read-only preview of who would be restored, add --dry-run.
import { Client } from "pg";
import { pgConfig } from "./pg-config.mjs";

const login = process.argv.find((a) => !a.startsWith("-") && a.includes("@"))
  ?? process.argv[2]
  ?? process.env.RESTORE_LOGIN;
const dryRun = process.argv.includes("--dry-run");

if (!login) {
  console.error("Usage: restore-user.mjs <email-or-username> [--dry-run]");
  process.exit(1);
}

const client = new Client(pgConfig());

async function main() {
  await client.connect();
  const isEmail = login.includes("@");
  const { rows } = await client.query(
    isEmail
      ? `select id, email, username, "deletedAt" from users where email = $1`
      : `select id, email, username, "deletedAt" from users where username = $1`,
    [login],
  );
  const user = rows[0];
  if (!user) {
    console.error(`No user found for ${isEmail ? "email" : "username"} "${login}".`);
    process.exit(1);
  }
  if (!user.deletedAt) {
    console.log(`${user.email} (${user.username ?? "no username"}) is already active. Nothing to do.`);
    return;
  }
  console.log(`Restoring ${user.email} (${user.username ?? "no username"}), deleted ${user.deletedAt}.`);
  if (dryRun) {
    console.log("--dry-run: no changes made.");
    return;
  }

  await client.query(`update users set "deletedAt" = null, "updatedAt" = now() where id = $1`, [user.id]);

  // Mirror to the API so the public profile is visible again (best-effort).
  const apiUrl = (process.env.FLAGON_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
  const token = process.env.FLAGON_INTERNAL_TOKEN ?? "";
  if (token) {
    try {
      await fetch(`${apiUrl}/me/deleted`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Flagon-User-Id": user.id,
          "X-Flagon-User-Email": user.email,
        },
        body: JSON.stringify({ deleted: false }),
      });
    } catch (err) {
      console.warn("Could not mirror to API (restore still applied to auth DB):", err.message);
    }
  } else {
    console.warn("FLAGON_INTERNAL_TOKEN not set: skipped API mirror.");
  }

  console.log(`Restored ${user.email}. They can sign in again.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
