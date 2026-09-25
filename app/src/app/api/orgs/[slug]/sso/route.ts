import { NextResponse } from "next/server";
import { getMe } from "@/lib/flagon-api";
import { badRequest, routeError } from "@/lib/route-error";
import {
  createSSOProvider,
  deleteSSOProvider,
  listSSOProviders,
  updateSSOProvider,
} from "@/lib/api/sso";
import type { CreateSSOProviderBody, UpdateSSOProviderBody } from "@/lib/api/sso-types";
import { syncSSOProviders } from "@/lib/sso-sync";

// SSO providers are managed through the Flagon API, which enforces owner/admin
// access, validates the configuration, masks secrets and audits every change.
// This route is a thin gateway; after a change it re-syncs the auth layer's
// provider cache for the org so the change takes effect at once (every SSO
// sign-in re-syncs on its own too, which is how agent/MCP changes land).

async function refreshCache(slug: string) {
  try {
    const org = (await getMe())?.orgs.find((o) => o.slug === slug);
    if (org) await syncSSOProviders({ orgId: org.id });
  } catch (e) {
    // The API change committed; the next SSO sign-in re-syncs regardless.
    console.error("[sso] cache refresh after a provider change failed", e);
  }
}

async function listResponse(slug: string) {
  return NextResponse.json({ providers: await listSSOProviders(slug) });
}

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    return await listResponse(slug);
  } catch (e) {
    return routeError(e, "Could not load the providers.");
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => null)) as CreateSSOProviderBody | null;
  if (!body || (body.type !== "oidc" && body.type !== "saml") || !body.provider_id) {
    return badRequest("Invalid provider details.");
  }
  try {
    await createSSOProvider(slug, body);
    await refreshCache(slug);
    return await listResponse(slug);
  } catch (e) {
    return routeError(e, "Could not add the provider.");
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const providerId = new URL(request.url).searchParams.get("providerId") ?? "";
  if (!providerId) return badRequest("Missing providerId.");
  const body = (await request.json().catch(() => null)) as UpdateSSOProviderBody | null;
  if (!body) return badRequest("Invalid provider details.");
  try {
    await updateSSOProvider(slug, providerId, body);
    await refreshCache(slug);
    return await listResponse(slug);
  } catch (e) {
    return routeError(e, "Could not update the provider.");
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const providerId = new URL(request.url).searchParams.get("providerId") ?? "";
  if (!providerId) return badRequest("Missing providerId.");
  try {
    await deleteSSOProvider(slug, providerId);
    await refreshCache(slug);
    return await listResponse(slug);
  } catch (e) {
    return routeError(e, "Could not remove the provider.");
  }
}
