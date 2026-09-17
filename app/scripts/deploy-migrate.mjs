// Runs database migrations as part of a deploy build (Vercel `vercel-build`).
//
// `app` is Flagon's auth service, so its schema (BetterAuth core tables + our
// user_email table) has to exist before the new deployment serves traffic.
// Wiring it into the build means a migration that would fail also fails the
// deploy, so a broken schema never ships - the same contract the Go API uses.
//
// If DATABASE_URL is not set (e.g. a preview build with no database attached)
// we skip loudly and let the build proceed, rather than hard-failing on a
// missing dependency.
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.warn(
    "WARNING: DATABASE_URL is not set; skipping migrations. Auth will not work until it is configured.",
  );
  process.exit(0);
}

const steps = [
  // BetterAuth's own core tables (user, session, account, verification).
  "npx @better-auth/cli@latest migrate --yes",
  // Our custom migrations (currently the user_email table). Idempotent.
  "node scripts/migrate-user-emails.mjs",
];

for (const step of steps) {
  console.log(`> ${step}`);
  // shell:true with the whole command as one string (no separate args array)
  // is the portable form and avoids Node's DEP0190 warning.
  const result = spawnSync(step, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`migration step failed (${step}); failing the build.`);
    process.exit(result.status ?? 1);
  }
}

console.log("migrations complete.");
