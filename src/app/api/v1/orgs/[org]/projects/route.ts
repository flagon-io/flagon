/**
 * GET  /api/v1/orgs/{org}/projects - list projects in an org
 * POST /api/v1/orgs/{org}/projects - create a project
 *
 * Reads/writes go through withTenant() so RLS scopes every row to the org.
 */

import { z } from 'zod';
import { withTenant } from '@/server/db';
import { uuidv7 } from '@/server/db/id';
import { projects } from '@/server/db/schema/app';
import { apiError, isResponse, json, requireMembership, validationError } from '@/server/api/http';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(64),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, and dashes only')
    .min(1)
    .max(48)
    .optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function GET(req: Request, ctx: { params: Promise<{ org: string }> }) {
  const { org } = await ctx.params;
  const membership = await requireMembership(req, org, 'viewer', 'projects:read');
  if (isResponse(membership)) return membership;

  const rows = await withTenant(membership.organizationId, (tx) =>
    tx
      .select({ id: projects.id, name: projects.name, slug: projects.slug })
      .from(projects),
  );
  return json({ projects: rows });
}

export async function POST(req: Request, ctx: { params: Promise<{ org: string }> }) {
  const { org } = await ctx.params;
  const membership = await requireMembership(req, org, 'member', 'projects:write');
  if (isResponse(membership)) return membership;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const slug = parsed.data.slug ?? slugify(parsed.data.name);
  const id = uuidv7();

  try {
    await withTenant(membership.organizationId, (tx) =>
      tx.insert(projects).values({
        id,
        organizationId: membership.organizationId,
        name: parsed.data.name,
        slug,
      }),
    );
  } catch {
    return apiError(409, `A project with the slug "${slug}" already exists.`);
  }

  return json({ project: { id, name: parsed.data.name, slug } }, { status: 201 });
}
