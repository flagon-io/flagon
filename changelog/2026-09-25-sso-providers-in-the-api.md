---
title: SSO providers are managed through the API, the assistant and MCP
date: 2026-09-25
tag: Improved
area: Platform
---

An organization's single sign-on providers are now owned by the Flagon API, the
same as every other setting, instead of living only in the sign-in service.

- **Every front door.** List, add, update and remove OIDC and SAML providers
  from the settings page, the REST API (`/orgs/{slug}/sso/providers`), the
  in-product assistant, or any MCP client, with the `read:org` / `write:org`
  scopes. Owners and admins only.
- **Audited.** Adding, changing and removing a provider is recorded in the
  organization's audit log.
- **Secrets stay put.** Client secrets and signing keys are write-only: reads
  report only whether one is set, and no tool ever returns one.
- **Takes effect on the next sign-in.** The sign-in service re-reads the
  provider from the API on every SSO sign-in, so a change made anywhere applies
  at once and a removed provider stops working.

Providers registered before this change are adopted automatically the first
time they are used. See [Single sign-on](/docs/platform/sso).
