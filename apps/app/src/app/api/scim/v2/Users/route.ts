import {
  provisionScimUser,
  listScimUsers,
  type ScimUserPayload,
} from "@/lib/scim/provision";
import { listResponse, scimError, scimJson, toScimUser } from "@/lib/scim/resource";
import {
  UNPARSEABLE_FILTER,
  parseUserNameFilter,
  readJson,
  withScim,
} from "@/lib/scim/handler";

// SCIM writes to the auth tables; never statically optimize this route.
export const dynamic = "force-dynamic";

/** GET /scim/v2/Users — list provisioned members, optionally `?filter=userName eq "..."`. */
export const GET = withScim(async ({ organizationId, baseUrl, req }) => {
  const filter = parseUserNameFilter(req.url);
  // A filter we don't support must not silently return the whole org.
  if (filter === UNPARSEABLE_FILTER) {
    return scimError(400, "Unsupported filter. Only `userName eq` is supported.", "invalidFilter");
  }
  const rows = await listScimUsers(organizationId, filter ?? undefined);
  return scimJson(listResponse(rows.map((u) => toScimUser(u, baseUrl))));
});

/** POST /scim/v2/Users — provision (create or link) a member. Errors (409/400/403)
 *  are mapped centrally in withScim. */
export const POST = withScim(async ({ organizationId, baseUrl, req }) => {
  const payload = await readJson<ScimUserPayload>(req);
  const view = await provisionScimUser(organizationId, payload);
  return scimJson(toScimUser(view, baseUrl), 201);
});
