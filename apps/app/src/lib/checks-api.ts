import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the Checks endpoints. Mirrors incidents-api.ts: forwards
 * the caller's session cookie so the API authorizes org + role; reads return safe
 * defaults, writes return `{ data?, error? }`.
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

export type CheckStatus = "unknown" | "passing" | "degraded" | "failing";

export type Check = {
  key: string;
  name: string;
  type: string;
  family: "uptime" | "synthetic";
  config: Record<string, unknown>;
  frequencySeconds: number;
  locations: string[];
  activated: boolean;
  muted: boolean;
  tags: string[];
  currentStatus: CheckStatus;
  consecutiveFailures: number;
  lastRunAt: string | null;
  nextRunAt: string;
  lastStatusChangeAt: string | null;
  alertTrigger: Record<string, unknown>;
  alertOnDegraded: boolean;
  alertEmails: string[];
  alertChannelIds: string[];
  incidentAutomation: boolean;
  linkedProjectId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A response assertion (source / comparison / target), stored inside a check's config. */
export type Assertion = {
  source: "status" | "responseTime" | "body" | "jsonBody" | "header";
  property?: string;
  comparison:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "less_than"
    | "contains"
    | "not_contains"
    | "is_empty"
    | "not_empty";
  target?: string;
};

export type MonitorType = {
  key: string;
  label: string;
  summary: string;
  family: "uptime" | "synthetic";
  runner: "inline" | "browser" | "agent";
  supportsDegraded: boolean;
  defaults: Record<string, unknown>;
  configSchema: Record<string, unknown>;
};

export type CheckResult = {
  id: string;
  runStartedAt: string;
  status: CheckStatus;
  latencyMs: number | null;
  httpStatus: number | null;
  location: string;
  errorCode: string | null;
  errorMessage: string | null;
  assertions: unknown;
  detail: unknown;
};

export async function listChecks(slug: string, opts?: { projectKey?: string }): Promise<Check[]> {
  const qs = opts?.projectKey ? `?project=${encodeURIComponent(opts.projectKey)}` : "";
  const res = await apiFetch(`/v1/orgs/${slug}/checks${qs}`);
  if (!res.ok) return [];
  return ((await res.json()).checks ?? []) as Check[];
}

export async function getCheck(slug: string, key: string): Promise<Check | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/checks/${key}`);
  if (!res.ok) return null;
  return ((await res.json()).check ?? null) as Check | null;
}

export async function listMonitorTypes(slug: string): Promise<MonitorType[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/checks/monitor-types`);
  if (!res.ok) return [];
  return ((await res.json()).monitorTypes ?? []) as MonitorType[];
}

export async function listCheckResults(slug: string, key: string): Promise<CheckResult[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/checks/${key}/results`);
  if (!res.ok) return [];
  return ((await res.json()).results ?? []) as CheckResult[];
}

export type CheckInput = {
  name: string;
  key?: string;
  type: string;
  config: Record<string, unknown>;
  frequencySeconds?: number;
  activated?: boolean;
  muted?: boolean;
  tags?: string[];
  alertEmails?: string[];
  alertChannelIds?: string[];
  alertTrigger?: Record<string, unknown>;
  alertOnDegraded?: boolean;
  incidentAutomation?: boolean;
  linkedProjectKey?: string | null;
};

export async function createCheck(slug: string, body: CheckInput) {
  return unwrap<{ check: Check }>(
    await apiFetch(`/v1/orgs/${slug}/checks`, { method: "POST", body: JSON.stringify(body) }),
  );
}
export async function updateCheck(slug: string, key: string, body: Record<string, unknown>) {
  return unwrap<{ check: Check }>(
    await apiFetch(`/v1/orgs/${slug}/checks/${key}`, { method: "PATCH", body: JSON.stringify(body) }),
  );
}
export async function deleteCheck(slug: string, key: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/checks/${key}`, { method: "DELETE" }));
}
export async function runCheck(slug: string, key: string) {
  return unwrap<CheckResult>(await apiFetch(`/v1/orgs/${slug}/checks/${key}/run`, { method: "POST" }));
}
export async function muteCheck(slug: string, key: string, muted: boolean) {
  return unwrap<{ check: Check }>(
    await apiFetch(`/v1/orgs/${slug}/checks/${key}/mute`, { method: "POST", body: JSON.stringify({ muted }) }),
  );
}
export async function activateCheck(slug: string, key: string, activated: boolean) {
  return unwrap<{ check: Check }>(
    await apiFetch(`/v1/orgs/${slug}/checks/${key}/activate`, { method: "POST", body: JSON.stringify({ activated }) }),
  );
}

