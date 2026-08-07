import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/** Server-side client for reliability objectives (optional SLO/SLA). */
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
  if (!res.ok) return { error: (body?.message as string) ?? `Request failed (${res.status}).` };
  return { data: body as T };
}

export type Objective = {
  key: string;
  name: string;
  label: string;
  scopeType: "org" | "project";
  scopeProjectKey: string | null;
  targetPct: number;
  windowDays: number;
  enabled: boolean;
};
export type ObjectiveInput = {
  key: string;
  name: string;
  label: string;
  scopeType: "org" | "project";
  projectKey?: string | null;
  targetPct: number;
  windowDays: number;
  enabled?: boolean;
};

export async function listObjectives(slug: string): Promise<Objective[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/objectives`);
  if (!res.ok) return [];
  const body = (await res.json()) as { objectives: Objective[] };
  return body.objectives ?? [];
}
export async function createObjective(slug: string, body: ObjectiveInput) {
  return unwrap<Objective>(await apiFetch(`/v1/orgs/${slug}/objectives`, { method: "POST", body: JSON.stringify(body) }));
}
export async function updateObjective(slug: string, key: string, body: Partial<ObjectiveInput>) {
  return unwrap<Objective>(await apiFetch(`/v1/orgs/${slug}/objectives/${key}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function deleteObjective(slug: string, key: string) {
  return unwrap<{ ok: boolean }>(await apiFetch(`/v1/orgs/${slug}/objectives/${key}`, { method: "DELETE" }));
}
