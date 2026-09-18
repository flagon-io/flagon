// Server-side gateway to the Go API. The app is the only caller that holds the
// internal token; it has already verified the user's session, so it forwards
// the verified user identity via headers. Never import this from client code
// (it reads the session and the internal token).
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const API_URL = process.env.FLAGON_API_URL ?? "http://localhost:8080";
const INTERNAL_TOKEN = process.env.FLAGON_INTERNAL_TOKEN ?? "";

export interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
  created_at: string;
}

export interface Me {
  user: { id: string; email: string; created_at: string };
  orgs: Org[];
}

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

async function call(
  path: string,
  init: RequestInit,
  user: { id: string; email: string },
) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_TOKEN}`,
      "X-Flagon-User-Id": user.id,
      "X-Flagon-User-Email": user.email,
      ...init.headers,
    },
    cache: "no-store",
  });
}

/** Current user + their orgs, or null when not signed in. */
export async function getMe(): Promise<Me | null> {
  const user = await currentUser();
  if (!user) return null;
  const res = await call("/me", { method: "GET" }, user);
  if (!res.ok) throw new Error(`api /me failed (${res.status})`);
  return res.json();
}

// --- AI agent -------------------------------------------------------------

export interface AgentProposal {
  tool: string;
  input: unknown;
  summary: string;
}

export interface AgentResult {
  reply: string;
  proposals: AgentProposal[] | null;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

/** Send the conversation to the Flagon agent (scoped to an org). */
export async function agentMessage(orgId: string, messages: AgentMessage[]): Promise<AgentResult> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    "/ai/messages",
    { method: "POST", body: JSON.stringify({ org_id: orgId, messages }) },
    user,
  );
  if (res.status === 429) throw new Error("You've hit this organization's AI usage limit. Try again later.");
  if (!res.ok) throw new Error(`The assistant is unavailable right now (${res.status}).`);
  return res.json();
}

/** Execute a confirmed agent action (human-in-the-loop). */
export async function agentExecute(orgId: string, tool: string, input: unknown): Promise<unknown> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    "/ai/actions/execute",
    { method: "POST", body: JSON.stringify({ org_id: orgId, tool, input }) },
    user,
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? `Could not complete that action (${res.status}).`);
  }
  const data = await res.json();
  return data.result;
}

/** Create an org owned by the current user. Throws on conflict/other errors. */
export async function createOrg(name: string, slug?: string): Promise<Org> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    "/orgs",
    { method: "POST", body: JSON.stringify({ name, slug }) },
    user,
  );
  if (res.status === 409) throw new Error("That organization name is already taken.");
  if (res.status === 422) throw new Error("Please enter a valid organization name.");
  if (res.status === 402) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(
      data.detail ??
        "The free plan includes one organization. Add a payment method to create more.",
    );
  }
  if (!res.ok) throw new Error(`api /orgs failed (${res.status})`);
  return res.json();
}

export async function updateOrg(slug: string, name: string): Promise<Org> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to change this organization.");
  if (res.status === 422) throw new Error("Please enter a valid organization name.");
  if (!res.ok) throw new Error(`api update org failed (${res.status})`);
  return res.json();
}

// --- Projects -------------------------------------------------------------

export interface Project {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string;
  readme: string;
  repository_url: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectBody {
  name: string;
  slug?: string;
  description?: string;
  readme?: string;
  repository_url?: string;
}

export async function listProjects(slug: string): Promise<Project[]> {
  const user = await currentUser();
  if (!user) return [];
  const res = await call(`/orgs/${encodeURIComponent(slug)}/projects`, { method: "GET" }, user);
  if (!res.ok) throw new Error(`api projects failed (${res.status})`);
  const data = await res.json();
  return data.projects ?? [];
}

export async function getProject(slug: string, project: string): Promise<Project | null> {
  const user = await currentUser();
  if (!user) return null;
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}`,
    { method: "GET" },
    user,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`api project failed (${res.status})`);
  return res.json();
}

export async function createProject(slug: string, body: CreateProjectBody): Promise<Project> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects`,
    { method: "POST", body: JSON.stringify(body) },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to create projects here.");
  if (res.status === 409) throw new Error("A project with that slug already exists.");
  if (res.status === 422) throw new Error("Please enter a valid project name.");
  if (!res.ok) throw new Error(`api create project failed (${res.status})`);
  return res.json();
}

// --- Org members (RBAC) ---------------------------------------------------

export interface Member {
  user_id: string;
  name: string | null;
  email: string;
  username: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
}

export async function listMembers(slug: string): Promise<Member[]> {
  const user = await currentUser();
  if (!user) return [];
  const res = await call(`/orgs/${encodeURIComponent(slug)}/members`, { method: "GET" }, user);
  if (!res.ok) throw new Error(`api members failed (${res.status})`);
  const data = await res.json();
  return data.members ?? [];
}

async function memberMutation(res: Response): Promise<void> {
  if (res.ok) return;
  const data = (await res.json().catch(() => ({}))) as { detail?: string };
  throw new Error(data.detail ?? "That action could not be completed.");
}

export async function addMember(slug: string, login: string, role: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/members`,
    { method: "POST", body: JSON.stringify({ login, role }) },
    user,
  );
  await memberMutation(res);
}

