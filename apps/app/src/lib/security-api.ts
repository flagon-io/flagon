import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the API's organization-security surface
 * (/v1/orgs/:org/security). Like flags-api, the console drives the same /v1
 * endpoints an API consumer would — API-first parity, no UI-only writes. The
 * caller's session cookie is forwarded so the API authorizes owner/admin.
 *
 * The SAML/OIDC provider handshake is NOT here: that lives on BetterAuth's own
 * /api/auth/sso/* namespace and is driven from the browser via authClient.sso.
 */

export type OrgSecurityPosture = {
  ssoEnforced: boolean;
  require2fa: boolean;
  ssoDefaultRole: string;
  scimEnabled: boolean;
};

export type ScimTokenMeta = {
  id: string;
  name: string;
  lastFour: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
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

export async function getSecurityPosture(
  slug: string,
): Promise<OrgSecurityPosture | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/security`);
  if (!res.ok) return null;
  return (await res.json()) as OrgSecurityPosture;
}

export async function updateSecurity(
  slug: string,
  patch: Partial<OrgSecurityPosture>,
): Promise<{ data?: OrgSecurityPosture; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/security`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return unwrap<OrgSecurityPosture>(res);
}

export async function listScimTokens(slug: string): Promise<ScimTokenMeta[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/security/scim-tokens`);
  if (!res.ok) return [];
  return (await res.json()) as ScimTokenMeta[];
}

export async function createScimToken(
  slug: string,
  body: { name: string; expiresInDays?: number },
): Promise<{ data?: { token: { id: string; token: string } }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/security/scim-tokens`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function revokeScimToken(
  slug: string,
  id: string,
): Promise<{ error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/security/scim-tokens/${id}`, {
    method: "DELETE",
  });
  const out = await unwrap(res);
  return { error: out.error };
}
