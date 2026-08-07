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

export type IntegrationConnectionModel = "byo" | "oauth";
export type IntegrationStatus = "available" | "planned";

export type IntegrationCatalogEntry = {
  key: string;
  label: string;
  category: string;
  summary: string;
  docsPath?: string;
  connection: IntegrationConnectionModel;
  status: IntegrationStatus;
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
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", cookie, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    // The API is briefly unreachable (e.g. a dev restart, or a transient network
    // blip). Degrade to a controlled 503 so readers fall back and writers surface
    // a toast — never an unhandled "fetch failed" that crashes the route.
    return new Response(
      JSON.stringify({ message: "The service is temporarily unreachable. Try again in a moment." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
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

/**
 * The provider keys this org has connected — the real, reusable "is this
 * integration set up?" check. Any surface that gates on a provider being wired up
 * (runbook step providers, and future features) reads this rather than re-deriving
 * it from the full catalog. Empty on error, so callers degrade to "nothing
 * connected" instead of throwing.
 */
export async function getConnectedProviders(slug: string): Promise<string[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/integrations/connected`);
  if (!res.ok) return [];
  const body = (await res.json()) as { providers?: string[] };
  return body.providers ?? [];
}

export type OrgCapabilities = { sms: boolean; voice: boolean };

/**
 * The paging capabilities this org can currently deliver — the cheap, secret-free
 * gate for features like voice escalation ("Not configured" when a capability
 * isn't available). Defaults to all-off if the API can't be reached.
 */
export async function getIntegrationCapabilities(slug: string): Promise<OrgCapabilities> {
  const res = await apiFetch(`/v1/orgs/${slug}/integrations/capabilities`);
  if (!res.ok) return { sms: false, voice: false };
  const body = (await res.json()) as { capabilities?: OrgCapabilities };
  return body.capabilities ?? { sms: false, voice: false };
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
