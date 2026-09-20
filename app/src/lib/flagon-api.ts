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
  /** Org security policy (the app gate enforces both). */
  enforce_two_factor: boolean;
  require_sso: boolean;
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
  // Forward the END USER's request context so the API can stamp the audit log's
  // "where" (the API only sees the gateway otherwise). Vercel populates the geo
  // headers at the edge; x-forwarded-for's first hop is the client.
  const h = await headers();
  const clientIp = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const clientCountry = h.get("x-vercel-ip-country") ?? "";
  const clientUA = h.get("user-agent") ?? "";

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_TOKEN}`,
      "X-Flagon-User-Id": user.id,
      "X-Flagon-User-Email": user.email,
      "X-Flagon-Client-Ip": clientIp,
      "X-Flagon-Client-Country": clientCountry,
      "X-Flagon-Client-Ua": clientUA,
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
  /** Set only for rows from the deleted-projects archive; omitted otherwise. */
  deleted_at?: string;
}

export interface CreateProjectBody {
  name: string;
  slug?: string;
  description?: string;
  readme?: string;
  repository_url?: string;
}

// UpdateProjectBody is a partial edit: omitted fields are left unchanged.
export type UpdateProjectBody = Partial<CreateProjectBody>;

// ListOptions are the shared search + keyset-page params for any list call. They
// map to the API's ?q=&limit=&cursor= (and, for external clients, the HTTP QUERY
// body). cursor comes from a prior page's `next`.
export interface ListOptions {
  q?: string;
  cursor?: string;
  limit?: number;
}

// Page is one page of a list: the items plus the opaque cursor for the following
// page (null on the last page). The cursor is parsed from the API's RFC 5988 Link
// header, so this shape is identical for every paginated resource.
export interface Page<T> {
  items: T[];
  next: string | null;
}

function listSearch(opts?: ListOptions): string {
  const qs = new URLSearchParams();
  if (opts?.q) qs.set("q", opts.q);
  if (opts?.cursor) qs.set("cursor", opts.cursor);
  if (opts?.limit) qs.set("limit", String(opts.limit));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function listProjects(slug: string, opts?: ListOptions): Promise<Page<Project>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) throw new Error(`api projects failed (${res.status})`);
  const data = await res.json();
  return { items: data.projects ?? [], next: nextCursor(res.headers.get("Link")) };
}

// listDeletedProjects returns the org's soft-deleted projects (the restore
// archive). Org owners/admins only; returns an empty page for anyone else
// (403 -> empty).
export async function listDeletedProjects(slug: string, opts?: ListOptions): Promise<Page<Project>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/deleted-projects${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (res.status === 403) return { items: [], next: null };
  if (!res.ok) throw new Error(`api deleted projects failed (${res.status})`);
  const data = await res.json();
  return { items: data.projects ?? [], next: nextCursor(res.headers.get("Link")) };
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

export async function updateProject(
  slug: string,
  project: string,
  body: UpdateProjectBody,
): Promise<Project> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}`,
    { method: "PATCH", body: JSON.stringify(body) },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to edit this project.");
  if (res.status === 404) throw new Error("Project not found.");
  if (res.status === 409) throw new Error("A project with that slug already exists.");
  if (res.status === 422) throw new Error("Please enter valid project details.");
  if (!res.ok) throw new Error(`api update project failed (${res.status})`);
  return res.json();
}

export async function deleteProject(slug: string, project: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}`,
    { method: "DELETE" },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to delete this project.");
  if (res.status === 404) throw new Error("Project not found.");
  if (!res.ok) throw new Error(`api delete project failed (${res.status})`);
}

export async function restoreProject(slug: string, project: string): Promise<Project> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/restore`,
    { method: "POST" },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to restore this project.");
  if (res.status === 404) throw new Error("No deleted project with that slug to restore.");
  if (res.status === 409)
    throw new Error("That slug is taken by another project now. Rename it first, then restore.");
  if (!res.ok) throw new Error(`api restore project failed (${res.status})`);
  return res.json();
}

