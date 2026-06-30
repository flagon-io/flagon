// Vercel build entrypoint. Runs database migrations on PRODUCTION deploys
// (i.e. pushes to `main`) before building, then always builds.
//
// Vercel sets VERCEL_ENV to "production" for the production branch, "preview"
// for other branches, and leaves it unset locally. We only migrate in
// production so preview deploys never mutate the production schema. Set
// DIRECT_DATABASE_URL (Neon's non-pooled URL) in the Vercel project env so the
// migrator uses a direct connection.

import { execSync } from 'node:child_process';

const env = process.env.VERCEL_ENV ?? 'local';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (env === 'production') {
  console.log('[vercel-build] production deploy → applying migrations + RLS');
  run('pnpm db:migrate');
} else {
  console.log(`[vercel-build] VERCEL_ENV=${env} → skipping migrations`);
}

run('next build');
