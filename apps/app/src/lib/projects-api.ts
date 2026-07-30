import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the Projects + GitHub control-plane endpoints in the
 * API. Mirrors flags-api.ts: forwards the caller's session cookie so the API
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
export type Project = {
  key: string;
  name: string;
  repoFullName: string | null;
  repoDefaultBranch: string | null;
  repoPrivate: boolean;
  rootDirectory: string;
  framework: string | null;
  githubInstallationId: string | null;
  createdAt: string;
};

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
  body: { name: string; key: string; githubInstallationId?: string; repoId?: string },
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
  body: { name?: string; rootDirectory?: string },
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

// --- GitHub connections -----------------------------------------------------
export type GithubInstallation = {
  id: string;
  installationId: string;
  accountLogin: string;
  accountType: string;
  accountAvatarUrl: string | null;
  suspended: boolean;
  createdAt: string;
};

export type GithubRepo = {
  id: string;
  fullName: string;
  name: string;
  private: boolean;
  defaultBranch: string;
};

export async function listGithubInstallations(
  slug: string,
): Promise<GithubInstallation[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/integrations/github/installations`);
  if (!res.ok) return [];
  return (await res.json()) as GithubInstallation[];
}

/** The signed GitHub App install URL to begin connecting an account. */
export async function githubInstallUrl(slug: string) {
  return unwrap<{ url: string }>(
    await apiFetch(`/v1/orgs/${slug}/integrations/github/install-url`),
  );
}

export async function listGithubRepos(slug: string, installationId: string) {
  const res = await apiFetch(
    `/v1/orgs/${slug}/integrations/github/installations/${installationId}/repos`,
  );
  if (!res.ok) return { error: "Could not load repositories." };
  return { data: (await res.json()) as GithubRepo[] };
}

export async function disconnectInstallation(slug: string, id: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/integrations/github/installations/${id}`, {
      method: "DELETE",
    }),
  );
}

/**
 * Hop 1 of connecting: after the app is installed, exchange the install `state`
 * + `installation_id` for the GitHub authorize URL that proves the caller
 * controls the installation. The browser is then redirected there.
 */
export async function startGithubConnection(state: string, installationId: string) {
  return unwrap<{ url: string }>(
    await apiFetch(`/v1/integrations/github/authorize`, {
      method: "POST",
      body: JSON.stringify({ state, installationId }),
    }),
  );
}

/**
 * Hop 2 of connecting: complete the connection with the authorization `code`.
 * The API verifies (via a user token) that the caller can access the
 * installation before recording it. Returns the org slug to redirect to.
 */
export async function completeGithubConnection(state: string, code: string) {
  return unwrap<{ orgSlug: string }>(
    await apiFetch(`/v1/integrations/github/setup`, {
      method: "POST",
      body: JSON.stringify({ state, code }),
    }),
  );
}
