import { SCIM_SCHEMAS, listResponse, scimJson } from "@/lib/scim/resource";
import { withScim } from "@/lib/scim/handler";

export const dynamic = "force-dynamic";

/**
 * GET /scim/v2/Schemas — the attribute schemas for the resources we support
 * (RFC 7643 §7). We advertise the core User and Group schemas with the subset of
 * attributes we actually map, which is what IdP setup validators check for.
 */
export const GET = withScim(async ({ baseUrl }) => {
  const schemas = [
    {
      id: SCIM_SCHEMAS.user,
      name: "User",
      description: "SCIM core User.",
      attributes: [
        attr("userName", "string", { required: true, uniqueness: "server" }),
        attr("active", "boolean"),
        complex("name", [
          attr("formatted", "string"),
          attr("givenName", "string"),
          attr("familyName", "string"),
        ]),
        complex("emails", [
          attr("value", "string"),
          attr("primary", "boolean"),
          attr("type", "string"),
        ], { multiValued: true }),
      ],
      meta: {
        resourceType: "Schema",
        location: `${baseUrl}/api/scim/v2/Schemas/${SCIM_SCHEMAS.user}`,
      },
    },
    {
      id: SCIM_SCHEMAS.group,
      name: "Group",
      description: "SCIM core Group (role mapping).",
      attributes: [
        attr("displayName", "string", { required: true }),
        complex("members", [
          attr("value", "string"),
          attr("display", "string"),
        ], { multiValued: true }),
      ],
      meta: {
        resourceType: "Schema",
        location: `${baseUrl}/api/scim/v2/Schemas/${SCIM_SCHEMAS.group}`,
      },
    },
  ];
  return scimJson(listResponse(schemas));
});

function attr(
  name: string,
  type: string,
  opts: { required?: boolean; multiValued?: boolean; uniqueness?: string } = {},
) {
  return {
    name,
    type,
    multiValued: opts.multiValued ?? false,
    required: opts.required ?? false,
    caseExact: false,
    mutability: "readWrite",
    returned: "default",
    uniqueness: opts.uniqueness ?? "none",
  };
}

function complex(
  name: string,
  subAttributes: unknown[],
  opts: { multiValued?: boolean } = {},
) {
  return {
    name,
    type: "complex",
    multiValued: opts.multiValued ?? false,
    required: false,
    subAttributes,
    mutability: "readWrite",
    returned: "default",
  };
}