// --- alert channels ----------------------------------------------------------

export type AlertChannel = {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  sendOnFailure: boolean;
  sendOnRecovery: boolean;
  sendOnDegraded: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function listAlertChannels(slug: string): Promise<AlertChannel[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/alert-channels`);
  if (!res.ok) return [];
  return ((await res.json()).channels ?? []) as AlertChannel[];
}

export async function getAlertChannel(slug: string, id: string): Promise<AlertChannel | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/alert-channels/${id}`);
  if (!res.ok) return null;
  return ((await res.json()).channel ?? null) as AlertChannel | null;
}

export type ChannelType = {
  key: string;
  label: string;
  description: string;
  gatesCapability: string | null;
};

export async function listChannelTypes(slug: string): Promise<ChannelType[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/alert-channels/types`);
  if (!res.ok) return [];
  return ((await res.json()).channelTypes ?? []) as ChannelType[];
}

export type ChannelInput = {
  type: string;
  name: string;
  config: Record<string, unknown>;
  sendOnFailure?: boolean;
  sendOnRecovery?: boolean;
  sendOnDegraded?: boolean;
  enabled?: boolean;
};

export async function createAlertChannel(slug: string, body: ChannelInput) {
  return unwrap<{ channel: AlertChannel }>(
    await apiFetch(`/v1/orgs/${slug}/alert-channels`, { method: "POST", body: JSON.stringify(body) }),
  );
}
export async function updateAlertChannel(slug: string, id: string, body: Record<string, unknown>) {
  return unwrap<{ channel: AlertChannel }>(
    await apiFetch(`/v1/orgs/${slug}/alert-channels/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  );
}
export async function deleteAlertChannel(slug: string, id: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/alert-channels/${id}`, { method: "DELETE" }));
}
export async function testAlertChannel(slug: string, id: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/alert-channels/${id}/test`, { method: "POST" }));
}

// --- maintenance windows -----------------------------------------------------

export type MaintenanceRepeat = "none" | "daily" | "weekly" | "monthly";

export type MaintenanceWindow = {
  id: string;
  name: string;
  tags: string[];
  startsAt: string;
  endsAt: string;
  repeat: MaintenanceRepeat;
  repeatEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceWindowInput = {
  name: string;
  tags?: string[];
  startsAt: string;
  endsAt: string;
  repeat?: MaintenanceRepeat;
  repeatEndsAt?: string | null;
};

export async function listMaintenanceWindows(slug: string): Promise<MaintenanceWindow[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/maintenance-windows`);
  if (!res.ok) return [];
  return ((await res.json()).windows ?? []) as MaintenanceWindow[];
}

export async function getMaintenanceWindow(slug: string, id: string): Promise<MaintenanceWindow | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/maintenance-windows/${id}`);
  if (!res.ok) return null;
  return ((await res.json()).window ?? null) as MaintenanceWindow | null;
}

export async function createMaintenanceWindow(slug: string, body: MaintenanceWindowInput) {
  return unwrap<{ window: MaintenanceWindow }>(
    await apiFetch(`/v1/orgs/${slug}/maintenance-windows`, { method: "POST", body: JSON.stringify(body) }),
  );
}
export async function updateMaintenanceWindow(slug: string, id: string, body: Record<string, unknown>) {
  return unwrap<{ window: MaintenanceWindow }>(
    await apiFetch(`/v1/orgs/${slug}/maintenance-windows/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  );
}
export async function deleteMaintenanceWindow(slug: string, id: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/maintenance-windows/${id}`, { method: "DELETE" }));
}
