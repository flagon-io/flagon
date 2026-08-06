import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the Alert-channels endpoints (org-level outbound
 * destinations: Slack/webhook/email). Mirrors incidents-api.ts.
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

export type AlertChannel = {
  key: string;
  name: string;
  type: string;
  enabled: boolean;
  health: string;
  lastError: string | null;
  lastDeliveredAt: string | null;
  configured: boolean;
  channelLabel: string | null;
  method: string | null;
  addresses: string[];
};
export type AlertChannelBody = {
  key?: string;
  name?: string;
  type?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  channelLabel?: string;
  addresses?: string[];
  enabled?: boolean;
};

export async function listAlertChannels(slug: string): Promise<AlertChannel[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/alert-channels`);
  if (!res.ok) return [];
  return (await res.json()) as AlertChannel[];
}
export async function createAlertChannel(slug: string, body: AlertChannelBody) {
  return unwrap<AlertChannel>(await apiFetch(`/v1/orgs/${slug}/alert-channels`, { method: "POST", body: JSON.stringify(body) }));
}
export async function updateAlertChannel(slug: string, key: string, body: AlertChannelBody) {
  return unwrap<AlertChannel>(await apiFetch(`/v1/orgs/${slug}/alert-channels/${key}`, { method: "PATCH", body: JSON.stringify(body) }));
}
export async function deleteAlertChannel(slug: string, key: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/orgs/${slug}/alert-channels/${key}`, { method: "DELETE" }));
}
export async function testAlertChannel(slug: string, key: string) {
  return unwrap<{ ok: boolean; statusCode: number | null; error: string | null }>(
    await apiFetch(`/v1/orgs/${slug}/alert-channels/${key}/test`, { method: "POST" }),
  );
}
