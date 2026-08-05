import { SCIM_SCHEMAS, scimJson } from "@/lib/scim/resource";
import { withScim } from "@/lib/scim/handler";

export const dynamic = "force-dynamic";

/**
 * GET /scim/v2/ServiceProviderConfig — advertises what this SCIM server supports
 * (RFC 7643 §5). IdPs read this during setup to decide which operations to send.
 * We support create/update/delete + PATCH, filtering, and bearer auth; we do not
 * implement bulk, ETags, sort, or change-password.
 */
export const GET = withScim(async ({ baseUrl }) => {
  return scimJson({
    schemas: [SCIM_SCHEMAS.serviceProviderConfig],
    documentationUri: `${baseUrl}/docs/platform/scim`,
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description: "Authentication via a Flagon SCIM bearer token.",
        primary: true,
      },
    ],
    meta: { resourceType: "ServiceProviderConfig", location: `${baseUrl}/api/scim/v2/ServiceProviderConfig` },
  });
});
