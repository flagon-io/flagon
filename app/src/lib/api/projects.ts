// Projects, their collaborators, team grants, and owners.
import { cache } from "react";
import { orgPath, projectPath, request, requestOrNull, requestPage } from "./client";
import type {
  CreateProjectBody,
  ListOptions,
  OwnerType,
  Page,
  Project,
  ProjectMember,
  ProjectOwner,
  ProjectTeam,
  UpdateProjectBody,
} from "./types";

export function listProjects(slug: string, opts?: ListOptions): Promise<Page<Project>> {
  return requestPage<Project>(`${orgPath(slug)}/projects`, "projects", opts);
}

/** The org's soft-deleted projects (the restore archive). Owners/admins only. */
export function listDeletedProjects(slug: string, opts?: ListOptions): Promise<Page<Project>> {
  return requestPage<Project>(`${orgPath(slug)}/deleted-projects`, "projects", opts, {
    messages: { 403: "Only organization owners and admins can see deleted projects." },
  });
}

/** A project, or null when it doesn't exist (or isn't visible to the viewer). */
export const getProject = cache((slug: string, project: string): Promise<Project | null> => {
  return requestOrNull<Project>(projectPath(slug, project));
});

export function createProject(slug: string, body: CreateProjectBody): Promise<Project> {
  return request<Project>(`${orgPath(slug)}/projects`, {
    method: "POST",
    body,
    messages: {
      403: "You don't have permission to create projects here.",
      409: "A project with that slug already exists.",
      422: "Please enter a valid project name.",
    },
  });
}

export function updateProject(
  slug: string,
  project: string,
  body: UpdateProjectBody,
): Promise<Project> {
  return request<Project>(projectPath(slug, project), {
    method: "PATCH",
    body,
    messages: {
      403: "You don't have permission to edit this project.",
      404: "Project not found.",
      409: "A project with that slug already exists.",
      422: "Please enter valid project details.",
    },
  });
}

export function deleteProject(slug: string, project: string): Promise<void> {
  return request(projectPath(slug, project), {
    method: "DELETE",
    messages: {
      403: "You don't have permission to delete this project.",
      404: "Project not found.",
    },
  });
}

/** Restore a deleted project (within 30 days of deletion), optionally under a
 *  new slug: required when a live project took the old one (409 otherwise). */
export function restoreProject(slug: string, project: string, newSlug?: string): Promise<Project> {
  return request<Project>(`${projectPath(slug, project)}/restore`, {
    method: "POST",
    body: newSlug ? { slug: newSlug } : {},
    messages: {
      403: "You don't have permission to restore this project.",
      404: "No restorable project with that slug (projects can be restored for 30 days).",
      409: "That slug is taken by another project now. Restore it under a new slug.",
    },
  });
}

// --- Collaborators (per-project RBAC) -------------------------------------

const MUTATION = { fallback: "That action could not be completed." };

export function listProjectMembers(
  slug: string,
  project: string,
  opts?: ListOptions,
): Promise<Page<ProjectMember>> {
  return requestPage<ProjectMember>(`${projectPath(slug, project)}/members`, "members", opts);
}

export function addProjectMember(slug: string, project: string, login: string, role: string) {
  return request(`${projectPath(slug, project)}/members`, {
    method: "POST",
    body: { login, role },
    ...MUTATION,
  });
}

export function setProjectMemberRole(slug: string, project: string, userId: string, role: string) {
  return request(
    `${projectPath(slug, project)}/members/${encodeURIComponent(userId)}/role`,
    { method: "PUT", body: { role }, ...MUTATION },
  );
}

export function removeProjectMember(slug: string, project: string, userId: string) {
  return request(`${projectPath(slug, project)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    ...MUTATION,
  });
}

// --- Team grants ------------------------------------------------------------

export function listProjectTeams(
  slug: string,
  project: string,
  opts?: ListOptions,
): Promise<Page<ProjectTeam>> {
  return requestPage<ProjectTeam>(`${projectPath(slug, project)}/teams`, "teams", opts);
}

export function addProjectTeam(slug: string, project: string, team: string, role: string) {
  return request(`${projectPath(slug, project)}/teams`, {
    method: "POST",
    body: { team, role },
    ...MUTATION,
  });
}

export function setProjectTeamRole(slug: string, project: string, team: string, role: string) {
  return request(`${projectPath(slug, project)}/teams/${encodeURIComponent(team)}/role`, {
    method: "PUT",
    body: { role },
    ...MUTATION,
  });
}

export function removeProjectTeam(slug: string, project: string, team: string) {
  return request(`${projectPath(slug, project)}/teams/${encodeURIComponent(team)}`, {
    method: "DELETE",
    ...MUTATION,
  });
}

// --- Owners -------------------------------------------------------------------

export function listProjectOwners(
  slug: string,
  project: string,
  opts?: ListOptions,
): Promise<Page<ProjectOwner>> {
  return requestPage<ProjectOwner>(`${projectPath(slug, project)}/owners`, "owners", opts);
}

export function addProjectOwner(slug: string, project: string, type: OwnerType, login: string) {
  return request(`${projectPath(slug, project)}/owners`, {
    method: "POST",
    body: { type, login },
    ...MUTATION,
  });
}

export function removeProjectOwner(
  slug: string,
  project: string,
  type: OwnerType,
  principalId: string,
) {
  return request(
    `${projectPath(slug, project)}/owners/${encodeURIComponent(type)}/${encodeURIComponent(principalId)}`,
    { method: "DELETE", ...MUTATION },
  );
}
