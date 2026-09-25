import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { getOrgSecurity, setOrgSecurity, type BasePermission, type OrgSecurity } from "@/lib/flagon-api";
import { currentUser } from "@/lib/session";
import { mirrorUserById } from "@/lib/user-profile";

const BASE_PERMISSIONS: BasePermission[] = ["none", "read", "triage", "write", "maintain", "admin"];

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const security = await getOrgSecurity(slug);
    return NextResponse.json(security);
  } catch (e) {
    return routeError(e);
  }
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
    // sends only its own fields and must never clobber the other's. If the current
    // policy can't be read, the write fails rather than merging onto defaults.
    const current = await getOrgSecurity(slug);
    const merged: OrgSecurity = { ...current };
    if (typeof body.enforce_two_factor === "boolean") merged.enforce_two_factor = body.enforce_two_factor;
    if (typeof body.require_sso === "boolean") merged.require_sso = body.require_sso;
    if (typeof body.base_permission === "string" && BASE_PERMISSIONS.includes(body.base_permission as BasePermission)) {
      merged.base_permission = body.base_permission as BasePermission;
    }
    // Switching a requirement on is refused by the API unless the caller meets it
    // (2FA on, an SSO identity linked), judged from the API's mirror of the auth
    // layer. Refresh that mirror first so a recent change is taken into account.
    if (
      (merged.enforce_two_factor && !current.enforce_two_factor) ||
      (merged.require_sso && !current.require_sso)
    ) {
      const user = await currentUser();
      if (user) await mirrorUserById(user.id);
    }
    const security = await setOrgSecurity(slug, merged);
    return NextResponse.json(security);
  } catch (e) {
    return routeError(e, "Could not update the setting.");
  }
}
