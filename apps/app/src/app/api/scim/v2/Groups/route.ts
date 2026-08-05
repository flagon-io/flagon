import { createScimGroup, listScimGroups } from "@/lib/scim/provision";
import { listResponse, scimJson, toScimGroup } from "@/lib/scim/resource";
import { readJson, withScim } from "@/lib/scim/handler";

export const dynamic = "force-dynamic";

/** GET /scim/v2/Groups — role-mapping groups for the org. */
export const GET = withScim(async ({ organizationId, baseUrl }) => {
  const rows = await listScimGroups(organizationId);
  return scimJson(listResponse(rows.map((g) => toScimGroup(g, baseUrl))));
});

/** POST /scim/v2/Groups — create a role-mapping group. */
export const POST = withScim(async ({ organizationId, baseUrl, req }) => {
  const payload = await readJson<{ displayName?: string; externalId?: string }>(
    req,
  );
  const view = await createScimGroup(organizationId, payload);
  return scimJson(toScimGroup(view, baseUrl), 201);
});
