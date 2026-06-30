'use server';

/**
 * Flag control-plane mutations (server actions). Each one resolves the caller's
 * membership in the org (by slug, from the session) and asserts a minimum role
 * before writing through withTenant() so RLS scopes every row. Clients call
 * `router.refresh()` after a success to re-pull the server-rendered data.
 */

import { eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { withTenant } from '@/server/db';
import { uuidv7 } from '@/server/db/id';
import { environments, flagEnvironments, flags, projects, sdkKeys, segments } from '@/server/db/schema/app';
import { generateSdkKey, type SdkKeyScope } from '@/server/flags/sdk-keys';
import { publishEnvironment } from '@/server/flags/publish';
import type { Condition, FlagType, JsonValue, TargetingRule } from '@/core/types';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** Resolve org + assert role; returns { id, role, userId } or null if denied. */
async function gate(orgSlug: string, min: 'member' | 'admin' = 'member') {
  const resolved = await getOrgBySlug(orgSlug);
  if (!resolved || !roleAtLeast(resolved.org.role, min)) return null;
  return { orgId: resolved.org.id, userId: resolved.user.id };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function keyify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// --- Projects --------------------------------------------------------------

export async function createProject(
  orgSlug: string,
  input: { name: string; slug?: string },
): Promise<ActionResult<{ id: string; slug: string }>> {
  const g = await gate(orgSlug);
  if (!g) return fail('Not authorized.');
  const name = input.name.trim();
  if (!name) return fail('Name is required.');
  const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(name)) || 'project';
  const id = uuidv7();
  try {
    await withTenant(g.orgId, (tx) =>
      tx.insert(projects).values({ id, organizationId: g.orgId, name, slug }),
    );
  } catch {
    return fail(`A project with the slug "${slug}" already exists.`);
  }
  return { ok: true, data: { id, slug } };
}

// --- Environments ----------------------------------------------------------

export async function createEnvironment(
  orgSlug: string,
  projectId: string,
  input: { name: string; key?: string; color?: string },
): Promise<ActionResult<{ id: string }>> {
  const g = await gate(orgSlug);
  if (!g) return fail('Not authorized.');
  const name = input.name.trim();
  if (!name) return fail('Name is required.');
  const key = (input.key?.trim() ? keyify(input.key) : keyify(name)) || 'env';
  const color = input.color?.trim() || '#64748b';
  const envId = uuidv7();

  try {
    await withTenant(g.orgId, async (tx) => {
      await tx.insert(environments).values({
        id: envId,
        organizationId: g.orgId,
        projectId,
        name,
        key,
        color,
      });
      // Backfill a per-environment config for every existing flag in the project,
      // copying variants/default from any existing config so bundles stay valid.
      const existing = await tx
        .select({ id: flags.id })
        .from(flags)
        .where(eq(flags.projectId, projectId));
      for (const f of existing) {
        const [seed] = await tx
          .select({ variants: flagEnvironments.variants, defaultVariant: flagEnvironments.defaultVariant })
          .from(flagEnvironments)
          .where(eq(flagEnvironments.flagId, f.id))
          .limit(1);
        await tx.insert(flagEnvironments).values({
          id: uuidv7(),
          organizationId: g.orgId,
          flagId: f.id,
          environmentId: envId,
          state: 'DISABLED',
          defaultVariant: seed?.defaultVariant ?? '',
          variants: seed?.variants ?? {},
          targeting: [],
        });
      }
    });
  } catch {
    return fail(`An environment with the key "${key}" already exists in this project.`);
  }
  return { ok: true, data: { id: envId } };
}

// --- SDK keys --------------------------------------------------------------

export async function createSdkKey(
  orgSlug: string,
  environmentId: string,
  input: { name: string; scope: SdkKeyScope },
): Promise<ActionResult<{ plaintext: string }>> {
  const g = await gate(orgSlug);
  if (!g) return fail('Not authorized.');
  const name = input.name.trim() || `${input.scope} key`;
  const generated = generateSdkKey(input.scope);
  await withTenant(g.orgId, (tx) =>
    tx.insert(sdkKeys).values({
      id: uuidv7(),
      organizationId: g.orgId,
      environmentId,
      name,
      prefix: generated.prefix,
      hashedKey: generated.hashedKey,
      scope: input.scope,
    }),
  );
  return { ok: true, data: { plaintext: generated.plaintext } };
}

export async function revokeSdkKey(orgSlug: string, keyId: string): Promise<ActionResult> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  await withTenant(g.orgId, (tx) =>
    tx.update(sdkKeys).set({ revokedAt: new Date() }).where(eq(sdkKeys.id, keyId)),
  );
  return { ok: true, data: undefined };
}

// --- Flags -----------------------------------------------------------------

