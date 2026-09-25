---
title: Project roles are now enforced
date: 2026-09-25
tag: Fixed
area: Platform
---

Project roles and your organization's base permission now decide who can see and
change each project, everywhere: the dashboard, the API, the assistant, and MCP.
Before this fix, any member of an organization could see and edit every project,
whatever their role.

- **Seeing a project takes `read`.** A project you can't see answers `404`, as if
  it didn't exist, and it's left out of project lists.
- **Editing its details takes `write`**, renaming its slug takes `maintain`,
  managing its collaborators and teams takes `admin`, and deleting, restoring, or
  changing its owners takes ownership.
- **Whoever creates a project is granted `admin` on it**, so they can keep working
  on it under any base permission.
- The dashboard hides the controls you can't use, and the token form now offers
  every scope, including `admin:project` and the team scopes.

**What you may notice:** with the default base permission of `read`, members can
no longer edit a project's details unless an admin grants them `write` (directly
or through a team) or raises the base permission under **Settings -> Member
privileges**. See [Project access](/docs/platform/project-access).
