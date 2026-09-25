---
title: Delete and restore organizations
date: 2026-09-25
tag: New
area: Platform
---

Organization owners can now delete an organization from **Settings -> General ->
Danger zone**, by asking the assistant, or with `DELETE /orgs/{slug}`.

- **Gone for everyone at once.** A deleted organization, with its projects,
  members, teams, and invitations, behaves as if it does not exist for every
  member, and its organization access tokens stop working immediately. Members
  are notified, and the deletion is audited.
- **Restorable for 30 days.** Owners find it under **Settings -> Organizations ->
  Recently deleted** (or `GET /deleted-orgs`) and restore it with everything
  intact. If its slug was taken in the meantime, restore it under a new one.
- **Slugs are freed right away,** so a new organization can take a deleted one's
  name. Deleted organizations don't count toward the free plan's one owned
  organization; restoring one does.

New tools `delete_organization`, `list_deleted_organizations`, and
`restore_organization` bring the same flow to the assistant and MCP. See
[Organizations](/docs/platform/organizations#deleting-an-organization).
