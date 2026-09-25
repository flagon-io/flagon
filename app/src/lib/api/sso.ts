// An org's SSO providers, managed through the Go API (the source of truth and
// single writer). Owners/admins only; the API enforces it. After a change the
// caller re-syncs the auth layer's cache (lib/sso-sync.ts) so it takes effect at
// once, though every SSO sign-in re-syncs on its own anyway.
import { orgPath, request } from "./client";
import type { CreateSSOProviderBody, SSOProvider, UpdateSSOProviderBody } from "./sso-types";

const ssoPath = (slug: string) => `${orgPath(slug)}/sso/providers`;
const providerPath = (slug: string, providerId: string) =>
  `${ssoPath(slug)}/${encodeURIComponent(providerId)}`;

const FORBIDDEN = "Only organization owners and admins can manage single sign-on.";

export async function listSSOProviders(slug: string): Promise<SSOProvider[]> {
  const res = await request<{ providers: SSOProvider[] | null }>(ssoPath(slug), {
    messages: { 403: FORBIDDEN },
  });
  return res.providers ?? [];
}

export function createSSOProvider(slug: string, body: CreateSSOProviderBody): Promise<SSOProvider> {
  return request<SSOProvider>(ssoPath(slug), {
    method: "POST",
    body,
    messages: { 403: FORBIDDEN },
    fallback: "Could not add the provider.",
  });
}

export function updateSSOProvider(
  slug: string,
  providerId: string,
  body: UpdateSSOProviderBody,
): Promise<SSOProvider> {
  return request<SSOProvider>(providerPath(slug, providerId), {
    method: "PATCH",
    body,
    messages: { 403: FORBIDDEN },
    fallback: "Could not update the provider.",
  });
}

export function deleteSSOProvider(slug: string, providerId: string): Promise<void> {
  return request(providerPath(slug, providerId), {
    method: "DELETE",
    messages: { 403: FORBIDDEN },
    fallback: "Could not remove the provider.",
  });
}