export async function createFlag(
  orgSlug: string,
  projectId: string,
  input: {
    key: string;
    name: string;
    type: FlagType;
    description?: string;
    variants: Record<string, JsonValue>;
    defaultVariant: string;
  },
): Promise<ActionResult<{ id: string }>> {
  const g = await gate(orgSlug);
  if (!g) return fail('Not authorized.');
  const key = keyify(input.key || input.name);
  if (!key) return fail('Key is required.');
  if (!Object.keys(input.variants).length) return fail('At least one variant is required.');
  if (!input.variants[input.defaultVariant]) return fail('Default variant must be one of the variants.');
  const flagId = uuidv7();

  try {
    await withTenant(g.orgId, async (tx) => {
      await tx.insert(flags).values({
        id: flagId,
        organizationId: g.orgId,
        projectId,
        key,
        name: input.name.trim() || key,
        description: input.description?.trim() || null,
        type: input.type,
      });
      // One config row per environment in the project (initially disabled).
      const envs = await tx
        .select({ id: environments.id })
        .from(environments)
        .where(eq(environments.projectId, projectId));
      for (const env of envs) {
        await tx.insert(flagEnvironments).values({
          id: uuidv7(),
          organizationId: g.orgId,
          flagId,
          environmentId: env.id,
          state: 'DISABLED',
          defaultVariant: input.defaultVariant,
          variants: input.variants,
          targeting: [],
        });
      }
    });
  } catch {
    return fail(`A flag with the key "${key}" already exists in this project.`);
  }
  return { ok: true, data: { id: flagId } };
}

/** Update the name/description + variant set applied to every environment of a flag. */
export async function updateFlagDefinition(
  orgSlug: string,
  flagId: string,
  input: { name: string; description?: string; variants: Record<string, JsonValue> },
): Promise<ActionResult> {
  const g = await gate(orgSlug);
  if (!g) return fail('Not authorized.');
  if (!Object.keys(input.variants).length) return fail('At least one variant is required.');
  await withTenant(g.orgId, async (tx) => {
    await tx
      .update(flags)
      .set({ name: input.name.trim(), description: input.description?.trim() || null, updatedAt: new Date() })
      .where(eq(flags.id, flagId));
    await tx
      .update(flagEnvironments)
      .set({ variants: input.variants, updatedAt: new Date() })
      .where(eq(flagEnvironments.flagId, flagId));
  });
  return { ok: true, data: undefined };
}

/** Update one environment's state / default / targeting for a flag. */
export async function updateFlagEnvironment(
  orgSlug: string,
  flagEnvId: string,
  input: { state: 'ENABLED' | 'DISABLED'; defaultVariant: string; targeting: TargetingRule[] },
): Promise<ActionResult> {
  const g = await gate(orgSlug);
  if (!g) return fail('Not authorized.');
  await withTenant(g.orgId, (tx) =>
    tx
      .update(flagEnvironments)
      .set({
        state: input.state,
        defaultVariant: input.defaultVariant,
        targeting: input.targeting,
        updatedAt: new Date(),
      })
      .where(eq(flagEnvironments.id, flagEnvId)),
  );
  return { ok: true, data: undefined };
}

// --- Segments --------------------------------------------------------------

export async function createSegment(
  orgSlug: string,
  projectId: string,
  input: { name: string; key?: string; description?: string; condition: Condition },
): Promise<ActionResult<{ id: string }>> {
  const g = await gate(orgSlug);
  if (!g) return fail('Not authorized.');
  const name = input.name.trim();
  if (!name) return fail('Name is required.');
  const key = (input.key?.trim() ? keyify(input.key) : keyify(name)) || 'segment';
  const id = uuidv7();
  try {
    await withTenant(g.orgId, (tx) =>
      tx.insert(segments).values({
        id,
        organizationId: g.orgId,
        projectId,
        key,
        name,
        description: input.description?.trim() || null,
        condition: input.condition,
      }),
    );
  } catch {
    return fail(`A segment with the key "${key}" already exists in this project.`);
  }
  return { ok: true, data: { id } };
}

export async function updateSegment(
  orgSlug: string,
  segmentId: string,
  input: { name: string; description?: string; condition: Condition },
): Promise<ActionResult> {
  const g = await gate(orgSlug);
  if (!g) return fail('Not authorized.');
  if (!input.name.trim()) return fail('Name is required.');
  await withTenant(g.orgId, (tx) =>
    tx
      .update(segments)
      .set({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        condition: input.condition,
        updatedAt: new Date(),
      })
      .where(eq(segments.id, segmentId)),
  );
  return { ok: true, data: undefined };
}

export async function deleteSegment(orgSlug: string, segmentId: string): Promise<ActionResult> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  await withTenant(g.orgId, (tx) => tx.delete(segments).where(eq(segments.id, segmentId)));
  return { ok: true, data: undefined };
}

// --- Publish ---------------------------------------------------------------

export async function publish(
  orgSlug: string,
  environmentId: string,
): Promise<ActionResult<{ etag: string; flagCount: number }>> {
  const g = await gate(orgSlug);
  if (!g) return fail('Not authorized.');
  try {
    const bundle = await publishEnvironment(g.orgId, environmentId, g.userId);
    return { ok: true, data: { etag: bundle.etag, flagCount: Object.keys(bundle.flags).length } };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Publish failed.');
  }
}
