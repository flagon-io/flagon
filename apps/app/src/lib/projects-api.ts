import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the Projects control-plane endpoints in the API.
 * Mirrors flags-api.ts: forwards the caller's session cookie so the API
 * authorizes org + membership; reads return safe defaults, writes return
 * `{ data?, error? }`.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

async function unwrap<T>(res: Response): Promise<{ data?: T; error?: string }> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { error: (body?.message as string) ?? `Request failed (${res.status}).` };
  }
  return { data: body as T };
}

// --- Projects ---------------------------------------------------------------
export type ProjectOwnerTeam = { key: string; name: string };
export type ProjectLink = { type: string; label: string | null; url: string };
export type ProjectRepo = {
  url: string;
  provider: string;
  name: string | null;
  defaultBranch: string | null;
  visibility: string | null;
};
export type Project = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  ownerTeam: ProjectOwnerTeam | null;
  lifecycle: string | null;
  tier: string | null;
  kind: string | null;
  framework: string | null;
  image: string | null;
  tags: string[];
  domains: string[];
  links: ProjectLink[];
  repo: ProjectRepo | null;
  readme: string | null;
  createdAt: string;
};

/** Catalog metadata a manager can edit on a project (all optional). */
export type ProjectCatalog = {
  name?: string;
  description?: string | null;
  ownerTeamKey?: string | null;
  lifecycle?: string | null;
  tier?: string | null;
  kind?: string | null;
  framework?: string | null;
  image?: string | null;
  tags?: string[];
  domains?: string[];
  links?: ProjectLink[];
  repoUrl?: string | null;
  repoDefaultBranch?: string | null;
  repoVisibility?: string | null;
  readme?: string | null;
};

// --- Project relations (dependency / service-map edges) ---------------------
export type ProjectRelation = {
  id: string;
  type: string;
  project: { key: string; name: string };
};
export type ProjectRelations = {
  outgoing: ProjectRelation[];
  incoming: ProjectRelation[];
};

export async function listProjectRelations(
  slug: string,
  key: string,
): Promise<ProjectRelations> {
  const res = await apiFetch(`/v1/orgs/${slug}/projects/${key}/relations`);
  if (!res.ok) return { outgoing: [], incoming: [] };
  return (await res.json()) as ProjectRelations;
}

export async function addProjectRelation(
  slug: string,
  key: string,
  body: { type: string; targetKey: string },
) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/projects/${key}/relations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function removeProjectRelation(
  slug: string,
  key: string,
  relationId: string,
) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/projects/${key}/relations/${relationId}`, {
      method: "DELETE",
    }),
  );
}

// --- Project access (GitHub-repository style) -------------------------------
export type ProjectAccessGrant = { teamKey: string; teamName: string; role: string };
export type ProjectAccess = {
  owner: { key: string; name: string } | null;
  grants: ProjectAccessGrant[];
};

export async function listProjectAccess(
  slug: string,
  key: string,
): Promise<ProjectAccess> {
  const res = await apiFetch(`/v1/orgs/${slug}/projects/${key}/access`);
  if (!res.ok) return { owner: null, grants: [] };
  return (await res.json()) as ProjectAccess;
}

export async function addProjectAccess(
  slug: string,
  key: string,
  body: { teamKey: string; role: string },
) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/projects/${key}/access`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function updateProjectAccess(
  slug: string,
  key: string,
  teamKey: string,
  role: string,
) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/projects/${key}/access/${teamKey}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  );
}

export async function removeProjectAccess(
  slug: string,
  key: string,
  teamKey: string,
) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/projects/${key}/access/${teamKey}`, {
      method: "DELETE",
    }),
  );
}

export async function listProjects(slug: string): Promise<Project[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/projects`);
  if (!res.ok) return [];
  return (await res.json()) as Project[];
}

export async function getProject(slug: string, key: string): Promise<Project | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/projects/${key}`);
  if (!res.ok) return null;
  return ((await res.json()) as { project: Project }).project;
}

export type CreateProjectBody = {
  name: string;
  key: string;
  description?: string;
  framework?: string;
  kind?: string;
  ownerTeamKey?: string;
  lifecycle?: string;
  tier?: string;
  tags?: string[];
  domains?: string[];
  links?: ProjectLink[];
  repoUrl?: string;
  repoDefaultBranch?: string;
  repoVisibility?: string;
};

export async function createProject(slug: string, body: CreateProjectBody) {
  return unwrap<{ project: Project }>(
    await apiFetch(`/v1/orgs/${slug}/projects`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function updateProject(
  slug: string,
  key: string,
  body: ProjectCatalog,
) {
  return unwrap<{ project: Project }>(
    await apiFetch(`/v1/orgs/${slug}/projects/${key}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteProject(slug: string, key: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/projects/${key}`, { method: "DELETE" }),
  );
}
