---
title: Security hardening across the API
date: 2026-09-25
tag: Improved
area: Platform
---

A round of hardening so the same rules hold no matter how you reach Flagon.

- **Required 2FA and SSO are enforced by the API.** An organization's two-factor
  and single sign-on requirements now apply to personal access tokens, the
  assistant, and MCP, not just the dashboard.
- **SSO credentials are encrypted at rest**, with a documented key rotation path.
- **Invitation emails are sent for every front door.** Inviting someone through the
  API, the assistant, or MCP now emails them, just like the dashboard.
- **Rate limits and body limits.** Requests are rate limited per caller (`429` with
  `Retry-After`) and oversized bodies are refused (`413`).
- **Every response carries an `X-Request-Id`**, and server errors no longer include
  internal details. Quote the id when you report a problem.
- **Audit entries are harder to fake** and now record the client IP and user agent
  for changes made through the assistant and MCP too.
- **The assistant stays in its organization:** it can only act in the organization
  you're working in, and confirmed actions count against that organization's AI
  quota.

Self-hosters: production now refuses to start without its required secrets. See
[Production](/docs/self-hosting/production) and the
[configuration reference](/docs/reference/configuration).
