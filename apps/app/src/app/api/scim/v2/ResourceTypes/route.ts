import { SCIM_SCHEMAS, listResponse, scimJson } from "@/lib/scim/resource";
import { withScim } from "@/lib/scim/handler";

export const dynamic = "force-dynamic";

/**
 * GET /scim/v2/ResourceTypes — the resource types this server exposes (User,
 * Group), per RFC 7643 §6. IdPs enumerate these during discovery.
 */
export const GET = withScim(async ({ baseUrl }) => {
  const types = [
    {
      schemas: [SCIM_SCHEMAS.resourceType],
      id: "User",
      name: "User",
      endpoint: "/Users",
      description: "Provisioned organization member.",
      schema: SCIM_SCHEMAS.user,
      meta: {
        resourceType: "ResourceType",
        location: `${baseUrl}/api/scim/v2/ResourceTypes/User`,
      },
    },
    {
      schemas: [SCIM_SCHEMAS.resourceType],
      id: "Group",
      name: "Group",
      endpoint: "/Groups",
      description: "Role-mapping group.",
      schema: SCIM_SCHEMAS.group,
      meta: {
        resourceType: "ResourceType",
        location: `${baseUrl}/api/scim/v2/ResourceTypes/Group`,
      },
    },
  ];
  return scimJson(listResponse(types));
});
