import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/** Server-side client for the org's RCCA template (fields + required severities). */
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

export type RccaTemplateField = { key: string; label: string; description?: string; required?: boolean };
export type RccaTemplateData = { requiredSeverities: string[]; fields: RccaTemplateField[] };

export async function getRccaTemplate(slug: string): Promise<RccaTemplateData> {
  const res = await apiFetch(`/v1/orgs/${slug}/rcca-template`);
  if (!res.ok) return { requiredSeverities: [], fields: [] };
  return (await res.json()) as RccaTemplateData;
}
export async function putRccaTemplate(slug: string, body: RccaTemplateData) {
  return unwrap<RccaTemplateData>(await apiFetch(`/v1/orgs/${slug}/rcca-template`, { method: "PUT", body: JSON.stringify(body) }));
}
