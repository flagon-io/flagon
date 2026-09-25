---
title: Scoped access tokens and the audit log
date: 2026-09-18
tag: Shipped
area: Platform
---

Two foundations for running Flagon safely with automation in the loop:

- **Scoped access tokens.** Personal and organization access tokens carry
  fine-grained, hierarchical scopes (`read:org`, `write:project`,
  `admin:team`, ...). Enforcement fails closed, and a token is always bounded by
  the role behind it. The same tokens authenticate the REST API and the MCP
  server.
- **The audit log.** Every change to an organization is recorded in an
  append-only log, written in the same transaction as the change itself, so it
  never drifts from reality. Owners and admins can search it, filter it, and ask
  the assistant about it; actor IP disclosure is opt-in.

See [Authentication and scopes](/docs/api/authentication) and
[Audit log](/docs/platform/audit-log).
