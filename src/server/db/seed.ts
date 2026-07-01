/**
 * Demo seed. Creates a founder login + the sudo org ("flagon") with its default
 * environments (Production, Staging) and one project, then prints the login.
 *
 * This is the Catalog baseline; Feature Flags and the other capabilities seed
 * their own demo data once they are rebuilt on this substrate.
 *
 * Idempotent: it deletes the demo org and founder user (cascading children) first.
 *
 *   pnpm db:seed
 */

import { eq } from 'drizzle-orm';
import { db, withTenant } from '@/server/db';
import { uuidv7 } from '@/server/db/id';
import { members, organizations, teamMembers, teams, users } from '@/server/db/schema/auth';
import { projects } from '@/server/db/schema/app';
import { seedDefaultEnvironments } from '@/server/environments/defaults';

// The demo org is the sudo org ("flagon"), so the seeded founder gets sudo
// access via membership.
const DEMO_SLUG = 'flagon';
const DEMO_NAME = 'Flagon';
const FOUNDER = {
  name: 'Flagon',
  username: 'flagon',
  email: 'flagon@flagon.local',
  password: 'flagon123',
};

async function main() {
  // Load .env before anything reads it (auth/db read env lazily on first use).
  try {
    process.loadEnvFile();
  } catch {
    /* no .env file - rely on the ambient environment */
  }

  // Import auth AFTER env is loaded so its config captures the real secret.
  const { auth } = await import('@/server/auth');

  console.log('[seed] resetting demo org + founder…');
  await db.delete(organizations).where(eq(organizations.slug, DEMO_SLUG));
  await db.delete(users).where(eq(users.email, FOUNDER.email));

  const orgId = uuidv7();
  const teamId = uuidv7();
  await db.insert(organizations).values({ id: orgId, name: DEMO_NAME, slug: DEMO_SLUG });

  // Direct insert bypasses the org plugin's afterCreate hook + default-team
  // creation, so seed the envs and a default team here.
  await seedDefaultEnvironments(orgId);
  await db.insert(teams).values({ id: teamId, name: 'Default', organizationId: orgId });

  await withTenant(orgId, (tx) =>
    tx
      .insert(projects)
      .values({ id: uuidv7(), organizationId: orgId, teamId, name: 'Web App', slug: 'web' }),
  );

  // Create the founder login through BetterAuth so the password is hashed
  // correctly, then add them to the demo org as owner.
  await auth.api.signUpEmail({
    body: {
      name: FOUNDER.name,
      email: FOUNDER.email,
      password: FOUNDER.password,
      username: FOUNDER.username,
    },
  });
  const [founder] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, FOUNDER.email))
    .limit(1);
  if (founder) {
    await db
      .insert(members)
      .values({ organizationId: orgId, userId: founder.id, role: 'owner' })
      .onConflictDoNothing();
    await db
      .insert(teamMembers)
      .values({ teamId, userId: founder.id, role: 'maintainer' })
      .onConflictDoNothing();
  }

  console.log('\n[seed] done ✓');
  console.log(`  org=${DEMO_SLUG}  team=Default  environments=production,staging  project=web`);
  console.log('\n  Admin login (owner of the sudo org):');
  console.log(`    email:    ${FOUNDER.email}`);
  console.log(`    username: ${FOUNDER.username}`);
  console.log(`    password: ${FOUNDER.password}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
