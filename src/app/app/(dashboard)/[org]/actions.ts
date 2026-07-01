'use server';

/**
 * Catalog control-plane mutations (server actions): projects, environments, and
 * org service tokens. Each resolves the caller's membership in the org (by slug,
 * from the session) and asserts a minimum role before writing through withTenant()
 * so RLS scopes every row. Clients call `router.refresh()` after a success.
 *
 * Feature Flags and the other capabilities are being rebuilt on this substrate;
 * their actions return here when they land.
 */

import { and, asc, eq } from 'drizzle-orm';
import { getOrgBySlug, roleAtLeast } from '@/server/api/org-context';
import { db, withTenant } from '@/server/db';
import { uuidv7 } from '@/server/db/id';
import { members, teamMembers, teams } from '@/server/db/schema/auth';
import { apiTokens, environments, projects } from '@/server/db/schema/app';
import { generateApiToken } from '@/server/tokens/api-tokens';
import { normalizeScopes } from '@/server/api/scopes';
import { isTeamRole } from '@/lib/teams';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** Resolve org + assert role; returns { orgId, userId } or null if denied. */
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
  // Own the project with the org's default team (teams are NOT under RLS).
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.organizationId, g.orgId))
    .orderBy(asc(teams.createdAt))
    .limit(1);
  try {
    // Environments are org-level, so a new project inherits the whole set.
    await withTenant(g.orgId, (tx) =>
      tx.insert(projects).values({ id, organizationId: g.orgId, teamId: team?.id ?? null, name, slug }),
    );
  } catch {
    return fail(`A project with the slug "${slug}" already exists.`);
  }
  return { ok: true, data: { id, slug } };
}

// --- Teams (own projects) --------------------------------------------------

export async function createTeam(
  orgSlug: string,
  input: { name: string },
): Promise<ActionResult<{ id: string }>> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  const name = input.name.trim();
  if (!name) return fail('Name is required.');
  const id = uuidv7();
  // Teams are a better-auth table (not under RLS); scope by organizationId.
  await db.insert(teams).values({ id, name, organizationId: g.orgId });
  return { ok: true, data: { id } };
}

/** Confirm a team belongs to the org (teams are not under RLS). */
async function teamInOrg(orgId: string, teamId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.organizationId, orgId)))
    .limit(1);
  return Boolean(row);
}

export async function addTeamMember(
  orgSlug: string,
  teamId: string,
  userId: string,
  role = 'member',
): Promise<ActionResult> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  if (!isTeamRole(role)) return fail('Invalid team role.');
  if (!(await teamInOrg(g.orgId, teamId))) return fail('Team not found.');
  // The user must already be a member of this organization.
  const [m] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.organizationId, g.orgId), eq(members.userId, userId)))
    .limit(1);
  if (!m) return fail('That person is not a member of this organization.');
  // (team_id, user_id) is unique; a repeat add is a no-op.
  await db
    .insert(teamMembers)
    .values({ teamId, userId, role })
    .onConflictDoNothing({ target: [teamMembers.teamId, teamMembers.userId] });
  return { ok: true, data: undefined };
}

export async function setTeamMemberRole(
  orgSlug: string,
  teamId: string,
  userId: string,
  role: string,
): Promise<ActionResult> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  if (!isTeamRole(role)) return fail('Invalid team role.');
  if (!(await teamInOrg(g.orgId, teamId))) return fail('Team not found.');
  await db
    .update(teamMembers)
    .set({ role })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return { ok: true, data: undefined };
}

export async function removeTeamMember(
  orgSlug: string,
  teamId: string,
  userId: string,
): Promise<ActionResult> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  if (!(await teamInOrg(g.orgId, teamId))) return fail('Team not found.');
  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return { ok: true, data: undefined };
}

