import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the API's integrations surface
 * (/v1/orgs/:org/integrations). Like the other console API clients, it drives the
 * exact same /v1 endpoints an API consumer would (API-first parity, no UI-only
 * writes). The caller's session cookie is forwarded so the API authorizes
 * owner/admin. Secrets are write-only: they go out on configure and never come
 * back — the catalog returns only non-secret config and masked hints.
 */

export type IntegrationField = {
  key: string;
  label: string;
  type: "text" | "tel";
  required: boolean;
  placeholder?: string;
  help?: string;
  secret: boolean;
};

export type IntegrationOption = {
  key: string;
  label: string;
  help?: string;
  default: boolean;
  gatesCapability?: string;
};

export type IntegrationView = {
  provider: string;
  status: "connected" | "error" | "disabled";
  connected: boolean;
  config: Record<string, unknown>;
  hints: Record<string, string>;
  lastError: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationCatalogEntry = {
  key: string;
  label: string;
  category: string;
  summary: string;
  docsPath?: string;
  capabilities: string[];
  fields: IntegrationField[];
  options: IntegrationOption[];
  integration: IntegrationView | null;
};

export type IntegrationCatalog = {
  secretsEnabled: boolean;
  providers: IntegrationCatalogEntry[];
};

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      cookie,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

async function unwrap<T>(res: Response): Promise<{ data?: T; error?: string }> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { error: (body?.message as string) ?? `Request failed (${res.status}).` };
  }
  return { data: body as T };
}

export async function getIntegrations(slug: string): Promise<IntegrationCatalog | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/integrations`);
  if (!res.ok) return null;
  return (await res.json()) as IntegrationCatalog;
}

export async function configureIntegration(
  slug: string,
  provider: string,
  values: Record<string, string>,
): Promise<{ data?: { integration: IntegrationView }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/integrations/${provider}`, {
    method: "PUT",
    body: JSON.stringify(values),
  });
  return unwrap(res);
}

export async function updateIntegrationOptions(
  slug: string,
  provider: string,
  options: Record<string, boolean>,
): Promise<{ data?: { integration: IntegrationView }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/integrations/${provider}`, {
    method: "PATCH",
    body: JSON.stringify({ options }),
  });
  return unwrap(res);
}

export async function testIntegration(
  slug: string,
  provider: string,
): Promise<{
  data?: { integration: IntegrationView; test: { ok: boolean; message?: string } };
  error?: string;
}> {
  const res = await apiFetch(`/v1/orgs/${slug}/integrations/${provider}/test`, {
    method: "POST",
  });
  return unwrap(res);
}

export async function removeIntegration(
  slug: string,
  provider: string,
): Promise<{ error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/integrations/${provider}`, {
    method: "DELETE",
  });
  const out = await unwrap(res);
  return { error: out.error };
}
