// Request-scoped org context for server components under /[org]. The [org]
// layout and every page call this; React `cache()` makes it one session lookup
// and one /me round trip per request. Not signed in -> /login, not a member ->
// 404 (indistinguishable from a missing org, so nothing leaks). An API failure
// THROWS (to the nearest error.tsx): a failed /me must never be mistaken for a
// lesser role or for "not signed in".
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getMe } from "@/lib/api/orgs";

export const getOrgContext = cache(async (slug: string) => {
  const session = await getSession();
  if (!session) redirect("/login");
  const me = await getMe();
  if (!me) redirect("/login");
  const org = me.orgs.find((o) => o.slug === slug);
  if (!org) notFound();
  return { session, user: session.user, me, org, role: org.role };
});

/** Owners and admins manage org-wide settings (audit log, security, tokens). */
export function isOrgAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Signed-in context for pages outside an org (personal /settings, /new). Not
 * signed in -> /login; API failures throw.
 */
export const requireMe = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  const me = await getMe();
  if (!me) redirect("/login");
  return { session, user: session.user, me };
});