/** Assign (or clear) the team that owns a project. */
export async function setProjectTeam(
  orgSlug: string,
  projectId: string,
  teamId: string | null,
): Promise<ActionResult> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  if (teamId && !(await teamInOrg(g.orgId, teamId))) return fail('Team not found.');
  await withTenant(g.orgId, (tx) =>
    tx.update(projects).set({ teamId }).where(eq(projects.id, projectId)),
  );
  return { ok: true, data: undefined };
}

// --- Environments (org-level platform primitive) ---------------------------

export async function createEnvironment(
  orgSlug: string,
  input: { name: string; key?: string; color?: string },
): Promise<ActionResult<{ id: string }>> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  const name = input.name.trim();
  if (!name) return fail('Name is required.');
  const key = (input.key?.trim() ? keyify(input.key) : keyify(name)) || 'env';
  const color = input.color?.trim() || '#64748b';
  const envId = uuidv7();

  try {
    await withTenant(g.orgId, (tx) =>
      tx.insert(environments).values({ id: envId, organizationId: g.orgId, name, key, color }),
    );
  } catch {
    return fail(`An environment with the key "${key}" already exists.`);
  }
  return { ok: true, data: { id: envId } };
}

export async function updateEnvironment(
  orgSlug: string,
  environmentId: string,
  input: { name?: string; color?: string },
): Promise<ActionResult> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  const patch: { name?: string; color?: string } = {};
  if (input.name?.trim()) patch.name = input.name.trim();
  if (input.color?.trim()) patch.color = input.color.trim();
  if (Object.keys(patch).length === 0) return { ok: true, data: undefined };
  await withTenant(g.orgId, (tx) =>
    tx.update(environments).set(patch).where(eq(environments.id, environmentId)),
  );
  return { ok: true, data: undefined };
}

export async function deleteEnvironment(
  orgSlug: string,
  environmentId: string,
): Promise<ActionResult> {
  const g = await gate(orgSlug, 'admin');
  if (!g) return fail('Not authorized.');
  // FK cascades remove anything a capability has attached to this environment.
  await withTenant(g.orgId, (tx) =>
    tx.delete(environments).where(eq(environments.id, environmentId)),
  );
  return { ok: true, data: undefined };
}

// --- Org service tokens (api_tokens, kind='org') ---------------------------
// Not RLS-protected, so queries are scoped by organizationId explicitly. Admin+
// only; the token's role is capped at the creator's role and never 'owner'.

const ORG_TOKEN_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export async function createOrgApiToken(
  orgSlug: string,
  input: { name: string; role: string; expiresInDays?: number | null; scopes?: string[] | null },
): Promise<ActionResult<{ plaintext: string }>> {
  const resolved = await getOrgBySlug(orgSlug);
  if (!resolved || !roleAtLeast(resolved.org.role, 'admin')) return fail('Not authorized.');

  const name = input.name.trim();
  if (!name) return fail('Give the token a name.');
  if (input.role === 'owner' || !(input.role in ORG_TOKEN_RANK)) return fail('Invalid role.');
  if (ORG_TOKEN_RANK[input.role]! > ORG_TOKEN_RANK[resolved.org.role]!) {
    return fail('You cannot grant a role higher than your own.');
  }

  const generated = generateApiToken('org');
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000)
    : null;

  await db.insert(apiTokens).values({
    id: uuidv7(),
    kind: 'org',
    organizationId: resolved.org.id,
    role: input.role,
    createdByUserId: resolved.user.id,
    name,
    prefix: generated.prefix,
    hashedKey: generated.hashedKey,
    scopes: normalizeScopes(input.scopes),
    expiresAt,
  });
  return { ok: true, data: { plaintext: generated.plaintext } };
}

export async function revokeOrgApiToken(orgSlug: string, id: string): Promise<ActionResult> {
  const resolved = await getOrgBySlug(orgSlug);
  if (!resolved || !roleAtLeast(resolved.org.role, 'admin')) return fail('Not authorized.');
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, id),
        eq(apiTokens.organizationId, resolved.org.id),
        eq(apiTokens.kind, 'org'),
      ),
    );
  return { ok: true, data: undefined };
}
