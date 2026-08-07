import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";
import type { PlatformMode, SeverityLevel } from "./incidents";

/** Server-side client for the org's configurable incident severity ladder. */
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

export type { SeverityLevel };
export type SeverityLevelInput = {
  key: string;
  name: string;
  description?: string | null;
  rank: number;
  color: string;
  downtimeWeight: number;
  platformMode: PlatformMode;
  isDefault: boolean;
};

export async function getSeverityLevels(slug: string): Promise<SeverityLevel[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/severity-levels`);
  if (!res.ok) return [];
  const body = (await res.json()) as { levels: SeverityLevel[] };
  return body.levels ?? [];
}

export async function putSeverityLevels(slug: string, levels: SeverityLevelInput[]) {
  return unwrap<{ levels: SeverityLevel[] }>(
    await apiFetch(`/v1/orgs/${slug}/severity-levels`, { method: "PUT", body: JSON.stringify({ levels }) }),
  );
}
