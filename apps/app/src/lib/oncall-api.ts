import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/** Server-side client for the On-call endpoints (schedules + escalation policies). */
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

export type OncallSchedule = {
  key: string;
  name: string;
  team: { key: string; name: string } | null;
  rotationIntervalHours: number;
  anchorAt: string;
  memberCount: number;
};
export type OncallMember = { userId: string; name: string; email: string; position: number };
export type OncallOverride = { id: string; userId: string; startsAt: string; endsAt: string };
export type OncallScheduleDetail = {
  schedule: OncallSchedule;
  members: OncallMember[];
  overrides: OncallOverride[];
  current: { current: string | null; next: string | null };
};
export type EscalationLevel = { position: number; targetType: string; targetKey: string; targetLabel: string; delayMinutes: number };
export type EscalationPolicy = { key: string; name: string; repeatCount: number };
export type EscalationPolicyDetail = { policy: EscalationPolicy; levels: EscalationLevel[] };

export async function listSchedules(slug: string): Promise<OncallSchedule[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/oncall/schedules`);
  if (!res.ok) return [];
  return (await res.json()) as OncallSchedule[];
}
export async function getSchedule(slug: string, key: string): Promise<OncallScheduleDetail | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/oncall/schedules/${key}`);
  if (!res.ok) return null;
  return (await res.json()) as OncallScheduleDetail;
}
export async function createSchedule(slug: string, body: Record<string, unknown>) {
  return unwrap<OncallScheduleDetail>(await apiFetch(`/v1/orgs/${slug}/oncall/schedules`, { method: "POST", body: JSON.stringify(body) }));
}
export async function updateSchedule(slug: string, key: string, body: Record<string, unknown>) {
  return unwrap<OncallScheduleDetail>(await apiFetch(`/v1/orgs/${slug}/oncall/schedules/${key}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function deleteSchedule(slug: string, key: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/oncall/schedules/${key}`, { method: "DELETE" }));
}
export async function setScheduleMembers(slug: string, key: string, userIds: string[]) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/oncall/schedules/${key}/members`, { method: "PUT", body: JSON.stringify({ userIds }) }));
}
export async function addOverride(slug: string, key: string, body: { userId: string; startsAt: string; endsAt: string }) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/oncall/schedules/${key}/overrides`, { method: "POST", body: JSON.stringify(body) }));
}
export async function removeOverride(slug: string, key: string, id: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/oncall/schedules/${key}/overrides/${id}`, { method: "DELETE" }));
}
export async function teamCurrentOnCall(slug: string, teamKey: string): Promise<{ current: string | null; next: string | null } | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/oncall/teams/${teamKey}/current`);
  if (!res.ok) return null;
  return (await res.json()) as { current: string | null; next: string | null };
}
export async function listPolicies(slug: string): Promise<EscalationPolicy[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/oncall/escalation-policies`);
  if (!res.ok) return [];
  return (await res.json()) as EscalationPolicy[];
}
export async function getPolicy(slug: string, key: string): Promise<EscalationPolicyDetail | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/oncall/escalation-policies/${key}`);
  if (!res.ok) return null;
  return (await res.json()) as EscalationPolicyDetail;
}
export async function createPolicy(slug: string, body: { key: string; name: string; repeatCount?: number }) {
  return unwrap<EscalationPolicyDetail>(await apiFetch(`/v1/orgs/${slug}/oncall/escalation-policies`, { method: "POST", body: JSON.stringify(body) }));
}
export async function updatePolicy(slug: string, key: string, body: { name?: string; repeatCount?: number }) {
  return unwrap<EscalationPolicyDetail>(await apiFetch(`/v1/orgs/${slug}/oncall/escalation-policies/${key}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function deletePolicy(slug: string, key: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/oncall/escalation-policies/${key}`, { method: "DELETE" }));
}
export async function setPolicyLevels(slug: string, key: string, levels: { targetType: string; targetRef: string; delayMinutes: number }[]) {
  return unwrap<EscalationPolicyDetail>(await apiFetch(`/v1/orgs/${slug}/oncall/escalation-policies/${key}/levels`, { method: "PUT", body: JSON.stringify({ levels }) }));
}
