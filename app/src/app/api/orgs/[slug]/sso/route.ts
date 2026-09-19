import { NextResponse } from "next/server";
import { getMe } from "@/lib/flagon-api";
import {
  listOrgProviders,
  registerProvider,
  deleteProvider,
  type RegisterProviderInput,
} from "@/lib/sso-admin";

// SSO provider management is owners/admins only. The BetterAuth SSO plugin's own
// org gate targets its organization plugin (which we don't use), so we enforce the
// Flagon org role here before touching the provider registry.
async function requireAdminOrg(slug: string) {
  const me = await getMe().catch(() => null);
  const org = me?.orgs.find((o) => o.slug === slug);
  if (!me || !org) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  if (org.role !== "owner" && org.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { org } as const;
}

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const gate = await requireAdminOrg(slug);
  if ("error" in gate) return gate.error;
  return NextResponse.json({ providers: await listOrgProviders(gate.org.id) });
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const gate = await requireAdminOrg(slug);
  if ("error" in gate) return gate.error;
  const input = (await request.json().catch(() => null)) as RegisterProviderInput | null;
  if (!input || (input.protocol !== "oidc" && input.protocol !== "saml") || !input.providerId) {
    return NextResponse.json({ error: "Invalid provider details." }, { status: 400 });
  }
  try {
    await registerProvider(gate.org.id, input);
    return NextResponse.json({ ok: true, providers: await listOrgProviders(gate.org.id) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not register the provider." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const gate = await requireAdminOrg(slug);
  if ("error" in gate) return gate.error;
  const providerId = new URL(request.url).searchParams.get("providerId") ?? "";
  if (!providerId) return NextResponse.json({ error: "Missing providerId." }, { status: 400 });
  await deleteProvider(gate.org.id, providerId);
  return NextResponse.json({ ok: true, providers: await listOrgProviders(gate.org.id) });
}
