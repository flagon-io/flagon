// Org audit log.
import { nextCursor, orgPath, request, send } from "./client";
import type { AuditConfig, AuditEvent, AuditPage, AuditQuery } from "./types";

export async function listAuditEvents(slug: string, limit = 8): Promise<AuditEvent[]> {
  return (await listAuditPage(slug, { perPage: limit })).events;
}

export async function listAuditPage(slug: string, query: AuditQuery = {}): Promise<AuditPage> {
  const qs = new URLSearchParams();
  if (query.q) qs.set("q", query.q);
  for (const a of query.actions ?? []) qs.append("action", a);
  if (query.actor) qs.set("actor", query.actor);
  if (query.perPage) qs.set("limit", String(query.perPage));
  if (query.before) qs.set("cursor", query.before);
  const res = await send(`${orgPath(slug)}/audit?${qs.toString()}`, {
    messages: { 403: "Only organization owners and admins can view the audit log." },
  });
  const data = (await res.json()) as { events?: AuditEvent[] | null };
  return { events: data.events ?? [], next: nextCursor(res.headers.get("Link")) };
}

export function getAuditConfig(slug: string): Promise<AuditConfig> {
  return request<AuditConfig>(`${orgPath(slug)}/audit/config`);
}

export function setAuditConfig(slug: string, ipDisclosure: boolean): Promise<AuditConfig> {
  return request<AuditConfig>(`${orgPath(slug)}/audit/config`, {
    method: "PUT",
    body: { ip_disclosure: ipDisclosure },
    messages: { 403: "You don't have permission to change this." },
    fallback: "Couldn't save the setting.",
  });
}
