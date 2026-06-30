/**
 * Demo seed. Creates a founder login + an org → project → production environment
 * with a couple of flags and a segment, mints a server SDK key, and publishes a
 * bundle - then prints the login and a ready-to-run OFREP curl.
 *
 * Idempotent: it deletes the demo org and founder user (cascading children) first.
 *
 *   pnpm db:seed
 */

import { eq } from 'drizzle-orm';
import { db, withTenant } from '@/server/db';
import { uuidv7 } from '@/server/db/id';
import { members, organizations, users } from '@/server/db/schema/auth';
import {
  environments,
  flagEnvironments,
  flags,
  projects,
  sdkKeys,
  segments,
} from '@/server/db/schema/app';
import { generateSdkKey } from '@/server/flags/sdk-keys';
import { publishEnvironment } from '@/server/flags/publish';

// The demo org is the sudo org ("flagon"), so the seeded founder gets sudo
// access via membership and dogfoods Flagon's own flags.
const DEMO_SLUG = 'flagon';
const DEMO_NAME = 'Flagon';
const FOUNDER = {
  name: 'Founder',
  username: 'founder',
  email: 'founder@flagon.local',
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
  await db.insert(organizations).values({ id: orgId, name: DEMO_NAME, slug: DEMO_SLUG });

  const projectId = uuidv7();
  const envId = uuidv7();
  const flagDashId = uuidv7();
  const flagColorId = uuidv7();

  await withTenant(orgId, async (tx) => {
    await tx
      .insert(projects)
      .values({ id: projectId, organizationId: orgId, name: 'Web App', slug: 'web' });

    await tx.insert(environments).values({
      id: envId,
      organizationId: orgId,
      projectId,
      name: 'Production',
      key: 'production',
      color: '#16a34a',
    });

    await tx.insert(segments).values({
      id: uuidv7(),
      organizationId: orgId,
      projectId,
      key: 'internal-staff',
      name: 'Internal staff',
      condition: { op: 'ends_with', attr: 'email', value: '@acme.test' },
    });

    // Boolean flag gated to enterprise plans + internal staff.
    await tx
      .insert(flags)
      .values({ id: flagDashId, organizationId: orgId, projectId, key: 'new-dashboard', name: 'New dashboard', type: 'boolean' });
    await tx.insert(flagEnvironments).values({
      id: uuidv7(),
      organizationId: orgId,
      flagId: flagDashId,
      environmentId: envId,
      state: 'ENABLED',
      defaultVariant: 'off',
      variants: { on: true, off: false },
      targeting: [
        { when: { op: 'segment', ref: 'internal-staff' }, then: { variant: 'on' } },
        { when: { op: 'eq', attr: 'plan', value: 'enterprise' }, then: { variant: 'on' } },
      ],
    });

    // String flag with a 50/50 sticky rollout.
    await tx
      .insert(flags)
      .values({ id: flagColorId, organizationId: orgId, projectId, key: 'checkout-color', name: 'Checkout color', type: 'string' });
    await tx.insert(flagEnvironments).values({
      id: uuidv7(),
      organizationId: orgId,
      flagId: flagColorId,
      environmentId: envId,
      state: 'ENABLED',
      defaultVariant: 'blue',
      variants: { blue: 'blue', green: 'green' },
      targeting: [
        {
          when: { op: 'true' },
          then: {
            fractional: [
              { variant: 'blue', weight: 50 },
              { variant: 'green', weight: 50 },
            ],
          },
        },
      ],
    });
  });

  // SDK keys are not under RLS (the eval path looks them up by hash with no
  // tenant context), so insert with the base client.
  const key = generateSdkKey('server');
  await db.insert(sdkKeys).values({
    id: uuidv7(),
    organizationId: orgId,
    environmentId: envId,
    name: 'Production server key',
    prefix: key.prefix,
    hashedKey: key.hashedKey,
    scope: 'server',
  });

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
  }

  const bundle = await publishEnvironment(orgId, envId);

  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
  const ofrepBase = base.replace(/\/v1$/, '/ofrep/v1');

  console.log('\n[seed] done ✓');
  console.log(`  org=${DEMO_SLUG}  env=production  flags=${Object.keys(bundle.flags).length}  etag=${bundle.etag}`);
  console.log('\n  Founder login (also the platform admin):');
  console.log(`    email:    ${FOUNDER.email}`);
  console.log(`    username: ${FOUNDER.username}`);
  console.log(`    password: ${FOUNDER.password}`);
  console.log(`\n  SDK key (shown once):\n    ${key.plaintext}\n`);
  console.log('  Evaluate a flag:');
  console.log(
    `    curl -s -X POST ${ofrepBase}/evaluate/flags/new-dashboard \\\n` +
      `      -H "Authorization: Bearer ${key.plaintext}" \\\n` +
      `      -H "Content-Type: application/json" \\\n` +
      `      -d '{"context":{"targetingKey":"u1","plan":"enterprise"}}'\n`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