// --- Org audit log --------------------------------------------------------

export interface AuditEvent {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string;
  actor_ip: string | null;
  actor_country: string | null;
  actor_user_agent: string | null;
  created_at: string;
}

export async function listAuditEvents(slug: string, limit = 8): Promise<AuditEvent[]> {
  const user = await currentUser();
  if (!user) return [];
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/audit?limit=${limit}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.events ?? [];
}

export interface AuditQuery {
  q?: string;
  actions?: string[];
  actor?: string;
  perPage?: number;
  before?: string;
}

export interface AuditPage {
  events: AuditEvent[];
  next: string | null;
}

// nextCursor pulls the opaque next-page cursor out of an RFC 5988 Link header's
// rel="next" target, or null when there is no next page. `param` is the cursor's
// query-param name; every list (including the audit log) uses "cursor". Reusable
// for every paginated list.
function nextCursor(link: string | null, param = "cursor"): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    if (!/rel="?next"?/.test(part)) continue;
    const m = part.match(/<([^>]+)>/);
    if (!m) continue;
    try {
      return new URL(m[1], "http://internal").searchParams.get(param);
    } catch {
      return null;
    }
  }
  return null;
}

export interface AuditConfig {
  ip_disclosure: boolean;
}

export async function getAuditConfig(slug: string): Promise<AuditConfig> {
  const user = await currentUser();
  if (!user) return { ip_disclosure: false };
  const res = await call(`/orgs/${encodeURIComponent(slug)}/audit/config`, { method: "GET" }, user);
  if (!res.ok) return { ip_disclosure: false };
  return res.json();
}

export async function setAuditConfig(slug: string, ipDisclosure: boolean): Promise<AuditConfig> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/audit/config`,
    { method: "PUT", body: JSON.stringify({ ip_disclosure: ipDisclosure }) },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to change this.");
  if (!res.ok) throw new Error("Couldn't save the setting.");
  return res.json();
}

export type BasePermission = "none" | "read" | "triage" | "write" | "maintain" | "admin";

export interface OrgSecurity {
  enforce_two_factor: boolean;
  require_sso: boolean;
  base_permission: BasePermission;
}

const DEFAULT_ORG_SECURITY: OrgSecurity = {
  enforce_two_factor: false,
  require_sso: false,
  base_permission: "read",
};

export async function getOrgSecurity(slug: string): Promise<OrgSecurity> {
  const user = await currentUser();
  if (!user) return DEFAULT_ORG_SECURITY;
  const res = await call(`/orgs/${encodeURIComponent(slug)}/security`, { method: "GET" }, user);
  if (!res.ok) return DEFAULT_ORG_SECURITY;
  return res.json();
}

export async function setOrgSecurity(slug: string, security: OrgSecurity): Promise<OrgSecurity> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/security`,
    { method: "PUT", body: JSON.stringify(security) },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to change this.");
  if (!res.ok) throw new Error("Couldn't save the setting.");
  return res.json();
}

export async function listAuditPage(slug: string, query: AuditQuery = {}): Promise<AuditPage> {
  const user = await currentUser();
  if (!user) return { events: [], next: null };
  const qs = new URLSearchParams();
  if (query.q) qs.set("q", query.q);
  for (const a of query.actions ?? []) qs.append("action", a);
  if (query.actor) qs.set("actor", query.actor);
  if (query.perPage) qs.set("limit", String(query.perPage));
  if (query.before) qs.set("cursor", query.before);
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/audit?${qs.toString()}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) return { events: [], next: null };
  const data = await res.json();
  return { events: data.events ?? [], next: nextCursor(res.headers.get("link")) };
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

export async function listMembers(slug: string, opts?: ListOptions): Promise<Page<Member>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/members${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) throw new Error(`api members failed (${res.status})`);
  const data = await res.json();
  return { items: data.members ?? [], next: nextCursor(res.headers.get("Link")) };
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

