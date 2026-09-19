import { NextResponse } from "next/server";
import { getOrgSecurity, setOrgSecurity, type BasePermission, type OrgSecurity } from "@/lib/flagon-api";

const BASE_PERMISSIONS: BasePermission[] = ["none", "read", "triage", "write", "maintain", "admin"];
const DEFAULT_SECURITY: OrgSecurity = {
  enforce_two_factor: false,
  require_sso: false,
  base_permission: "read",
};

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const security = await getOrgSecurity(slug).catch(() => DEFAULT_SECURITY);
  return NextResponse.json(security);
}

export async function PUT(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    enforce_two_factor?: boolean;
    require_sso?: boolean;
    base_permission?: string;
  };
  try {
    // Partial merge: the policy is split across two settings pages (Authentication
    // owns 2FA + SSO, Member privileges owns the base permission), so each page
    // sends only its own fields and must never clobber the other's.
    const current = await getOrgSecurity(slug).catch(() => DEFAULT_SECURITY);
    const merged: OrgSecurity = { ...current };
    if (typeof body.enforce_two_factor === "boolean") merged.enforce_two_factor = body.enforce_two_factor;
    if (typeof body.require_sso === "boolean") merged.require_sso = body.require_sso;
    if (typeof body.base_permission === "string" && BASE_PERMISSIONS.includes(body.base_permission as BasePermission)) {
      merged.base_permission = body.base_permission as BasePermission;
    }
    const security = await setOrgSecurity(slug, merged);
    return NextResponse.json(security);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update the setting." },
      { status: 400 },
    );
  }
}
