# Security policy

Thank you for helping keep Flagon and the people who use it safe. If you believe
you have found a security vulnerability, please report it privately, as described
below, rather than in a public issue, pull request, or discussion.

## Reporting a vulnerability

Email **[hey@flagon.io](mailto:hey@flagon.io)** with a subject line that starts
with `[security]`. This is the same contact our
[security and trust](https://github.com/flagon-io/flagon/blob/main/docs/handbook/engineering/security.mdx)
page publishes.

Please include as much of the following as you can:

- what the issue is and what an attacker could do with it;
- the component affected (the web app, the API, the MCP server, the design
  system, or a self-hosted deployment) and the commit or version you tested;
- step-by-step instructions to reproduce it, with any proof-of-concept code,
  requests, or screenshots;
- whether you believe it is already being exploited;
- how you would like to be credited, if at all.

Please do not access, change, or delete data that is not yours, do not degrade
the service for others, and give us a reasonable chance to fix the issue before
you disclose it publicly.

## What to expect

Flagon is a small team, so these are good-faith goals rather than guarantees:

- we aim to acknowledge your report within a few business days;
- we will tell you whether we can reproduce it and keep you updated while we
  work on a fix;
- we fix security issues quietly, ship the fix, and then describe what happened;
- with your permission, we will credit you when the fix is announced.

We will not pursue or support legal action against good-faith research that
follows this policy.

## Supported versions

Flagon ships continuously from the `main` branch. Security fixes land on `main`
and in the hosted service at [app.flagon.io](https://app.flagon.io); there are no
separately maintained release branches. If you self-host, run a recent build of
`main` to receive fixes.

| Version | Supported |
| --- | --- |
| `main` (latest) and the hosted service | Yes |
| Older commits and builds | No, please upgrade |

## More

The security model, its trust boundaries, and its current known limitations are
documented in the
[security overview](https://github.com/flagon-io/flagon/blob/main/docs/security/overview.mdx).
