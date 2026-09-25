---
title: Organizations, members, and tenant isolation
date: 2026-09-18
tag: Shipped
area: Platform
---

The multi-tenant core every other feature lives in is complete. Organizations are
the top-level tenant, and everything else - projects, teams, tokens, settings -
belongs to one.

- **Organizations** with org-scoped URLs (`app.flagon.io/<org>/...`), created from
  the dashboard, the API, or the assistant.
- **Members and roles.** Owners, admins, and members, with a guarded role
  hierarchy: only owners manage owners, and an organization can never lose its
  last owner.
- **Email invitations.** Invite anyone by email; the invite link registers and
  joins in one step, and doubles as email verification.
- **Tenant isolation in the database.** Every query runs under forced Postgres
  row-level security as a role that cannot bypass it, so one organization can
  never see another's data, whichever front door a request comes through.

See [Organizations](/docs/platform/organizations) and
[Members and invitations](/docs/platform/members).
