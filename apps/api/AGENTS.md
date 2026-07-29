# Flagon API conventions

Model the HTTP surface on GitHub's REST API.

## The API is the control plane

Every capability lives here, as a `/v1` (or `/api/auth`, `/ofrep`) endpoint —
so every client behaves the same: the Next console, and future mobile/desktop
apps, are all just clients of this API. Auth (BetterAuth is hosted here, mounted
at `/api/auth/*`), org/member/invite management, access tokens, billing, and the
flags product are all API-owned. **Never add a capability that only the console
can do via a direct DB write** — if the console needs to change data, it does so
through an endpoint here, so any client can too. The console MAY still read the
shared DB for rendering convenience, but writes and business rules belong to the
API. When you add a mutation, add its `/v1` endpoint + OpenAPI registration in
the same change.

## Response bodies

- **Return the resource as-is.** A single resource is a JSON object; a collection
  is a JSON array. There is NO top-level envelope: no `data`, no `result`, no
  `{ items: [...] }` wrapper. `GET /v1/me` returns the identity object directly;
  a future `GET /v1/orgs` returns an array of orgs directly.
- **Errors** are the one shaped envelope, so a client parses a failure the same
  way every time: `{ "message": string, "status": number }`, plus `errors` (a
  per-field map) on 422 validation failures. See `src/lib/http.ts`.
- **Pagination and metadata travel in HEADERS, never in the body.** Follow
  GitHub: a `Link` header (`rel="next"`/`"prev"`/`"first"`/`"last"`) for page
  navigation, and headers like `X-Total-Count` for counts. The body stays a bare
  array so clients can consume it without unwrapping.

## Health

`GET /healthz` (unversioned, operational) and `GET /v1/healthz` (documented)
return only `{ status, time }` (plus `version` on the versioned one). No service
identity — a probe just needs up/not-up and the time.

## Routing

Every route registers itself via `registerRoute()` at import time (see
`src/openapi/registry.ts`); that single call feeds both the root hypermedia index
(`GET /`) and `GET /openapi.json`. Add a route → register it → it appears in both.
