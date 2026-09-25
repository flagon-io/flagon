// Org members, invitations, and teams.
import { cache } from "react";
import { orgPath, request, requestOrNull, requestPage, teamPath } from "./client";
import type {
  AcceptedInvitation,
  CreateTeamBody,
  Invitation,
  InviteLookup,
  InviteResult,
  ListOptions,
  Member,
  Page,
  Team,
  TeamMember,
  TeamProject,
  UpdateTeamBody,
} from "./types";
import type { Identity } from "./client";

const MUTATION = { fallback: "That action could not be completed." };

// --- Org members ------------------------------------------------------------

export function listMembers(slug: string, opts?: ListOptions): Promise<Page<Member>> {
  return requestPage<Member>(`${orgPath(slug)}/members`, "members", opts);
}

export function addMember(slug: string, login: string, role: string) {
  return request(`${orgPath(slug)}/members`, { method: "POST", body: { login, role }, ...MUTATION });
}

export function setMemberRole(slug: string, userId: string, role: string) {
  return request(`${orgPath(slug)}/members/${encodeURIComponent(userId)}/role`, {
    method: "PUT",
    body: { role },
    ...MUTATION,
  });
}

export function removeMember(slug: string, userId: string) {
  return request(`${orgPath(slug)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    ...MUTATION,
  });
}

// --- Invitations ------------------------------------------------------------

/** Invite by email or username. Existing users are added; unknown emails get a
 *  pending invitation (whose single-use token is returned for the invite link). */
export function inviteMember(slug: string, login: string, role: string): Promise<InviteResult> {
  return request<InviteResult>(`${orgPath(slug)}/invitations`, {
    method: "POST",
    body: { login, role },
    fallback: "That invitation could not be sent.",
  });
}

export function listInvitations(slug: string, opts?: ListOptions): Promise<Page<Invitation>> {
  return requestPage<Invitation>(`${orgPath(slug)}/invitations`, "invitations", opts);
}

export function revokeInvitation(slug: string, id: string) {
  return request(`${orgPath(slug)}/invitations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    ...MUTATION,
  });
}

/** Public: resolve an invite token to its details (no session required). */
export function getInvitation(token: string): Promise<InviteLookup | null> {
  return requestOrNull<InviteLookup>(`/invitations/${encodeURIComponent(token)}`, { as: null });
}

/** Accept an invitation as an explicit (already verified) user identity. Used by
 *  the register-via-invite flow, where the session cookie isn't on the request
 *  yet, so we forward the freshly created user directly. */
export function acceptInvitationAs(user: Identity, token: string): Promise<AcceptedInvitation> {
  return request<AcceptedInvitation>(`/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    as: user,
    fallback: "This invitation could not be accepted.",
  });
}

/** Accept an invitation as the currently signed-in user. */
export function acceptInvitation(token: string): Promise<AcceptedInvitation> {
  return request<AcceptedInvitation>(`/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    fallback: "This invitation could not be accepted.",
  });
}

// --- Teams --------------------------------------------------------------------

export function listTeams(slug: string, opts?: ListOptions): Promise<Page<Team>> {
  return requestPage<Team>(`${orgPath(slug)}/teams`, "teams", opts);
}

/** A team, or null when it doesn't exist (or isn't visible to the viewer). */
export const getTeam = cache((slug: string, team: string): Promise<Team | null> => {
  return requestOrNull<Team>(teamPath(slug, team));
});

export function createTeam(slug: string, body: CreateTeamBody): Promise<Team> {
  return request<Team>(`${orgPath(slug)}/teams`, {
    method: "POST",
    body,
    messages: {
      403: "You don't have permission to create teams here.",
      409: "A team with that slug already exists.",
      422: "Please enter a valid team name.",
    },
  });
}

export function updateTeam(slug: string, team: string, body: UpdateTeamBody): Promise<Team> {
  return request<Team>(teamPath(slug, team), {
    method: "PATCH",
    body,
    messages: {
      403: "You don't have permission to edit this team.",
      404: "Team not found.",
      409: "A team with that slug already exists.",
      422: "Please enter valid team details.",
    },
  });
}

export function deleteTeam(slug: string, team: string) {
  return request(teamPath(slug, team), {
    method: "DELETE",
    messages: {
      403: "You don't have permission to delete this team.",
      404: "Team not found.",
    },
  });
}

export function listTeamMembers(
  slug: string,
  team: string,
  opts?: ListOptions,
): Promise<Page<TeamMember>> {
  return requestPage<TeamMember>(`${teamPath(slug, team)}/members`, "members", opts);
}

export function listTeamProjects(
  slug: string,
  team: string,
  opts?: ListOptions,
): Promise<Page<TeamProject>> {
  return requestPage<TeamProject>(`${teamPath(slug, team)}/projects`, "projects", opts);
}

export function addTeamMember(slug: string, team: string, login: string, role: string) {
  return request(`${teamPath(slug, team)}/members`, {
    method: "POST",
    body: { login, role },
    ...MUTATION,
  });
}

export function setTeamMemberRole(slug: string, team: string, userId: string, role: string) {
  return request(`${teamPath(slug, team)}/members/${encodeURIComponent(userId)}/role`, {
    method: "PUT",
    body: { role },
    ...MUTATION,
  });
}

export function removeTeamMember(slug: string, team: string, userId: string) {
  return request(`${teamPath(slug, team)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    ...MUTATION,
  });
}
