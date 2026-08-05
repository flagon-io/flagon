import {
  deprovisionScimUser,
  getScimUser,
  patchScimUser,
  replaceScimUser,
  type ScimUserPayload,
} from "@/lib/scim/provision";
import { scimError, scimJson, toScimUser } from "@/lib/scim/resource";
import { isUuid, readJson, withScim } from "@/lib/scim/handler";

export const dynamic = "force-dynamic";

// The [id] segment is the SCIM resource id (scim_users.id, a UUID). Next 16 route
// params are async, so each handler pulls it from the request path. Returns null
// for a malformed/non-UUID segment so the caller can 404 instead of tripping a
// Postgres uuid cast error (which would 500 and leak the DB message).
function resourceId(req: Request): string | null {
  const parts = new URL(req.url).pathname.split("/");
  let raw: string;
  try {
    raw = decodeURIComponent(parts[parts.length - 1] ?? "");
  } catch {
    return null;
  }
  return isUuid(raw) ? raw : null;
}

/** GET /scim/v2/Users/{id} */
export const GET = withScim(async ({ organizationId, baseUrl, req }) => {
  const id = resourceId(req);
  if (!id) return scimError(404, "User not found.");
  const view = await getScimUser(organizationId, id);
  if (!view) return scimError(404, "User not found.");
  return scimJson(toScimUser(view, baseUrl));
});

/** PUT /scim/v2/Users/{id} — full replace (only `active` has side effects here). */
export const PUT = withScim(async ({ organizationId, baseUrl, req }) => {
  const id = resourceId(req);
  if (!id) return scimError(404, "User not found.");
  const payload = await readJson<ScimUserPayload>(req);
  const view = await replaceScimUser(organizationId, id, payload);
  if (!view) return scimError(404, "User not found.");
  return scimJson(toScimUser(view, baseUrl));
});

/** PATCH /scim/v2/Users/{id} — PatchOp; primarily active:false deprovisioning. */
export const PATCH = withScim(async ({ organizationId, baseUrl, req }) => {
  const id = resourceId(req);
  if (!id) return scimError(404, "User not found.");
  const body = await readJson<{ Operations?: unknown[]; operations?: unknown[] }>(
    req,
  );
  const operations = (body.Operations ?? body.operations ?? []) as {
    op?: string;
    path?: string;
    value?: unknown;
  }[];
  const view = await patchScimUser(organizationId, id, operations);
  if (!view) return scimError(404, "User not found.");
  return scimJson(toScimUser(view, baseUrl));
});

/** DELETE /scim/v2/Users/{id} — deprovision (remove membership; keep the account). */
export const DELETE = withScim(async ({ organizationId, req }) => {
  const id = resourceId(req);
  if (!id) return scimError(404, "User not found.");
  const ok = await deprovisionScimUser(organizationId, id, { hard: true });
  if (!ok) return scimError(404, "User not found.");
  return new Response(null, { status: 204 });
});
