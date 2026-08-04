import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/** Server-side client for the Runbooks endpoints (reusable incident playbooks). */
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

export type RunbookStep = { position: number; title: string; body: string | null; kind: string; url: string | null };
export type Runbook = {
  key: string;
  name: string;
  description: string | null;
  triggerSeverity: string | null;
  stepCount: number;
  services: { key: string; name: string }[];
};
export type RunbookDetail = { runbook: Runbook; steps: RunbookStep[] };

export async function listRunbooks(slug: string): Promise<Runbook[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/runbooks`);
  if (!res.ok) return [];
  return (await res.json()) as Runbook[];
}
export async function getRunbook(slug: string, key: string): Promise<RunbookDetail | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/runbooks/${key}`);
  if (!res.ok) return null;
  return (await res.json()) as RunbookDetail;
}
export async function createRunbook(slug: string, body: { key: string; name: string; description?: string; triggerSeverity?: string }) {
  return unwrap<RunbookDetail>(await apiFetch(`/v1/orgs/${slug}/runbooks`, { method: "POST", body: JSON.stringify(body) }));
}
export async function updateRunbook(slug: string, key: string, body: Record<string, unknown>) {
  return unwrap<RunbookDetail>(await apiFetch(`/v1/orgs/${slug}/runbooks/${key}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function deleteRunbook(slug: string, key: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/runbooks/${key}`, { method: "DELETE" }));
}
export async function setRunbookSteps(slug: string, key: string, steps: { title: string; body?: string; kind: string; url?: string }[]) {
  return unwrap<RunbookDetail>(await apiFetch(`/v1/orgs/${slug}/runbooks/${key}/steps`, { method: "PUT", body: JSON.stringify({ steps }) }));
}
export async function setRunbookServices(slug: string, key: string, projectKeys: string[]) {
  return unwrap<RunbookDetail>(await apiFetch(`/v1/orgs/${slug}/runbooks/${key}/services`, { method: "PUT", body: JSON.stringify({ projectKeys }) }));
}
