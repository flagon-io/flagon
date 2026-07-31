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
export type Project = {
  key: string;
  name: string;
  description: string | null;
  ownerTeam: ProjectOwnerTeam | null;
  lifecycle: string | null;
  tier: string | null;
  tags: string[];
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
  tags?: string[];
  readme?: string | null;
};

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

export async function createProject(
  slug: string,
  body: { name: string; key: string },
) {
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
