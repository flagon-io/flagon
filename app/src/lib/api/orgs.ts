// Current user, orgs, org security policy, and the AI agent.
import { cache } from "react";
import { currentUser } from "@/lib/session";
import { orgPath, request } from "./client";
import type {
  AgentMessage,
  AgentResult,
  DeletedOrg,
  Me,
  Org,
  OrgSecurity,
} from "./types";

/**
 * Current user + their orgs, or null when not signed in. Request-scoped via
 * React `cache()`: the [org] layout and the page share one API round trip.
 * API failures throw (they are never mistaken for "not signed in").
 */
export const getMe = cache(async (): Promise<Me | null> => {
  const user = await currentUser();
  if (!user) return null;
  const me = await request<Omit<Me, "orgs"> & { orgs: Me["orgs"] | null }>("/me", {
    as: { id: user.id, email: user.email },
  });
  return { ...me, orgs: me.orgs ?? [] };
});

/** Create an org owned by the current user. */
export function createOrg(name: string, slug?: string): Promise<Org> {
  return request<Org>("/orgs", {
    method: "POST",
    body: { name, slug },
    messages: {
      409: "That organization name is already taken.",
      422: "Please enter a valid organization name.",
    },
    // 402 (plan limit) carries its own detail from the API.
    fallback: "Could not create the organization.",
  });
}

export function updateOrg(slug: string, name: string): Promise<Org> {
  return request<Org>(orgPath(slug), {
    method: "PATCH",
    body: { name },
    messages: {
      403: "You don't have permission to change this organization.",
      422: "Please enter a valid organization name.",
    },
  });
}

/** Remove the current user's membership from an org. */
export function leaveOrg(slug: string): Promise<void> {
  return request(`${orgPath(slug)}/leave`, {
    method: "POST",
    messages: {
      409: "You're the only owner. Transfer ownership or delete the organization first.",
      404: "You're not a member of that organization.",
    },
  });
}

/** Soft-delete an org (owners only). Restorable by an owner for 30 days. */
export function deleteOrg(slug: string): Promise<Org> {
  return request<Org>(orgPath(slug), {
    method: "DELETE",
    messages: {
      403: "Only an organization owner can delete it.",
      404: "Organization not found.",
    },
    fallback: "Could not delete the organization.",
  });
}

/** The orgs the caller owned that were deleted in the last 30 days. */
export async function listDeletedOrgs(): Promise<DeletedOrg[]> {
  const data = await request<{ orgs: DeletedOrg[] | null }>("/deleted-orgs");
  return data.orgs ?? [];
}

/**
 * Restore a deleted org by id. `slug` renames it on the way back, which is
 * required when its old slug was taken while it was deleted (409 otherwise).
 * 402 (plan limit) carries its own detail from the API.
 */
export function restoreOrg(id: string, slug?: string): Promise<Org> {
  return request<Org>(`/deleted-orgs/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    body: slug ? { slug } : {},
    messages: {
      403: "Only an organization owner can restore it.",
      404: "That organization can no longer be restored.",
      409: "That slug is taken now. Choose a new one to restore under.",
      422: "Please enter a valid slug.",
    },
    fallback: "Could not restore the organization.",
  });
}

export function getOrgSecurity(slug: string): Promise<OrgSecurity> {
  return request<OrgSecurity>(`${orgPath(slug)}/security`);
}

export function setOrgSecurity(slug: string, security: OrgSecurity): Promise<OrgSecurity> {
  return request<OrgSecurity>(`${orgPath(slug)}/security`, {
    method: "PUT",
    body: security,
    messages: { 403: "You don't have permission to change this." },
    fallback: "Couldn't save the setting.",
  });
}

// --- AI agent -------------------------------------------------------------

/** Send the conversation to the Flagon agent (scoped to an org). */
export function agentMessage(orgId: string, messages: AgentMessage[]): Promise<AgentResult> {
  return request<AgentResult>("/ai/messages", {
    method: "POST",
    body: { org_id: orgId, messages },
    messages: { 429: "You've hit this organization's AI usage limit. Try again later." },
    fallback: "The assistant is unavailable right now.",
  });
}

/** Execute a confirmed agent action (human-in-the-loop). */
export async function agentExecute(orgId: string, tool: string, input: unknown): Promise<unknown> {
  const data = await request<{ result: unknown }>("/ai/actions/execute", {
    method: "POST",
    body: { org_id: orgId, tool, input },
    fallback: "Could not complete that action.",
  });
  return data.result;
}
