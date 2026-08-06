import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the Checks endpoints. Mirrors incidents-api.ts: forwards the
 * caller's session cookie; reads return safe defaults, writes return `{ data?, error? }`.
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

export type CheckStatus = "unknown" | "up" | "degraded" | "down" | "paused";
export type Check = {
  key: string;
  name: string;
  type: string;
  status: CheckStatus;
  enabled: boolean;
  paused: boolean;
  intervalSeconds: number;
  lastCheckedAt: string | null;
  lastStatusChangedAt: string | null;
  lastLatencyMs: number | null;
  hasOpenIncident: boolean;
};
export type OrgCheck = Check & { projectKey: string; projectName: string };
export type CheckResult = { ranAt: string; ok: boolean; statusCode: number | null; responseMs: number | null; error: string | null };
export type CheckTarget = { url?: string; method?: string; headers?: Record<string, string>; body?: string; followRedirects?: boolean; host?: string; port?: number };
export type CheckAssertions = { expectedStatusMin?: number; expectedStatusMax?: number; keyword?: string; keywordAbsent?: boolean; maxLatencyMs?: number; tlsMinDaysRemaining?: number; heartbeatGraceSeconds?: number };
export type CheckIncidentAction = { severity: string; escalationPolicyKey?: string | null; ownerTeamKey?: string | null; runbookKey?: string | null; autoResolve?: boolean };
export type CheckAction = { mode?: "track" | "notify" | "incident"; channelKeys?: string[]; incident?: CheckIncidentAction };
export type CheckDetail = Check & {
  target: CheckTarget;
  assertions: CheckAssertions;
  action: CheckAction;
  timeoutMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  uptime24h: number | null;
  uptime7d: number | null;
  avgLatencyMs: number | null;
  pingUrl: string | null;
  recent: CheckResult[];
};

export type CheckBody = {
  key?: string;
  name?: string;
  type?: string;
  target?: CheckTarget;
  assertions?: CheckAssertions;
  intervalSeconds?: number;
  timeoutMs?: number;
  failureThreshold?: number;
  recoveryThreshold?: number;
  action?: CheckAction;
  enabled?: boolean;
};

export async function listChecks(slug: string, projectKey: string): Promise<Check[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/projects/${projectKey}/checks`);
  if (!res.ok) return [];
  return (await res.json()) as Check[];
}
export async function listAllChecks(slug: string): Promise<OrgCheck[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/checks`);
  if (!res.ok) return [];
  return (await res.json()) as OrgCheck[];
}
export async function getCheck(slug: string, projectKey: string, checkKey: string): Promise<CheckDetail | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/projects/${projectKey}/checks/${checkKey}`);
  if (!res.ok) return null;
  return (await res.json()) as CheckDetail;
}
export async function createCheck(slug: string, projectKey: string, body: CheckBody) {
  return unwrap<Check>(await apiFetch(`/v1/orgs/${slug}/projects/${projectKey}/checks`, { method: "POST", body: JSON.stringify(body) }));
}
export async function updateCheck(slug: string, projectKey: string, checkKey: string, body: CheckBody) {
  return unwrap<Check>(await apiFetch(`/v1/orgs/${slug}/projects/${projectKey}/checks/${checkKey}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function deleteCheck(slug: string, projectKey: string, checkKey: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/projects/${projectKey}/checks/${checkKey}`, { method: "DELETE" }));
}
export async function pauseCheck(slug: string, projectKey: string, checkKey: string, paused: boolean) {
  return unwrap<Check>(await apiFetch(`/v1/orgs/${slug}/projects/${projectKey}/checks/${checkKey}/pause`, { method: "POST", body: JSON.stringify({ paused }) }));
}
export async function runCheck(slug: string, projectKey: string, checkKey: string) {
  return unwrap<{ ok: boolean; statusCode: number | null; responseMs: number | null; error: string | null; status: string }>(
    await apiFetch(`/v1/orgs/${slug}/projects/${projectKey}/checks/${checkKey}/run`, { method: "POST" }),
  );
}
