import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/** Server-side client for a user's notification channels (incident paging). */
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

export type NotificationChannel = {
  id: string;
  type: string;
  value: string;
  label: string | null;
  verified: boolean;
  deliverable: boolean;
};

export async function listChannels(): Promise<NotificationChannel[]> {
  const res = await apiFetch(`/v1/me/notification-channels`);
  if (!res.ok) return [];
  return (await res.json()) as NotificationChannel[];
}
export async function addChannel(body: { type: string; value: string; label?: string }) {
  return unwrap<NotificationChannel>(await apiFetch(`/v1/me/notification-channels`, { method: "POST", body: JSON.stringify(body) }));
}
export async function removeChannel(id: string) {
  return unwrap<{ ok: true }>(await apiFetch(`/v1/me/notification-channels/${id}`, { method: "DELETE" }));
}