// --- Project collaborators (per-project RBAC) -----------------------------

/** Repository-style project roles, lowest to highest privilege. */
export const PROJECT_ROLES = ["read", "triage", "write", "maintain", "admin"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export interface ProjectMember {
  user_id: string;
  name: string | null;
  email: string;
  username: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
}

export async function listProjectMembers(
  slug: string,
  project: string,
  opts?: ListOptions,
): Promise<Page<ProjectMember>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/members${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) throw new Error(`api project members failed (${res.status})`);
  const data = await res.json();
  return { items: data.members ?? [], next: nextCursor(res.headers.get("Link")) };
}

export async function addProjectMember(
  slug: string,
  project: string,
  login: string,
  role: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/members`,
    { method: "POST", body: JSON.stringify({ login, role }) },
    user,
  );
  await memberMutation(res);
}

export async function setProjectMemberRole(
  slug: string,
  project: string,
  userId: string,
  role: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/members/${encodeURIComponent(userId)}/role`,
    { method: "PUT", body: JSON.stringify({ role }) },
    user,
  );
  await memberMutation(res);
}

export async function removeProjectMember(
  slug: string,
  project: string,
  userId: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    user,
  );
  await memberMutation(res);
}

// --- Teams ----------------------------------------------------------------

/** A team's own membership role: maintainers manage the team, members belong. */
export const TEAM_ROLES = ["maintainer", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface Team {
  id: string;
  org_id?: string;
  name: string;
  slug: string;
  description: string;
  member_count: number;
  created_at: string;
  updated_at?: string;
}

export interface TeamMember {
  user_id: string;
  name: string | null;
  email: string;
  username: string | null;
  avatar_url: string | null;
  role: TeamRole;
  created_at: string;
}

export interface CreateTeamBody {
  name: string;
  slug?: string;
  description?: string;
}

export type UpdateTeamBody = Partial<CreateTeamBody>;

export async function listTeams(slug: string, opts?: ListOptions): Promise<Page<Team>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) throw new Error(`api teams failed (${res.status})`);
  const data = await res.json();
  return { items: data.teams ?? [], next: nextCursor(res.headers.get("Link")) };
}

export async function getTeam(slug: string, team: string): Promise<Team | null> {
  const user = await currentUser();
  if (!user) return null;
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(team)}`,
    { method: "GET" },
    user,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`api team failed (${res.status})`);
  return res.json();
}

export async function createTeam(slug: string, body: CreateTeamBody): Promise<Team> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams`,
    { method: "POST", body: JSON.stringify(body) },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to create teams here.");
  if (res.status === 409) throw new Error("A team with that slug already exists.");
  if (res.status === 422) throw new Error("Please enter a valid team name.");
  if (!res.ok) throw new Error(`api create team failed (${res.status})`);
  return res.json();
}

export async function updateTeam(
  slug: string,
  team: string,
  body: UpdateTeamBody,
): Promise<Team> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(team)}`,
    { method: "PATCH", body: JSON.stringify(body) },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to edit this team.");
  if (res.status === 404) throw new Error("Team not found.");
  if (res.status === 409) throw new Error("A team with that slug already exists.");
  if (res.status === 422) throw new Error("Please enter valid team details.");
  if (!res.ok) throw new Error(`api update team failed (${res.status})`);
  return res.json();
}

export async function deleteTeam(slug: string, team: string): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(team)}`,
    { method: "DELETE" },
    user,
  );
  if (res.status === 403) throw new Error("You don't have permission to delete this team.");
  if (res.status === 404) throw new Error("Team not found.");
  if (!res.ok) throw new Error(`api delete team failed (${res.status})`);
}

export async function listTeamMembers(
  slug: string,
  team: string,
  opts?: ListOptions,
): Promise<Page<TeamMember>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(team)}/members${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) throw new Error(`api team members failed (${res.status})`);
  const data = await res.json();
  return { items: data.members ?? [], next: nextCursor(res.headers.get("Link")) };
}