export async function setMemberRole(slug: string, userId: string, role: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/role`,
    { method: "PUT", body: JSON.stringify({ role }) },
    user,
  );
  await memberMutation(res);
}

export async function removeMember(slug: string, userId: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    user,
  );
  await memberMutation(res);
}

// --- Org invitations ------------------------------------------------------

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  inviter: string | null;
  expires_at: string;
  created_at: string;
}

/** The public, pre-auth view of an invitation (looked up by token). */
export interface InviteLookup {
  id: string;
  org_slug: string;
  org_name: string;
  email: string;
  role: string;
  status: string;
  expired: boolean;
  inviter: string;
}

/** Result of inviting: an existing user was added, or a pending invite created. */
export interface InviteResult {
  status: "added" | "invited";
  user_id?: string;
  email?: string;
  org_name?: string;
  token?: string;
  invitation?: Invitation;
}

/** Invite by email or username. Existing users are added; unknown emails get a
 *  pending invitation (whose single-use token is returned for the invite link). */
export async function inviteMember(slug: string, login: string, role: string): Promise<InviteResult> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/invitations`,
    { method: "POST", body: JSON.stringify({ login, role }) },
    user,
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? "That invitation could not be sent.");
  }
  return res.json();
}

export async function listInvitations(slug: string): Promise<Invitation[]> {
  const user = await currentUser();
  if (!user) return [];
  const res = await call(`/orgs/${encodeURIComponent(slug)}/invitations`, { method: "GET" }, user);
  if (!res.ok) throw new Error(`api invitations failed (${res.status})`);
  const data = await res.json();
  return data.invitations ?? [];
}

export async function revokeInvitation(slug: string, id: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/invitations/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    user,
  );
  await memberMutation(res);
}

/** Public: resolve an invite token to its details (no session required). */
export async function getInvitation(token: string): Promise<InviteLookup | null> {
  const res = await fetch(`${API_URL}/invitations/${encodeURIComponent(token)}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`api invitation lookup failed (${res.status})`);
  return res.json();
}

/** Accept an invitation as an explicit (already verified) user identity. Used by
 *  the register-via-invite flow, where the session cookie isn't on the request
 *  yet, so we forward the freshly created user directly. */
export async function acceptInvitationAs(
  user: { id: string; email: string },
  token: string,
): Promise<{ org_slug: string; org_name: string }> {
  const res = await call(
    `/invitations/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
    user,
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? "This invitation could not be accepted.");
  }
  return res.json();
}

/** Accept an invitation as the currently signed-in user. */
export async function acceptInvitation(token: string): Promise<{ org_slug: string; org_name: string }> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  return acceptInvitationAs({ id: user.id, email: user.email }, token);
}

// --- Access tokens (PAT + OAT) --------------------------------------------

export interface AccessToken {
  id: string;
  kind: string;
  name: string;
  prefix: string;
  role: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface CreatedToken {
  token: string;
  id: string;
  prefix: string;
}

async function createToken(path: string, body: unknown): Promise<CreatedToken> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(path, { method: "POST", body: JSON.stringify(body) }, user);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? "Could not create the token.");
  }
  return res.json();
}

async function listTokens(path: string): Promise<AccessToken[]> {
  const user = await currentUser();
  if (!user) return [];
  const res = await call(path, { method: "GET" }, user);
  if (!res.ok) throw new Error(`api tokens failed (${res.status})`);
  const data = await res.json();
  return data.tokens ?? [];
}

async function revokeToken(path: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(path, { method: "DELETE" }, user);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? "Could not revoke the token.");
  }
}

export interface CreateTokenBody {
  name: string;
  scopes?: string[];
  full?: boolean;
  expires_in_days?: number;
  expires_at?: string;
  role?: string;
}

export const createPAT = (body: CreateTokenBody) => createToken("/me/tokens", body);
export const listPATs = () => listTokens("/me/tokens");
export const revokePAT = (id: string) => revokeToken(`/me/tokens/${encodeURIComponent(id)}`);

export const createOAT = (slug: string, body: CreateTokenBody) =>
  createToken(`/orgs/${encodeURIComponent(slug)}/tokens`, body);
export const listOATs = (slug: string) => listTokens(`/orgs/${encodeURIComponent(slug)}/tokens`);
export const revokeOAT = (slug: string, id: string) =>
  revokeToken(`/orgs/${encodeURIComponent(slug)}/tokens/${encodeURIComponent(id)}`);

// --- Notifications --------------------------------------------------------

export interface Notification {
  id: string;
  org_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export async function listNotifications(limit = 30): Promise<Notification[]> {
  const user = await currentUser();
  if (!user) return [];
  const res = await call(`/notifications?limit=${limit}`, { method: "GET" }, user);
  if (!res.ok) throw new Error(`api /notifications failed (${res.status})`);
  const data = await res.json();
  return data.notifications ?? [];
}

export async function unreadNotificationCount(): Promise<number> {
  const user = await currentUser();
  if (!user) return 0;
  const res = await call("/notifications/unread-count", { method: "GET" }, user);
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await call(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }, user);
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await call("/notifications/read-all", { method: "POST" }, user);
}

/** Remove the current user's membership from an org. */
export async function leaveOrg(slug: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(`/orgs/${encodeURIComponent(slug)}/leave`, { method: "POST" }, user);
  if (res.status === 409) {
    throw new Error(
      "You're the only owner. Transfer ownership or delete the organization first.",
    );
  }
  if (res.status === 404) throw new Error("You're not a member of that organization.");
  if (!res.ok) throw new Error(`leave failed (${res.status})`);
}
