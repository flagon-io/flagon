import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";
import type { StepCondition } from "./runbook-steps";

/**
 * Server-side client for the Incidents endpoints. Mirrors projects-api.ts:
 * forwards the caller's session cookie; reads return safe defaults, writes return
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
  if (!res.ok) return { error: (body?.message as string) ?? `Request failed (${res.status}).` };
  return { data: body as T };
}

export type Incident = {
  number: number;
  title: string;
  summary: string | null;
  severity: string;
  status: string;
  ownerTeam: { key: string; name: string } | null;
  startedAt: string;
  resolvedAt: string | null;
  createdAt: string;
};
export type IncidentUpdate = { id: string; body: string; status: string | null; createdAt: string };
export type ChecklistItem = {
  id: string;
  runbookName: string | null;
  title: string;
  body: string | null;
  kind: string;
  url: string | null;
  provider: string;
  action: string;
  conditions: StepCondition[];
  state: "pending" | "active" | "skipped";
  skippedReason: string | null;
  done: boolean;
};
export type RccaField = { key: string; label: string; description?: string; required?: boolean };
export type ActionItem = { id: string; title: string; description: string | null; assigneeUserId: string | null; status: string };
export type IncidentDetail = {
  incident: Incident;
  services: { key: string; name: string }[];
  updates: IncidentUpdate[];
  checklist: ChecklistItem[];
  rccaRequired: boolean;
  rccaTemplate: { requiredSeverities: string[]; fields: RccaField[] };
  rcca: { values: Record<string, string> };
  actionItems: ActionItem[];
};

export async function listIncidents(slug: string, opts?: { status?: "open" | "resolved"; project?: string }): Promise<Incident[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.project) params.set("project", opts.project);
  const q = params.toString();
  const res = await apiFetch(`/v1/orgs/${slug}/incidents${q ? `?${q}` : ""}`);
  if (!res.ok) return [];
  return (await res.json()) as Incident[];
}
export async function getIncident(slug: string, number: number): Promise<IncidentDetail | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/incidents/${number}`);
  if (!res.ok) return null;
  return (await res.json()) as IncidentDetail;
}
export async function listOpenIncidentsForProject(slug: string, projectKey: string): Promise<Incident[]> {
  return listIncidents(slug, { status: "open", project: projectKey });
}

export type DeclareBody = {
  title: string;
  severity: string;
  summary?: string;
  affectedProjectKeys?: string[];
  ownerTeamKey?: string;
};
export async function declareIncident(slug: string, body: DeclareBody) {
  return unwrap<IncidentDetail>(await apiFetch(`/v1/orgs/${slug}/incidents`, { method: "POST", body: JSON.stringify(body) }));
}
export async function updateIncident(slug: string, number: number, body: Record<string, unknown>) {
  return unwrap<{ incident: Incident }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function postIncidentUpdate(slug: string, number: number, body: { body: string; status?: string }) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/updates`, { method: "POST", body: JSON.stringify(body) }));
}
export async function resolveIncident(slug: string, number: number) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/resolve`, { method: "POST" }));
}
export async function addIncidentService(slug: string, number: number, projectKey: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/services`, { method: "POST", body: JSON.stringify({ projectKey }) }));
}
export async function removeIncidentService(slug: string, number: number, projectKey: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/services/${projectKey}`, { method: "DELETE" }));
}
export async function attachRunbookToIncident(slug: string, number: number, runbookKey: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/runbooks`, { method: "POST", body: JSON.stringify({ runbookKey }) }));
}
export async function toggleChecklistItem(slug: string, number: number, itemId: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/checklist/${itemId}/toggle`, { method: "POST" }));
}
export async function putRcca(slug: string, number: number, values: Record<string, string>) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/rcca`, { method: "PUT", body: JSON.stringify({ values }) }));
}
export async function addActionItem(slug: string, number: number, body: { title: string; description?: string; assigneeUserId?: string }) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/action-items`, { method: "POST", body: JSON.stringify(body) }));
}
export async function updateActionItem(slug: string, number: number, itemId: string, body: Record<string, unknown>) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/action-items/${itemId}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function deleteActionItem(slug: string, number: number, itemId: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/incidents/${number}/action-items/${itemId}`, { method: "DELETE" }));
}
