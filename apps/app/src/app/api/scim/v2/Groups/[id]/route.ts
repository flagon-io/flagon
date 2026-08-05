import {
  deleteScimGroup,
  getScimGroup,
  patchScimGroup,
} from "@/lib/scim/provision";
import { scimError, scimJson, toScimGroup } from "@/lib/scim/resource";
import { isUuid, readJson, withScim } from "@/lib/scim/handler";

export const dynamic = "force-dynamic";

// The SCIM group resource id (scim_groups.id, a UUID). Null for a non-UUID so we
// 404 instead of tripping a Postgres uuid cast error.
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

/** GET /scim/v2/Groups/{id} */
export const GET = withScim(async ({ organizationId, baseUrl, req }) => {
  const id = resourceId(req);
  if (!id) return scimError(404, "Group not found.");
  const view = await getScimGroup(organizationId, id);
  if (!view) return scimError(404, "Group not found.");
  return scimJson(toScimGroup(view, baseUrl));
});

/** PATCH /scim/v2/Groups/{id} — member add/remove maps role onto members. */
export const PATCH = withScim(async ({ organizationId, baseUrl, req }) => {
  const id = resourceId(req);
  if (!id) return scimError(404, "Group not found.");
  const body = await readJson<{ Operations?: unknown[]; operations?: unknown[] }>(
    req,
  );
  const operations = (body.Operations ?? body.operations ?? []) as {
    op?: string;
    path?: string;
    value?: unknown;
  }[];
  const view = await patchScimGroup(organizationId, id, operations);
  if (!view) return scimError(404, "Group not found.");
  return scimJson(toScimGroup(view, baseUrl));
});

/** DELETE /scim/v2/Groups/{id} */
export const DELETE = withScim(async ({ organizationId, req }) => {
  const id = resourceId(req);
  if (!id) return scimError(404, "Group not found.");
  const ok = await deleteScimGroup(organizationId, id);
  if (!ok) return scimError(404, "Group not found.");
  return new Response(null, { status: 204 });
});
