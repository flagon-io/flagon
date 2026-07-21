"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { normalizeOrgSlug, validateOrgSlug } from "@/lib/org-slug";
import { resolveOrg } from "../resolve-org";

/**
 * Organization settings. Admins rename; only the OWNER changes the slug
 * (every existing URL and API path moves with it) or deletes the
 * organization. Same helpers the /v1 org routes use.
 */
export type OrgSettingsResult = {
  ok: boolean;
  message: string;
  /** Set when the slug changed: where the caller should navigate. */
  slug?: string;
};

type Role = "owner" | "admin" | "member";

async function requireRole(orgSlug: string, roles: Role[]) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const org = await resolveOrg(orgSlug);
  if (!org) return null;
  const role = org.members.find((m) => m.userId === session.user.id)?.role;
  if (!role || !roles.includes(role as Role)) return null;
  return { org, session };
}

export async function renameOrganizationAction(
  orgSlug: string,
  name: string,
): Promise<OrgSettingsResult> {
  const ctx = await requireRole(orgSlug, ["owner", "admin"]);
  if (!ctx) return { ok: false, message: "You can't manage this organization." };

  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) {
    return { ok: false, message: "Provide a name (at most 100 characters)." };
  }

  await db
    .update(organizations)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(organizations.id, ctx.org.id));

  revalidatePath(`/app/${orgSlug}`, "layout");
  return { ok: true, message: "" };
}

export async function changeOrganizationSlugAction(
  orgSlug: string,
  rawSlug: string,
): Promise<OrgSettingsResult> {
  const ctx = await requireRole(orgSlug, ["owner"]);
  if (!ctx) {
    return {
      ok: false,
      message: "Only the organization's owner can change the URL.",
    };
  }

  const slug = normalizeOrgSlug(rawSlug);
  if (slug === orgSlug) return { ok: true, message: "", slug };
  const validation = validateOrgSlug(slug);
  if (!validation.ok) return { ok: false, message: validation.error };

  try {
    await auth.api.updateOrganization({
      body: { data: { slug }, organizationId: ctx.org.id },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        message: error.body?.message ?? "That URL is already taken.",
      };
    }
    throw error;
  }

  revalidatePath(`/app/${slug}`, "layout");
  return { ok: true, message: "", slug };
}

export async function deleteOrganizationAction(
  orgSlug: string,
): Promise<OrgSettingsResult> {
  const ctx = await requireRole(orgSlug, ["owner"]);
  if (!ctx) {
    return {
      ok: false,
      message: "Only the organization's owner can delete it.",
    };
  }

  try {
    await auth.api.deleteOrganization({
      body: { organizationId: ctx.org.id },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        ok: false,
        message: error.body?.message ?? "Could not delete the organization.",
      };
    }
    throw error;
  }

  revalidatePath("/app", "layout");
  return { ok: true, message: "" };
}