// TeamProject is a project a team has access to, with the granted role.
export interface TeamProject {
  project_id: string;
  name: string;
  slug: string;
  role: ProjectRole;
  created_at: string;
}

export async function listTeamProjects(
  slug: string,
  team: string,
  opts?: ListOptions,
): Promise<Page<TeamProject>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(team)}/projects${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) throw new Error(`api team projects failed (${res.status})`);
  const data = await res.json();
  return { items: data.projects ?? [], next: nextCursor(res.headers.get("Link")) };
}

export async function addTeamMember(
  slug: string,
  team: string,
  login: string,
  role: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(team)}/members`,
    { method: "POST", body: JSON.stringify({ login, role }) },
    user,
  );
  await memberMutation(res);
}

export async function setTeamMemberRole(
  slug: string,
  team: string,
  userId: string,
  role: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(team)}/members/${encodeURIComponent(userId)}/role`,
    { method: "PUT", body: JSON.stringify({ role }) },
    user,
  );
  await memberMutation(res);
}

export async function removeTeamMember(
  slug: string,
  team: string,
  userId: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(team)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    user,
  );
  await memberMutation(res);
}

// --- Project teams & owners -----------------------------------------------

export interface ProjectTeam {
  team_id: string;
  name: string;
  slug: string;
  role: ProjectRole;
  created_at: string;
}

export interface ProjectOwner {
  owner_type: "user" | "team";
  principal_id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  team_slug: string | null;
  created_at: string;
}

export async function listProjectTeams(
  slug: string,
  project: string,
  opts?: ListOptions,
): Promise<Page<ProjectTeam>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/teams${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) throw new Error(`api project teams failed (${res.status})`);
  const data = await res.json();
  return { items: data.teams ?? [], next: nextCursor(res.headers.get("Link")) };
}

export async function addProjectTeam(
  slug: string,
  project: string,
  team: string,
  role: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/teams`,
    { method: "POST", body: JSON.stringify({ team, role }) },
    user,
  );
  await memberMutation(res);
}

export async function setProjectTeamRole(
  slug: string,
  project: string,
  team: string,
  role: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}/role`,
    { method: "PUT", body: JSON.stringify({ role }) },
    user,
  );
  await memberMutation(res);
}

export async function removeProjectTeam(
  slug: string,
  project: string,
  team: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/teams/${encodeURIComponent(team)}`,
    { method: "DELETE" },
    user,
  );
  await memberMutation(res);
}

export async function listProjectOwners(
  slug: string,
  project: string,
  opts?: ListOptions,
): Promise<Page<ProjectOwner>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/owners${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) throw new Error(`api project owners failed (${res.status})`);
  const data = await res.json();
  return { items: data.owners ?? [], next: nextCursor(res.headers.get("Link")) };
}

export async function addProjectOwner(
  slug: string,
  project: string,
  type: "user" | "team",
  login: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/owners`,
    { method: "POST", body: JSON.stringify({ type, login }) },
    user,
  );
  await memberMutation(res);
}

export async function removeProjectOwner(
  slug: string,
  project: string,
  type: "user" | "team",
  principalId: string,
): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/owners/${encodeURIComponent(type)}/${encodeURIComponent(principalId)}`,
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

export async function listInvitations(slug: string, opts?: ListOptions): Promise<Page<Invitation>> {
  const user = await currentUser();
  if (!user) return { items: [], next: null };
  const res = await call(
    `/orgs/${encodeURIComponent(slug)}/invitations${listSearch(opts)}`,
    { method: "GET" },
    user,
  );
  if (!res.ok) throw new Error(`api invitations failed (${res.status})`);
  const data = await res.json();
  return { items: data.invitations ?? [], next: nextCursor(res.headers.get("Link")) };
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

export async function markNotificationUnread(id: string): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await call(`/notifications/${encodeURIComponent(id)}/unread`, { method: "POST" }, user);
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
