import { and, desc, eq } from "drizzle-orm";
import { isUniqueViolation } from "../db/errors";
import { projects } from "../db/schema";
import { withTenant } from "../db/tenant";
import {
  PROJECT_NAME_MAX_LENGTH,
  normalizeProjectSlug,
  validateProjectSlug,
} from "./projects";

/**
 * Project data access. Product data, so every query runs inside withTenant
 * (RLS keyed on the org). Shared by the console pages and the /v1 routes -
 * one implementation, no drift. Validation rules live in ./projects.ts so
 * client forms can share them without pulling in the database client.
 */
export type Project = typeof projects.$inferSelect;

export async function listProjects(orgId: string): Promise<Project[]> {
  return withTenant(orgId, (tx) =>
    tx.select().from(projects).orderBy(desc(projects.createdAt)),
  );
}

export async function getProject(
  orgId: string,
  slug: string,
): Promise<Project | null> {
  const [project] = await withTenant(orgId, (tx) =>
    tx
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, orgId), eq(projects.slug, slug)))
      .limit(1),
  );
  return project ?? null;
}

export type CreateProjectResult =
  | { ok: true; project: Project }
  | { ok: false; code: "invalid_name" | "invalid_slug" | "slug_taken"; error: string };

export async function createProject(
  orgId: string,
  input: { name: string; slug: string },
): Promise<CreateProjectResult> {
  const name = input.name.trim();
  if (!name || name.length > PROJECT_NAME_MAX_LENGTH) {
    return {
      ok: false,
      code: "invalid_name",
      error: `Provide a project name (at most ${PROJECT_NAME_MAX_LENGTH} characters).`,
    };
  }
  const slug = normalizeProjectSlug(input.slug);
  const validation = validateProjectSlug(slug);
  if (!validation.ok) {
    return { ok: false, code: "invalid_slug", error: validation.error };
  }

  try {
    const [project] = await withTenant(orgId, (tx) =>
      tx.insert(projects).values({ organizationId: orgId, slug, name }).returning(),
    );
    return { ok: true, project };
  } catch (error) {
    // Unique violation on (organization_id, slug).
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        code: "slug_taken",
        error: "That slug is already used by another project in this organization.",
      };
    }
    throw error;
  }
}

export type RenameProjectResult =
  | { ok: true; project: Project }
  | { ok: false; code: "invalid_name"; error: string };

export async function renameProject(
  orgId: string,
  projectId: string,
  rawName: string,
): Promise<RenameProjectResult> {
  const name = rawName.trim();
  if (!name || name.length > PROJECT_NAME_MAX_LENGTH) {
    return {
      ok: false,
      code: "invalid_name",
      error: `Provide a project name (at most ${PROJECT_NAME_MAX_LENGTH} characters).`,
    };
  }
  const [project] = await withTenant(orgId, (tx) =>
    tx
      .update(projects)
      .set({ name, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning(),
  );
  return { ok: true, project };
}

export async function updateProjectOverview(orgId: string, projectId: string, overviewMarkdown: string) {
  if (overviewMarkdown.length > 100_000) return { ok: false as const, code: "overview_too_long", error: "Project overviews are limited to 100,000 characters." };
  const [project] = await withTenant(orgId, (tx) => tx.update(projects).set({ overviewMarkdown, updatedAt: new Date() }).where(and(eq(projects.organizationId, orgId), eq(projects.id, projectId))).returning());
  return project ? { ok: true as const, project } : { ok: false as const, code: "not_found", error: "Project not found." };
}

/** Deletes the project; access grants cascade with it. */
export async function deleteProject(
  orgId: string,
  projectId: string,
): Promise<boolean> {
  const removed = await withTenant(orgId, (tx) =>
    tx
      .delete(projects)
      .where(eq(projects.id, projectId))
      .returning({ id: projects.id }),
  );
  return removed.length > 0;
}

/** Public REST shape (snake_case), shared by the v1 routes. */
export function serializeProject(project: Project) {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    overview_markdown: project.overviewMarkdown,
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  };
}
