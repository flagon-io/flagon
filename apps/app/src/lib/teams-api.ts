import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the Teams control-plane endpoints in the API. Mirrors
 * projects-api.ts: forwards the caller's session cookie so the API authorizes org
 * + membership; reads return safe defaults, writes return `{ data?, error? }`.
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

export type Team = {
  key: string;
  name: string;
  description: string | null;
  memberCount: number;
  projectCount: number;
  createdAt: string;
};

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  joinedAt: string;
};

export async function listTeams(slug: string): Promise<Team[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/teams`);
  if (!res.ok) return [];
  return (await res.json()) as Team[];
}

export async function getTeam(slug: string, key: string): Promise<Team | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/teams/${key}`);
  if (!res.ok) return null;
  return ((await res.json()) as { team: Team }).team;
}

export async function listTeamMembers(slug: string, key: string): Promise<TeamMember[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/teams/${key}/members`);
  if (!res.ok) return [];
  return (await res.json()) as TeamMember[];
}

export async function createTeam(
  slug: string,
  body: { name: string; key: string; description?: string },
) {
  return unwrap<{ team: Team }>(
    await apiFetch(`/v1/orgs/${slug}/teams`, { method: "POST", body: JSON.stringify(body) }),
  );
}

export async function updateTeam(
  slug: string,
  key: string,
  body: { name?: string; description?: string | null },
) {
  return unwrap<{ team: Team }>(
    await apiFetch(`/v1/orgs/${slug}/teams/${key}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteTeam(slug: string, key: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/teams/${key}`, { method: "DELETE" }),
  );
}

export async function addTeamMember(
  slug: string,
  key: string,
  body: { userId: string; role?: "maintainer" | "member" },
) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/teams/${key}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function updateTeamMemberRole(
  slug: string,
  key: string,
  userId: string,
  role: "maintainer" | "member",
) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/teams/${key}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  );
}

export async function removeTeamMember(slug: string, key: string, userId: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/teams/${key}/members/${userId}`, { method: "DELETE" }),
  );
}
