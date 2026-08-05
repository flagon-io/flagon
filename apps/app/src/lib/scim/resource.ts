/**
 * SCIM 2.0 resource shaping and errors (RFC 7643 / 7644). Pure, DB-free: turns
 * our rows into the JSON shapes Okta/Azure/OneLogin expect, and standardizes the
 * error envelope. SCIM responses use the `application/scim+json` media type.
 */

export const SCIM_CONTENT_TYPE = "application/scim+json";

export const SCIM_SCHEMAS = {
  user: "urn:ietf:params:scim:schemas:core:2.0:User",
  group: "urn:ietf:params:scim:schemas:core:2.0:Group",
  listResponse: "urn:ietf:params:scim:api:messages:2.0:ListResponse",
  patchOp: "urn:ietf:params:scim:api:messages:2.0:PatchOp",
  error: "urn:ietf:params:scim:api:messages:2.0:Error",
  serviceProviderConfig:
    "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
  resourceType: "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
} as const;

/** A provisioned member, as SCIM sees it (our scim_users row joined to the user). */
export type ScimUserView = {
  scimId: string;
  externalId: string | null;
  active: boolean;
  email: string;
  name: string | null;
  username: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ScimGroupView = {
  scimId: string;
  externalId: string | null;
  displayName: string;
  role: string;
  members: { value: string; display?: string }[];
};

function baseLocation(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

/** Shape a provisioned member as a SCIM core User. */
export function toScimUser(u: ScimUserView, baseUrl: string) {
  const [givenName, ...rest] = (u.name ?? "").split(" ");
  return {
    schemas: [SCIM_SCHEMAS.user],
    id: u.scimId,
    externalId: u.externalId ?? undefined,
    userName: u.email,
    name: u.name
      ? {
          formatted: u.name,
          givenName: givenName || undefined,
          familyName: rest.length ? rest.join(" ") : undefined,
        }
      : undefined,
    displayName: u.name ?? u.email,
    emails: [{ value: u.email, primary: true, type: "work" }],
    active: u.active,
    meta: {
      resourceType: "User",
      created: u.createdAt.toISOString(),
      lastModified: u.updatedAt.toISOString(),
      location: baseLocation(baseUrl, `/api/scim/v2/Users/${u.scimId}`),
    },
  };
}

/** Shape a role-mapping group as a SCIM core Group. */
export function toScimGroup(g: ScimGroupView, baseUrl: string) {
  return {
    schemas: [SCIM_SCHEMAS.group],
    id: g.scimId,
    externalId: g.externalId ?? undefined,
    displayName: g.displayName,
    members: g.members,
    meta: {
      resourceType: "Group",
      location: baseLocation(baseUrl, `/api/scim/v2/Groups/${g.scimId}`),
    },
  };
}

/** A SCIM ListResponse envelope over already-shaped resources. */
export function listResponse(
  resources: unknown[],
  opts: { startIndex?: number; itemsPerPage?: number } = {},
) {
  return {
    schemas: [SCIM_SCHEMAS.listResponse],
    totalResults: resources.length,
    startIndex: opts.startIndex ?? 1,
    itemsPerPage: opts.itemsPerPage ?? resources.length,
    Resources: resources,
  };
}

export function scimJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": SCIM_CONTENT_TYPE },
  });
}

/** A SCIM Error envelope with the correct status + media type. */
export function scimError(
  status: number,
  detail: string,
  scimType?: string,
): Response {
  return scimJson(
    {
      schemas: [SCIM_SCHEMAS.error],
      status: String(status),
      ...(scimType ? { scimType } : {}),
      detail,
    },
    status,
  );
}
