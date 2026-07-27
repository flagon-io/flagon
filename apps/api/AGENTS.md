# Flagon API conventions

Model the HTTP surface on GitHub's REST API.

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
