import { brand } from "./brand";

/**
 * The OpenAPI 3.0 document for the Flagon REST API, served at
 * /api/v1/openapi.json and rendered at www.flagon.io/docs/api.
 *
 * CONVENTION (see AGENTS.md): the REST API is a first-class citizen. Anything
 * a UI can do that makes sense programmatically ships as a versioned /v1
 * endpoint backed by the SAME implementation the UI uses, and gets documented
 * here in the same change. Keep this file in lockstep with src/app/api/v1.
 */

const errorEnvelope = {
  type: "object",
  required: ["message", "code"],
  properties: {
    message: { type: "string", example: "Sign in required." },
    code: { type: "string", example: "unauthorized" },
  },
} as const;

function errorResponse(description: string, code: string, message: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
        example: { message, code },
      },
    },
  };
}

const ofrepRequestBody = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["context"],
        properties: { context: { $ref: "#/components/schemas/OfrepContext" } },
      },
    },
  },
} as const;

const ofrepErrorResponse = (description: string) => ({
  description,
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/OfrepError" } },
  },
});

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: `${brand.name} API`,
    version: "v1",
    description: [
      `The ${brand.name} REST API. Conventions: success is the HTTP status code, single resources come back as the bare object, collections as a bare array, and errors are a flat { message, code } body. Mutations return the updated resource (200/201) or nothing (204); metadata rides in headers. Pagination, when it lands, uses RFC 8288 Link headers.`,
      "",
      "Authenticate with a Bearer token in the Authorization header, or with the session cookie from a signed-in browser (which is how the console on this page works).",
      "",
      "There are two kinds of token. A PERSONAL access token acts as you: it carries your organization roles, so it can never do more than you could by hand, and it stops working when your membership does. Create one in account settings; it works against every organization you belong to with no extra configuration, because the organization is already named in the path. An ORGANIZATION token belongs to the organization itself, has no person behind it, and its authority is exactly the scopes it was granted. Create one under Organization -> API tokens. Prefer an organization token for anything shared: it outlives whoever set it up and occupies no seat.",
      "",
      "Every operation states the scope it requires. Scopes are resource:action pairs (`flags:evaluate`, `projects:write`, `usage:read`, and so on) and a `:write` scope always satisfies its matching `:read`, so there is no need to grant both. Scopes never cross resources. A valid token missing a scope gets 403 `insufficient_scope` naming what it needs, which is deliberately distinct from the 401 an invalid credential gets.",
      "",
      "No scope grants token management. Creating, rotating, and revoking credentials always requires a signed-in human, so a leaked token can never be used to issue its own replacement.",
      "",
      "State-changing requests from browsers must include an `Origin` header from a trusted origin (browsers do this automatically).",
    ].join("\n"),
  },
  servers: [{ url: brand.apiUrl }],
  tags: [
    { name: "Meta", description: "Service health and discovery." },
    { name: "User", description: "The authenticated user's profile." },
    {
      name: "Emails",
      description:
        "Email addresses on the authenticated user's account. One primary address, any number of verified alternates, and any verified address works at sign-in. Read-only here: managing addresses (adding, removing, switching primary, verification) is an account-security surface and happens in the app.",
    },
    {
      name: "Organizations",
      description:
        "Organizations the authenticated user belongs to. The organization is the unit of ownership on the platform: projects, teams, and billing all attach to it.",
    },
    {
      name: "Projects",
      description:
        "Projects in an organization: the unit of work products attach to. A project's slug identifies it in URLs, SDK configuration, and the API, and is unique within its organization.",
    },
    {
      name: "Flags",
      description: "Organization-wide feature flags.",
    },
    {
      name: "Tokens",
      description:
        "Personal and organization access tokens, plus publishable client tokens for evaluation. Every operation here is session-only: tokens cannot manage tokens.",
    },
    {
      name: "Segments",
      description: "Reusable organization-wide targeting audiences.",
    },
    {
      name: "OFREP",
      description: "OpenFeature Remote Evaluation Protocol 0.3 endpoints.",
    },
    {
      name: "Members",
      description:
        "The organization's roster and invitations. Invite an existing account by username (the invitation goes to its primary email) or anyone by email; accepting the emailed invitation is a browser flow.",
    },
    {
      name: "Usage",
      description:
        "What an organization has used this period, priced per meter. Pro's subscription comes back as included usage credit; only what exceeds it is billed on top, and the invoice carries the same lines.\n\nOrganizations on contract pricing are reported in volume rather than money: the fee is negotiated up front from usage estimates, so a period's metered value is not what they owe. See `usage_display` on the usage response.",
    },
    {
      name: "Teams",
      description:
        "Named groups of organization members. Resources (projects, feature flags) become shareable with teams so access is granted to groups instead of one member at a time. Owners and admins manage teams.",
    },
  ],
  paths: {
    "/healthz": {
      get: {
        operationId: "getHealth",
        tags: ["Meta"],
        summary: "Health check",
        description: "Liveness probe used by uptime monitoring.",
        responses: {
          "200": {
            description: "Service is healthy.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1": {
      get: {
        operationId: "getIndex",
        tags: ["Meta"],
        summary: "API index",
        description: "Lists the available v1 resources and discovery links.",
        responses: {
          "200": {
            description: "Index of the v1 API.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    version: { type: "string", example: "v1" },
                    status: { type: "string", example: "ok" },
                    resources: {
                      type: "array",
                      items: { type: "string" },
                      example: ["/v1/user", "/v1/user/emails"],
                    },
                    openapi: { type: "string", example: "/v1/openapi.json" },
                    docs: {
                      type: "string",
                      example: `${brand.url}/docs/api`,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/user": {
      get: {
        operationId: "getUser",
        tags: ["User"],
        summary: "Get the authenticated user",
        description: "Returns the profile of the signed-in user.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": {
            description: "The authenticated user.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
        },
      },
      patch: {
        operationId: "updateUser",
        tags: ["User"],
        summary: "Update the authenticated user",
        description:
          "Updates profile fields. Username changes follow the same rules as sign-up: alphanumeric with single hyphens, no leading/trailing hyphen, 2-39 characters, unique.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Chase Pierce" },
                  username: { type: "string", example: "syntaqx" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated user.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          "400": errorResponse(
            "Nothing to update, or a value failed validation.",
            "nothing_to_update",
            "Provide at least one of: name, username.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Missing or untrusted Origin header.",
            "invalid_origin",
            "Missing or untrusted Origin header.",
          ),
        },
      },
    },
    "/v1/user/tokens": {
      get: {
        operationId: "listPersonalTokens",
        tags: ["Tokens"],
        summary: "List personal access tokens",
        description:
          "Your own personal access tokens. Secrets are never returned; only metadata.\n\nSESSION ONLY. An access token cannot list, create, rotate, or revoke access tokens: a credential able to mint credentials makes any leak permanent, because the holder issues a replacement before the one you noticed is revoked.",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Your personal access tokens.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/AccessToken" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Attempted with an access token.",
            "session_required",
            "Access tokens cannot manage access tokens. Sign in to do this.",
          ),
        },
      },
      post: {
        operationId: "createPersonalToken",
        tags: ["Tokens"],
        summary: "Create a personal access token",
        description:
          "Creates a token that acts as you. It carries your organization roles, so it can never do more than you can by hand, and it stops working when your membership does. For a shared production service prefer an organization token, which outlives whoever created it.\n\nThe secret is returned ONCE, in this response, and is not recoverable afterwards.",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "scopes"],
                properties: {
                  name: {
                    type: "string",
                    maxLength: 100,
                    example: "Local CLI",
                  },
                  scopes: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "At least one scope. A `:write` scope implies its `:read` counterpart.",
                    example: ["flags:read", "projects:read"],
                  },
                  expires_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                    description:
                      "Optional expiry. Omit for a token that never expires.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "The token, including its secret. Shown only here.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AccessTokenSecret" },
              },
            },
          },
          "400": errorResponse(
            "Invalid name or scopes.",
            "invalid_token",
            "Choose at least one valid scope.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Attempted with an access token.",
            "session_required",
            "Access tokens cannot manage access tokens. Sign in to do this.",
          ),
        },
      },
    },
    "/v1/user/tokens/{token_id}": {
      patch: {
        operationId: "rotatePersonalToken",
        tags: ["Tokens"],
        summary: "Rotate a personal access token",
        description:
          "Replaces the secret, keeping the token's id, name, and scopes. The new secret is returned once. Use this when a token may have leaked: anything referencing it by name keeps working after you update the value.",
        security: [{ sessionCookie: [] }],
        parameters: [
          {
            name: "token_id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "The rotated token, including its new secret.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AccessTokenSecret" },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse("Not found.", "not_found", "Token not found."),
        },
      },
      delete: {
        operationId: "revokePersonalToken",
        tags: ["Tokens"],
        summary: "Revoke a personal access token",
        description: "Immediately and permanently invalidates the token.",
        security: [{ sessionCookie: [] }],
        parameters: [
          {
            name: "token_id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "204": { description: "Revoked." },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse("Not found.", "not_found", "Token not found."),
        },
      },
    },
    "/v1/user/emails": {
      get: {
        operationId: "listEmails",
        tags: ["Emails"],
        summary: "List email addresses",
        description: "Every address on the account, primary first.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": {
            description: "The account's email addresses.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Email" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
        },
      },
    },
    "/v1/orgs": {
      get: {
        operationId: "listOrgs",
        tags: ["Organizations"],
        summary: "List organizations",
        description: "Every organization the authenticated user belongs to.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        responses: {
          "200": {
            description: "The user's organizations.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Organization" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
        },
      },
      post: {
        operationId: "createOrg",
        tags: ["Organizations"],
        summary: "Create an organization",
        description:
          "Creates an organization; the caller becomes its owner. Slugs are lowercase alphanumeric with single hyphens (2-39 characters), unique, and route-reserved words are rejected. When billing is enabled, accounts are limited to one Hobby (free) organization; additional organizations start on Pro.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug"],
                properties: {
                  name: { type: "string", example: "Acme Corp" },
                  slug: { type: "string", example: "acme-corp" },
                  plan: {
                    type: "string",
                    enum: ["free", "pro"],
                    default: "free",
                    description:
                      "Ignored when billing is disabled on the deployment.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "The created organization.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Organization" },
              },
            },
          },
          "400": errorResponse(
            "Missing fields or an invalid slug.",
            "invalid_organization_slug",
            "Slug may only contain lowercase alphanumeric characters or single hyphens, and cannot begin or end with a hyphen.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Missing or untrusted Origin header.",
            "invalid_origin",
            "Missing or untrusted Origin header.",
          ),
          "409": errorResponse(
            "Slug already in use.",
            "organization_already_exists",
            "Organization already exists.",
          ),
          "422": errorResponse(
            "Plan not allowed (e.g. a second Hobby organization).",
            "free_org_limit_reached",
            "You already have a Hobby organization. Create this one on Pro, or upgrade your existing organization.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}": {
      get: {
        operationId: "getOrg",
        tags: ["Organizations"],
        summary: "Get an organization",
        description:
          "A single organization the authenticated user belongs to. Unknown slugs and organizations the user is not a member of both return 404.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        responses: {
          "200": {
            description: "The organization.",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Organization" },
                    {
                      type: "object",
                      properties: {
                        members_count: { type: "integer", example: 1 },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
      patch: {
        operationId: "updateOrg",
        tags: ["Organizations"],
        summary: "Update an organization",
        description:
          "Renames the organization (owners and admins) or changes its slug (owner only). Changing the slug moves every URL and API path for the organization; the old ones stop working.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Acme Corp" },
                  slug: { type: "string", example: "acme" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated organization.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Organization" },
              },
            },
          },
          "400": errorResponse(
            "Nothing to update, or a value failed validation.",
            "nothing_to_update",
            "Provide at least one of: name, slug.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not permitted (or missing/untrusted Origin header).",
            "forbidden",
            "Organization admin access required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
          "409": errorResponse(
            "Slug already in use.",
            "organization_already_exists",
            "Organization already exists.",
          ),
        },
      },
      delete: {
        operationId: "deleteOrg",
        tags: ["Organizations"],
        summary: "Delete an organization",
        description:
          "Permanently deletes the organization along with its projects, teams, and access grants. Only the owner can do this.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        responses: {
          "204": { description: "Organization deleted." },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not the owner (or missing/untrusted Origin header).",
            "forbidden",
            "Only the organization's owner can delete it.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/members": {
      get: {
        operationId: "listMembers",
        tags: ["Members"],
        summary: "List members",
        description: "The organization's member roster, oldest first.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        responses: {
          "200": {
            description: "The organization's members.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Member" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/members/{username}": {
      get: {
        operationId: "getMember",
        tags: ["Members"],
        summary: "Get a member",
        description:
          "A single member of the organization, including the teams they belong to.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "username",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The member's username.",
          },
        ],
        responses: {
          "200": {
            description: "The member, with their teams.",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Member" },
                    {
                      type: "object",
                      properties: {
                        teams: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              name: { type: "string", example: "Platform" },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (organization or member).",
            "not_found",
            "Member not found.",
          ),
        },
      },
      patch: {
        operationId: "updateMemberRole",
        tags: ["Members"],
        summary: "Change a member's role",
        description:
          "Updates the member's organization role. Owners and admins manage roles; owners are protected from non-owners, and the last owner keeps the role.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "username",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The member's username.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["role"],
                properties: {
                  role: {
                    type: "string",
                    enum: ["member", "admin"],
                    example: "admin",
                    description:
                      "Ownership is not assignable here: see PUT /v1/orgs/{slug}/owner.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated member.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Member" },
              },
            },
          },
          "400": errorResponse(
            "Invalid role (ownership is transferred, not assigned).",
            "invalid_role",
            "Role must be one of: member, admin. Ownership moves with PUT /v1/orgs/{slug}/owner.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not permitted (or missing/untrusted Origin header).",
            "you_are_not_allowed_to_update_this_member",
            "You are not allowed to update this member.",
          ),
          "404": errorResponse(
            "Not found (organization or member).",
            "not_found",
            "Member not found.",
          ),
        },
      },
      delete: {
        operationId: "removeMember",
        tags: ["Members"],
        summary: "Remove a member",
        description:
          "Removes a member from the organization. Owners and admins remove members; owners are protected from non-owners, and the last owner can never be removed.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "username",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The member's username.",
          },
        ],
        responses: {
          "204": { description: "Member removed." },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not permitted (or missing/untrusted Origin header).",
            "you_are_not_allowed_to_delete_this_member",
            "You are not allowed to delete this member.",
          ),
          "404": errorResponse(
            "Not found (organization or member).",
            "not_found",
            "Member not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/invitations": {
      get: {
        operationId: "listInvitations",
        tags: ["Members"],
        summary: "List pending invitations",
        description: "Invitations that are pending and not yet expired.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        responses: {
          "200": {
            description: "Pending invitations.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Invitation" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
      post: {
        operationId: "createInvitation",
        tags: ["Members"],
        summary: "Invite someone",
        description:
          "Invites a person to the organization: an existing account by username (the invitation is sent to its primary email) or anyone by email. Re-inviting a pending address resends the email. Owners and admins invite; only owners grant the owner role. Accepting the emailed invitation is a browser flow, not part of this API.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  user: {
                    type: "string",
                    example: "robin",
                    description:
                      "Username of an existing account. Provide exactly one of user, email.",
                  },
                  email: {
                    type: "string",
                    format: "email",
                    example: "robin@flagon.io",
                    description:
                      "Email address to invite. Provide exactly one of user, email.",
                  },
                  role: {
                    type: "string",
                    enum: ["member", "admin"],
                    default: "member",
                    description:
                      "Ownership is transferred, never invited: see PUT /v1/orgs/{slug}/owner.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "The created invitation.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Invitation" },
              },
            },
          },
          "400": errorResponse(
            "Invalid role or subject.",
            "invalid_subject",
            "Provide exactly one of: user, email.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not permitted (or missing/untrusted Origin header).",
            "you_are_not_allowed_to_invite_users_to_this_organization",
            "You are not allowed to invite users to this organization.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
          "422": errorResponse(
            "Unknown username.",
            "unknown_user",
            "No account with that username. Invite by email instead.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/invitations/{invitation_id}": {
      delete: {
        operationId: "cancelInvitation",
        tags: ["Members"],
        summary: "Cancel an invitation",
        description: "Cancels a pending invitation.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "invitation_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Invitation id (UUIDv7).",
          },
        ],
        responses: {
          "204": { description: "Invitation canceled." },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not permitted (or missing/untrusted Origin header).",
            "forbidden",
            "You are not allowed to cancel this invitation.",
          ),
          "404": errorResponse(
            "Not found (organization or invitation).",
            "not_found",
            "Invitation not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/owner": {
      get: {
        operationId: "getOwner",
        tags: ["Members"],
        summary: "Get the owner",
        description:
          "An organization has exactly one owner: the person ultimately responsible for it (billing, deletion, handing it over).",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        responses: {
          "200": {
            description: "The organization's owner.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Owner" },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
      put: {
        operationId: "transferOwnership",
        tags: ["Members"],
        summary: "Transfer ownership",
        description:
          "Hands the organization to another member: they become the owner and you become an admin. Only the current owner can do this, and the new owner must already be a member.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["user"],
                properties: {
                  user: {
                    type: "string",
                    example: "robin",
                    description: "Username of the member taking ownership.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The new owner.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Owner" },
              },
            },
          },
          "400": errorResponse(
            "Missing the new owner's username.",
            "invalid_subject",
            "Provide the new owner's username.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not the owner (or missing/untrusted Origin header).",
            "not_owner",
            "Only the organization's owner can transfer ownership.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
          "422": errorResponse(
            "The new owner is not a member of this organization.",
            "not_a_member",
            "That person is not a member of this organization.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/usage": {
      get: {
        operationId: "getUsage",
        tags: ["Usage"],
        summary: "Get usage",
        description:
          "Usage for a billing period, priced by meter, with the plan's included credit applied. Amounts are in cents.\n\nDefaults to the organization's current billing period, which follows its own subscription cycle rather than the calendar. Pass `period` (a `period_start` from `/usage/periods`) to look back. A period that has already been billed is served from its frozen snapshot, so historical responses report the rates that were actually charged.\n\nOrganizations on contract pricing get `usage_display: \"contracted\"`: every `*_cents` field is null and the `contract` object reports consumption against the negotiated envelope, measured across the whole agreement term rather than per period. Quantities are populated in every mode, so a client that charts volume needs no special case.\n\nFilters and grouping are the same ones the console uses; its URL is this query string.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "period",
            in: "query",
            required: false,
            schema: { type: "string", format: "date" },
            description:
              "Period start (YYYY-MM-DD), from /usage/periods. Defaults to the current period.",
          },
          {
            name: "product",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Restrict to a product. Repeatable, or comma-separated.",
          },
          {
            name: "project",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Restrict to a project id. Repeatable, or comma-separated. Use `__org__` for usage not attributed to a project.",
          },
          {
            name: "meter",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Restrict to a meter id. Repeatable, or comma-separated.",
          },
          {
            name: "group_by",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["product", "project", "meter"],
              default: "product",
            },
            description: "How `groups` and the series are broken down.",
          },
          {
            name: "granularity",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["daily", "weekly", "monthly"],
              default: "daily",
            },
            description:
              "Series bucket size. Buckets are anchored to the period start, not the calendar.",
          },
          {
            name: "cumulative",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["1"] },
            description:
              "Return running totals per bucket instead of per-bucket cost.",
          },
        ],
        responses: {
          "200": {
            description: "The period's usage.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Usage" },
              },
            },
          },
          "400": errorResponse(
            "No billing period starts on that date.",
            "invalid_period",
            "No billing period starts on that date.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/usage/evaluations": {
      get: {
        operationId: "getEvaluationCounter",
        tags: ["Usage"],
        summary: "Get usage counters",
        description:
          "Live consumption counters for the period the organization is currently accruing into: flag evaluations and configuration syncs.\n\nThese are the counters ENFORCEMENT reads, so they carry no compaction lag and are the numbers a 429 from the OFREP evaluation endpoints is derived from. GET /v1/orgs/{slug}/usage answers a different question (what the period will cost) from the compacted rollups, and can trail these by a compaction cycle.\n\nHobby is hard-capped on both meters. Pro and Enterprise are usage-based and are never cut off, so they report `limit` and `remaining` as null rather than as a very large number; their allowance appears as `included` instead, which is billed past rather than refused.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        responses: {
          "200": {
            description: "The current month's evaluation counter.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UsageCounters" },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/usage/periods": {
      get: {
        operationId: "listUsagePeriods",
        tags: ["Usage"],
        summary: "List billing periods",
        description:
          "The billing periods this organization can be asked about, newest first. Each `period_start` is the `period` value for GET /v1/orgs/{slug}/usage. The open period is included and its totals are null, because an open period's numbers are still moving.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        responses: {
          "200": {
            description: "Billing periods, newest first.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BillingPeriod" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/projects": {
      get: {
        operationId: "listProjects",
        tags: ["Projects"],
        summary: "List projects",
        description:
          "Projects in the organization, newest first. Unknown slugs and organizations the user is not a member of both return 404.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        responses: {
          "200": {
            description: "The organization's projects.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Project" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
      post: {
        operationId: "createProject",
        tags: ["Projects"],
        summary: "Create a project",
        description:
          "Creates a project in the organization. Slugs are lowercase alphanumeric with single hyphens (2-39 characters) and unique within the organization.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug"],
                properties: {
                  name: { type: "string", example: "Storefront" },
                  slug: { type: "string", example: "storefront" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "The created project.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Project" },
              },
            },
          },
          "400": errorResponse(
            "Missing fields or an invalid slug.",
            "invalid_slug",
            "Slug may only contain lowercase alphanumeric characters or single hyphens, and cannot begin or end with a hyphen.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Missing or untrusted Origin header.",
            "invalid_origin",
            "Missing or untrusted Origin header.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
          "409": errorResponse(
            "Slug already in use in this organization.",
            "slug_taken",
            "That slug is already used by another project in this organization.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/projects/{project}": {
      get: {
        operationId: "getProject",
        tags: ["Projects"],
        summary: "Get a project",
        description:
          "A single project, including your effective role on it (organization owners and admins are admin everywhere; every member has at least read; grants to you or your teams elevate).",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "project",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Project slug.",
          },
        ],
        responses: {
          "200": {
            description: "The project, with your effective role.",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Project" },
                    {
                      type: "object",
                      properties: {
                        role: {
                          type: "string",
                          enum: ["read", "write", "admin"],
                          example: "admin",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or no access).",
            "not_found",
            "Project not found.",
          ),
        },
      },
      patch: {
        operationId: "updateProject",
        tags: ["Projects"],
        summary: "Update a project",
        description:
          "Updates the display name and slug (admin), or the description, website, topics, and Markdown overview (write). Omitted fields are left unchanged. Changing `slug` MOVES the project: the old path stops resolving immediately and no redirect is left behind, so update any integration that names it. Responds 409 when the new slug is taken.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "project",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Project slug.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Storefront" },
                  slug: {
                    type: "string",
                    example: "storefront-web",
                    description:
                      "Admin only. Moves the project; the old path 404s afterwards.",
                  },
                  description: {
                    type: "string",
                    maxLength: 350,
                    example: "Checkout and cart for the storefront.",
                    description: "One line. Empty string clears it.",
                  },
                  website: {
                    type: "string",
                    maxLength: 255,
                    example: "https://flagon.io",
                    description:
                      "http(s) only; a bare host is upgraded to https. Empty string clears it.",
                  },
                  topics: {
                    type: "array",
                    maxItems: 20,
                    items: {
                      type: "string",
                      maxLength: 35,
                      pattern: "^[a-z0-9][a-z0-9-]*$",
                    },
                    example: ["platform", "checkout"],
                    description:
                      "Replaces the whole list. Lowercased and de-duplicated.",
                  },
                  overview_markdown: {
                    type: "string",
                    maxLength: 100000,
                    example: "# Storefront",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated project, with your effective role.",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Project" },
                    {
                      type: "object",
                      properties: {
                        role: {
                          type: "string",
                          enum: ["read", "write", "admin"],
                          example: "admin",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": errorResponse(
            "Invalid name.",
            "invalid_name",
            "Provide a name.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not a project admin (or missing/untrusted Origin header).",
            "forbidden",
            "Project admin access required.",
          ),
          "404": errorResponse(
            "Not found (or no access).",
            "not_found",
            "Project not found.",
          ),
          "409": errorResponse(
            "The requested slug is taken.",
            "slug_taken",
            "That slug is already used by another project in this organization.",
          ),
        },
      },
      delete: {
        operationId: "deleteProject",
        tags: ["Projects"],
        summary: "Delete a project",
        description:
          "Permanently deletes the project and every access grant on it. Requires project admin.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "project",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Project slug.",
          },
        ],
        responses: {
          "204": { description: "Project deleted." },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not a project admin (or missing/untrusted Origin header).",
            "forbidden",
            "Project admin access required.",
          ),
          "404": errorResponse(
            "Not found (or no access).",
            "not_found",
            "Project not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/projects/{project}/owners": {
      get: {
        operationId: "listProjectOwners",
        tags: ["Projects"],
        summary: "List owners",
        description:
          "Catalog ownership metadata, separate from access grants. An owner is a team or a person; `type` says which.",
        responses: {
          "200": {
            description:
              "Teams and people documented as responsible for the project.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ProjectOwner" },
                },
              },
            },
          },
          "404": errorResponse("Not found.", "not_found", "Project not found."),
        },
      },
      put: {
        operationId: "replaceProjectOwners",
        tags: ["Projects"],
        summary: "Replace owners",
        description:
          "Assigns informational ownership without granting access. Requires project admin.\n\nAn owner is a team or a person. Send `team_ids`, `user_ids`, or both; whichever list you send REPLACES that kind of owner entirely, and an omitted list clears it. Teams must belong to the organization and people must be members of it.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "At least one of team_ids or user_ids.",
                properties: {
                  team_ids: {
                    type: "array",
                    items: { type: "string" },
                    description: "Team ids. Omit to clear team owners.",
                  },
                  user_ids: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "User ids of organization members. Omit to clear person owners.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated owners.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ProjectOwner" },
                },
              },
            },
          },
          "400": errorResponse(
            "Invalid owners.",
            "invalid_team",
            "Every owning team must belong to this organization.",
          ),
          "403": errorResponse(
            "Forbidden.",
            "forbidden",
            "Project admin access required to assign ownership.",
          ),
          "404": errorResponse("Not found.", "not_found", "Project not found."),
        },
      },
    },
    "/v1/orgs/{slug}/projects/{project}/access": {
      get: {
        operationId: "listProjectAccess",
        tags: ["Projects"],
        summary: "List access grants",
        description:
          "Explicit access grants on the project. Baseline access (member read, owner/admin control) is implicit and not listed.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "project",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Project slug.",
          },
        ],
        responses: {
          "200": {
            description: "The project's access grants.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ProjectGrant" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or no access).",
            "not_found",
            "Project not found.",
          ),
        },
      },
      post: {
        operationId: "grantProjectAccess",
        tags: ["Projects"],
        summary: "Grant access",
        description:
          "Creates or updates a grant for a member (by username) or a team (by id). Idempotent per subject: granting again changes the role. Requires project admin.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "project",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Project slug.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["role"],
                properties: {
                  user: {
                    type: "string",
                    example: "syntaqx",
                    description:
                      "Username of an organization member. Provide exactly one of user, team_id.",
                  },
                  team_id: {
                    type: "string",
                    example: "019f7cd5-3e02-7c88-9f4b-2b91acd07f13",
                    description:
                      "Id of a team in the organization. Provide exactly one of user, team_id.",
                  },
                  role: {
                    type: "string",
                    enum: ["read", "write", "admin"],
                    example: "write",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "The created or updated grant.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProjectGrant" },
              },
            },
          },
          "400": errorResponse(
            "Invalid role or subject.",
            "invalid_subject",
            "Provide exactly one of: user, team_id.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not a project admin (or missing/untrusted Origin header).",
            "forbidden",
            "Project admin access required.",
          ),
          "404": errorResponse(
            "Not found (or no access).",
            "not_found",
            "Project not found.",
          ),
          "422": errorResponse(
            "Subject not usable (unknown team, or user not a member).",
            "not_a_member",
            "That user is not a member of this organization.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/projects/{project}/access/{grant_id}": {
      delete: {
        operationId: "revokeProjectAccess",
        tags: ["Projects"],
        summary: "Revoke access",
        description: "Removes a grant. Requires project admin.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "project",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Project slug.",
          },
          {
            name: "grant_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Grant id (UUIDv7).",
          },
        ],
        responses: {
          "204": { description: "Grant revoked." },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not a project admin (or missing/untrusted Origin header).",
            "forbidden",
            "Project admin access required.",
          ),
          "404": errorResponse(
            "Not found (project, access, or grant).",
            "not_found",
            "Grant not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/teams": {
      get: {
        operationId: "listTeams",
        tags: ["Teams"],
        summary: "List teams",
        description:
          "Teams in the organization. Unknown slugs and organizations the user is not a member of both return 404.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        responses: {
          "200": {
            description: "The organization's teams.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Team" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
        },
      },
      post: {
        operationId: "createTeam",
        tags: ["Teams"],
        summary: "Create a team",
        description:
          "Creates a team in the organization. Team names are 2-50 characters and unique within the organization (case-insensitive). Requires the owner or admin role.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "Platform" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "The created team.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Team" },
              },
            },
          },
          "400": errorResponse(
            "Missing or invalid team name.",
            "invalid_team_name",
            "Team name must be between 2 and 50 characters.",
          ),
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not permitted (or missing/untrusted Origin header).",
            "you_are_not_allowed_to_create_a_new_team",
            "You are not allowed to create a new team.",
          ),
          "404": errorResponse(
            "Not found (or not a member).",
            "not_found",
            "Organization not found.",
          ),
          "409": errorResponse(
            "Team name already in use in this organization.",
            "team_already_exists",
            "A team with that name already exists in this organization.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/teams/{team_id}": {
      get: {
        operationId: "getTeam",
        tags: ["Teams"],
        summary: "Get a team",
        description: "A single team in the organization.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "team_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Team id (UUIDv7).",
          },
        ],
        responses: {
          "200": {
            description: "The team.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Team" },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (organization or team).",
            "not_found",
            "Team not found.",
          ),
        },
      },
      delete: {
        operationId: "deleteTeam",
        tags: ["Teams"],
        summary: "Delete a team",
        description:
          "Deletes the team and its roster, along with any project access the team granted. Members keep their organization membership. Requires the owner or admin role.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "team_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Team id (UUIDv7).",
          },
        ],
        responses: {
          "204": { description: "Team deleted." },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not permitted (or missing/untrusted Origin header).",
            "you_are_not_allowed_to_delete_this_team",
            "You are not allowed to delete this team.",
          ),
          "404": errorResponse(
            "Not found (organization or team).",
            "not_found",
            "Team not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/teams/{team_id}/members": {
      get: {
        operationId: "listTeamMembers",
        tags: ["Teams"],
        summary: "List team members",
        description: "Who's on the team.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "team_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Team id (UUIDv7).",
          },
        ],
        responses: {
          "200": {
            description: "The team's members.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/TeamMember" },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (organization or team).",
            "not_found",
            "Team not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/teams/{team_id}/projects": {
      get: {
        operationId: "listTeamProjects",
        tags: ["Teams"],
        summary: "List a team's projects",
        description:
          "Every project this team is attached to, by access grant or by catalog ownership. `role` is the granted role, or null when the team is named as an owner without holding a grant; `owner` says whether the team is recorded as responsible for the project. Ownership grants nothing on its own. Grants are managed on the project (POST /v1/orgs/{slug}/projects/{project}/access), owners via PUT /v1/orgs/{slug}/projects/{project}/owners.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "team_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Team id (UUIDv7).",
          },
        ],
        responses: {
          "200": {
            description: "The team's projects.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["slug", "name", "role", "owner", "granted_at"],
                    properties: {
                      slug: { type: "string", example: "storefront" },
                      name: { type: "string", example: "Storefront" },
                      role: {
                        type: "string",
                        nullable: true,
                        enum: ["read", "write", "admin", null],
                        example: "write",
                        description:
                          "Null when the team owns the project but holds no access grant.",
                      },
                      owner: {
                        type: "boolean",
                        example: true,
                        description:
                          "The team is named as responsible for this project in the catalog.",
                      },
                      granted_at: {
                        type: "string",
                        format: "date-time",
                        nullable: true,
                        description: "Null when there is no access grant.",
                      },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "404": errorResponse(
            "Not found (organization or team).",
            "not_found",
            "Team not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/teams/{team_id}/members/{username}": {
      put: {
        operationId: "addTeamMember",
        tags: ["Teams"],
        summary: "Add a team member",
        description:
          "Puts an organization member on the team. Idempotent: adding someone already on the team succeeds. Requires the owner or admin role.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "team_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Team id (UUIDv7).",
          },
          {
            name: "username",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The member's username.",
          },
        ],
        responses: {
          "204": { description: "On the team." },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not permitted (or missing/untrusted Origin header).",
            "forbidden",
            "You are not allowed to manage this team.",
          ),
          "404": errorResponse(
            "Not found (organization or team).",
            "not_found",
            "Team not found.",
          ),
          "422": errorResponse(
            "User is not an organization member.",
            "not_a_member",
            "That user is not a member of this organization.",
          ),
        },
      },
      delete: {
        operationId: "removeTeamMember",
        tags: ["Teams"],
        summary: "Remove a team member",
        description:
          "Takes an organization member off the team. Requires the owner or admin role.",
        security: [{ bearerToken: [] }, { sessionCookie: [] }],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Organization slug.",
          },
          {
            name: "team_id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Team id (UUIDv7).",
          },
          {
            name: "username",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The member's username.",
          },
        ],
        responses: {
          "204": { description: "Off the team." },
          "401": errorResponse(
            "Not signed in.",
            "unauthorized",
            "Sign in required.",
          ),
          "403": errorResponse(
            "Not permitted (or missing/untrusted Origin header).",
            "forbidden",
            "You are not allowed to manage this team.",
          ),
          "404": errorResponse(
            "Not found (organization, team, or member).",
            "not_found",
            "Member not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/flags": {
      get: {
        operationId: "listFlags",
        tags: ["Flags"],
        summary: "List feature flags",
        description:
          "Each flag carries its usage alongside its definition: `checks_per_hour` and `last_checked_at` are BILLED evaluations (reconcile with the invoice); `exposures_30d` / `last_exposed_at` are app reads from the client hook (the staleness signal); `stale` (a cleanup-candidate heuristic) with `stale_reasons`; `pass_rate` (boolean flags, else null). See GET /flags/{key}/usage for the full series.",
        responses: {
          "200": { description: "Organization flags, each with usage fields." },
          "401": errorResponse(
            "Unauthorized.",
            "unauthorized",
            "Sign in required.",
          ),
        },
      },
      post: {
        operationId: "createFlag",
        tags: ["Flags"],
        summary: "Create a feature flag",
        description:
          "Creates an organization-wide flag. Only `key` is required: a flag with no `name` is named after its key, which is what the console does. Omitting `variants` gives the type's defaults (on/off for boolean).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["key"],
                properties: {
                  key: {
                    type: "string",
                    example: "new-checkout",
                    description:
                      "The string your SDK asks for. Immutable once created.",
                  },
                  name: {
                    type: "string",
                    example: "New checkout",
                    description: "Human-facing; defaults to the key.",
                  },
                  description: { type: "string", nullable: true },
                  type: {
                    type: "string",
                    enum: ["boolean", "string", "integer", "float", "object"],
                    default: "boolean",
                  },
                  variants: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Variant" },
                  },
                  default_variant: {
                    type: "string",
                    example: "on",
                    description:
                      "Variant key served when no rule matches; defaults to the first variant.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Flag created." },
          "400": errorResponse(
            "Invalid flag.",
            "invalid_flag",
            "Provide a key.",
          ),
          "409": errorResponse(
            "That key already exists in this organization.",
            "key_taken",
            "That flag key is already in use.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/flags/{key}": {
      get: {
        operationId: "getFlag",
        tags: ["Flags"],
        summary: "Get a feature flag",
        responses: {
          "200": { description: "The flag." },
          "404": errorResponse("Not found.", "not_found", "Flag not found."),
        },
      },
      patch: {
        operationId: "updateFlag",
        tags: ["Flags"],
        summary: "Update a feature flag",
        description:
          "Updates the flag in place. Omitted fields are left unchanged; `variants` and `rules` REPLACE the stored list rather than merging into it. The key is immutable - rules, rollouts, and evaluation history all reference it.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "New checkout" },
                  description: { type: "string", nullable: true },
                  variants: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Variant" },
                  },
                  default_variant: { type: "string", example: "on" },
                  rules: {
                    type: "array",
                    description:
                      "Ordered targeting rules; the first match wins.",
                    items: { type: "object" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated flag." },
          "404": errorResponse("Not found.", "not_found", "Flag not found."),
        },
      },
      delete: {
        operationId: "deleteFlag",
        tags: ["Flags"],
        summary: "Delete a feature flag",
        responses: {
          "204": { description: "Flag deleted." },
          "404": errorResponse("Not found.", "not_found", "Flag not found."),
        },
      },
    },
    "/v1/orgs/{slug}/flags/{key}/usage": {
      get: {
        operationId: "getFlagUsage",
        tags: ["Flags"],
        summary: "Get flag usage",
        description:
          "Per-flag usage analytics: the hourly check series, variant and targeting-reason breakdowns, the checks/hr rate, pass rate (boolean flags), and the staleness assessment.\n\nUsage comes from client-reported exposures (an OpenFeature hook posting to /ofrep/v1/exposures) plus server-side single-flag evaluations. A flag with no exposures returns zeros and a null `last_checked_at` rather than an error - not every flag has traffic, and the bulk evaluation endpoint cannot attribute checks per flag.",
        responses: {
          "200": {
            description: "The flag's usage.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FlagUsage" },
              },
            },
          },
          "404": errorResponse(
            "Not found.",
            "flag_not_found",
            "Flag not found.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/tokens": {
      get: {
        operationId: "listOrganizationTokens",
        tags: ["Tokens"],
        summary: "List organization tokens",
        security: [{ sessionCookie: [] }],
        description:
          "SESSION ONLY. Access tokens cannot manage credentials: a token able to mint tokens would make any leak permanent, because the holder issues a replacement before the one you noticed is revoked.",
        responses: {
          "200": { description: "Tokens without secret material." },
        },
      },
      post: {
        operationId: "createOrganizationToken",
        tags: ["Tokens"],
        summary: "Create an organization token",
        security: [{ sessionCookie: [] }],
        description:
          "SESSION ONLY. Access tokens cannot manage credentials: a token able to mint tokens would make any leak permanent, because the holder issues a replacement before the one you noticed is revoked.",
        responses: {
          "201": { description: "Token and one-time secret." },
          "400": errorResponse(
            "Invalid token.",
            "invalid_token",
            "Provide a name and scopes.",
          ),
        },
      },
    },
    "/v1/orgs/{slug}/tokens/{token_id}": {
      patch: {
        operationId: "rotateOrganizationToken",
        tags: ["Tokens"],
        summary: "Rotate an organization token",
        security: [{ sessionCookie: [] }],
        description:
          "SESSION ONLY. Access tokens cannot manage credentials: a token able to mint tokens would make any leak permanent, because the holder issues a replacement before the one you noticed is revoked.",
        responses: {
          "200": {
            description: "Token metadata and one-time replacement secret.",
          },
          "404": errorResponse("Not found.", "not_found", "Token not found."),
        },
      },
      delete: {
        operationId: "revokeOrganizationToken",
        tags: ["Tokens"],
        summary: "Revoke an organization token",
        security: [{ sessionCookie: [] }],
        description:
          "SESSION ONLY. Access tokens cannot manage credentials: a token able to mint tokens would make any leak permanent, because the holder issues a replacement before the one you noticed is revoked.",
        responses: {
          "204": { description: "Token revoked." },
          "404": errorResponse("Not found.", "not_found", "Token not found."),
        },
      },
    },
    "/v1/orgs/{slug}/client-tokens": {
      get: {
        operationId: "listClientTokens",
        tags: ["Tokens"],
        summary: "List publishable client tokens",
        security: [{ sessionCookie: [] }],
        description:
          "SESSION ONLY. Access tokens cannot manage credentials: a token able to mint tokens would make any leak permanent, because the holder issues a replacement before the one you noticed is revoked.",
        responses: {
          "200": {
            description:
              "Client token metadata and retrievable publishable values. Legacy hash-only entries return null until rotated.",
          },
        },
      },
      post: {
        operationId: "createClientToken",
        tags: ["Tokens"],
        summary: "Create a publishable client token",
        security: [{ sessionCookie: [] }],
        description:
          "SESSION ONLY. Access tokens cannot manage credentials: a token able to mint tokens would make any leak permanent, because the holder issues a replacement before the one you noticed is revoked.",
        responses: {
          "201": { description: "Client token and publishable value." },
        },
      },
    },
    "/v1/orgs/{slug}/client-tokens/{token_id}": {
      patch: {
        operationId: "rotateClientToken",
        tags: ["Tokens"],
        summary: "Rotate a publishable client token",
        security: [{ sessionCookie: [] }],
        description:
          "SESSION ONLY. Access tokens cannot manage credentials: a token able to mint tokens would make any leak permanent, because the holder issues a replacement before the one you noticed is revoked.",
        responses: {
          "200": {
            description: "Rotated client token and its retrievable value.",
          },
          "404": errorResponse(
            "Not found.",
            "not_found",
            "Client token not found.",
          ),
        },
      },
      delete: {
        operationId: "revokeClientToken",
        tags: ["Tokens"],
        summary: "Revoke a publishable client token",
        security: [{ sessionCookie: [] }],
        description:
          "SESSION ONLY. Access tokens cannot manage credentials: a token able to mint tokens would make any leak permanent, because the holder issues a replacement before the one you noticed is revoked.",
        responses: { "204": { description: "Client token revoked." } },
      },
    },
    "/v1/orgs/{slug}/segments": {
      get: {
        operationId: "listSegments",
        tags: ["Segments"],
        summary: "List targeting segments",
        responses: { "200": { description: "Organization segments." } },
      },
      post: {
        operationId: "createSegment",
        tags: ["Segments"],
        summary: "Create a targeting segment",
        responses: { "201": { description: "Segment created." } },
      },
    },
    "/v1/orgs/{slug}/segments/{key}": {
      get: {
        operationId: "getSegment",
        tags: ["Segments"],
        summary: "Get a targeting segment",
        responses: {
          "200": { description: "The segment." },
          "404": errorResponse("Not found.", "not_found", "Segment not found."),
        },
      },
      patch: {
        operationId: "updateSegment",
        tags: ["Segments"],
        summary: "Update a targeting segment",
        responses: {
          "200": { description: "Updated segment." },
          "404": errorResponse("Not found.", "not_found", "Segment not found."),
        },
      },
      delete: {
        operationId: "deleteSegment",
        tags: ["Segments"],
        summary: "Delete a targeting segment",
        responses: { "204": { description: "Segment deleted." } },
      },
    },
    "/ofrep/v1/evaluate/flags": {
      post: {
        operationId: "ofrepBulkEvaluate",
        tags: ["OFREP"],
        summary: "Bulk evaluate all flags",
        description:
          "Static-context client evaluation. Returns all effective values and an ETag suitable for conditional polling. Publishable client tokens are accepted.",
        parameters: [
          {
            name: "If-None-Match",
            in: "header",
            required: false,
            schema: { type: "string" },
            description:
              "ETag from the previous response for this evaluation context.",
          },
          {
            name: "flagConfigEtag",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Configuration metadata from an OFREP change event; reserved for standard event-stream interoperability.",
          },
          {
            name: "flagConfigLastModified",
            in: "query",
            required: false,
            schema: { oneOf: [{ type: "integer" }, { type: "string" }] },
            description:
              "Last-modified metadata from an OFREP change event; reserved for standard event-stream interoperability.",
          },
        ],
        requestBody: ofrepRequestBody,
        responses: {
          "200": {
            description: "All effective flag values.",
            headers: {
              ETag: {
                schema: { type: "string" },
                description:
                  "Validator for this organization configuration and evaluation context.",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OfrepBulkResponse" },
              },
            },
          },
          "304": {
            description: "The evaluated representation has not changed.",
            headers: { ETag: { schema: { type: "string" } } },
          },
          "400": ofrepErrorResponse("Invalid evaluation context."),
          "401": ofrepErrorResponse("Invalid access or client token."),
          "413": ofrepErrorResponse("Evaluation context is too large."),
        },
      },
    },
    "/ofrep/v1/events": {
      get: {
        operationId: "ofrepConfigurationEvents",
        tags: ["OFREP"],
        summary: "Stream flag configuration invalidations",
        description:
          "Authenticated server-sent event stream for browser providers. A configuration_changed event tells the client to repeat its bulk evaluation; no flag definitions or targeting rules are sent through this stream.",
        responses: {
          "200": {
            description:
              "SSE stream. Emits ready, configuration_changed, and heartbeat comments.",
            content: { "text/event-stream": { schema: { type: "string" } } },
          },
          "401": ofrepErrorResponse("Invalid access or client token."),
          "503": ofrepErrorResponse(
            "Realtime notifications are temporarily unavailable.",
          ),
        },
      },
    },
    "/ofrep/v1/evaluate/flags/{key}": {
      post: {
        operationId: "ofrepEvaluateFlag",
        tags: ["OFREP"],
        summary: "Evaluate one flag",
        description:
          "Dynamic-context server evaluation. Requires a secret access token scoped to flags:evaluate.",
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: ofrepRequestBody,
        responses: {
          "200": {
            description: "OFREP flag evaluation.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OfrepEvaluation" },
              },
            },
          },
          "400": ofrepErrorResponse("Invalid evaluation context."),
          "404": ofrepErrorResponse("Flag not found."),
          "401": ofrepErrorResponse("Invalid access token."),
          "413": ofrepErrorResponse("Evaluation context is too large."),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerToken: {
        type: "http",
        scheme: "bearer",
        description:
          "Personal or organization access token. The canonical way to call the API; token issuance opens with the Access tokens settings page.",
      },
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "flagon.session_token",
        description:
          "Browser session cookie set at sign-in. How the app and the interactive docs console authenticate today.",
      },
    },
    schemas: {
      OfrepContext: {
        type: "object",
        required: ["targetingKey"],
        additionalProperties: true,
        properties: {
          targetingKey: {
            type: "string",
            minLength: 1,
            maxLength: 1024,
            example: "user-123",
          },
        },
      },
      OfrepEvaluation: {
        type: "object",
        required: ["key", "value", "reason", "variant"],
        properties: {
          key: { type: "string", example: "dark-theme" },
          value: { nullable: true, example: true },
          reason: {
            type: "string",
            enum: ["STATIC", "TARGETING_MATCH", "SPLIT", "CACHED"],
          },
          variant: { type: "string", example: "on" },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      OfrepError: {
        type: "object",
        required: ["errorCode", "errorDetails"],
        properties: {
          key: { type: "string" },
          errorCode: { type: "string", example: "INVALID_CONTEXT" },
          errorDetails: { type: "string" },
        },
      },
      OfrepBulkResponse: {
        type: "object",
        required: ["flags"],
        properties: {
          flags: {
            type: "array",
            items: {
              oneOf: [
                { $ref: "#/components/schemas/OfrepEvaluation" },
                { $ref: "#/components/schemas/OfrepError" },
              ],
            },
          },
          eventStreams: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          metadata: {
            type: "object",
            additionalProperties: true,
            properties: { version: { type: "string" } },
          },
        },
      },
      Error: {
        ...errorEnvelope,
        description: "Every non-2xx response uses this envelope.",
      },
      User: {
        type: "object",
        description: "The authenticated user's profile.",
        required: [
          "id",
          "username",
          "name",
          "email",
          "email_verified",
          "created_at",
          "updated_at",
        ],
        properties: {
          id: {
            type: "string",
            example: "019f7cce-cd39-77cd-9914-11953345f88e",
            description:
              "UUIDv7 (accounts created before the v7 rollout keep their historical ids).",
          },
          username: {
            type: "string",
            nullable: true,
            example: "syntaqx",
            description: "Display-cased username; null if none is set.",
          },
          name: { type: "string", example: "Chase Pierce" },
          email: {
            type: "string",
            format: "email",
            example: "chase@flagon.io",
            description: "The primary email address.",
          },
          email_verified: { type: "boolean", example: true },
          image: { type: "string", nullable: true, example: null },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Organization: {
        type: "object",
        description: "An organization the user belongs to.",
        required: ["id", "slug", "name", "created_at"],
        properties: {
          id: {
            type: "string",
            example: "019f7cd2-1a40-7b9c-a0d3-5f3ec9c238e1",
            description: "UUIDv7.",
          },
          slug: { type: "string", example: "acme-corp" },
          name: { type: "string", example: "Acme Corp" },
          logo: { type: "string", nullable: true, example: null },
          plan: {
            type: "string",
            enum: ["free", "pro", "enterprise"],
            example: "free",
          },
          created_at: { type: "string", format: "date-time" },
        },
      },
      FlagUsage: {
        type: "object",
        description:
          "Per-flag usage over the last 30 days.\n\nTwo distinct signals: `total_checks` / `checks_per_hour` count BILLED EVALUATIONS (bulk + single-flag), so they reconcile with the invoice's evaluation meter. `exposures_30d` counts what the client hook reported the app actually READ - a different scale, and the basis for staleness. A flag can be billed on every config fetch yet never read: that is exactly the cleanup candidate `stale` flags.",
        required: [
          "flag_key",
          "total_checks",
          "checks_per_hour",
          "stale",
          "series",
        ],
        properties: {
          flag_key: { type: "string", example: "new-checkout" },
          total_checks: {
            type: "integer",
            example: 41200,
            description:
              "Billed evaluations (bulk + single-flag). Sums, across all flags, to the org's billed evaluation quantity.",
          },
          checks_per_hour: { type: "number", example: 57.2 },
          pass_rate: {
            type: "number",
            nullable: true,
            example: 0.84,
            description:
              "Share of evaluations that returned the `on` variant. Boolean flags only; null otherwise (read `variants` for the distribution).",
          },
          last_checked_at: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "Most recent hour with a billed evaluation, or null.",
          },
          exposures_30d: {
            type: "integer",
            example: 0,
            description:
              "Client-hook app reads (what the app actually evaluated), a different scale from billing. Zero until the exposure hook is adopted.",
          },
          last_exposed_at: {
            type: "string",
            format: "date-time",
            nullable: true,
            description:
              "Most recent hour the app READ this flag (hook), or null. This, not last_checked_at, is what staleness uses.",
          },
          stale: {
            type: "boolean",
            description:
              "Whether the flag is a cleanup candidate: billed but not actually read, or old and inert. A suggestion, not a verdict.",
          },
          stale_reasons: {
            type: "array",
            items: { type: "string" },
            example: ["No checks in 30 days", "No targeting rules"],
          },
          variants: {
            type: "array",
            description: "Distribution of served variants.",
            items: {
              type: "object",
              required: ["variant", "count", "share"],
              properties: {
                variant: { type: "string", example: "on" },
                count: { type: "integer", example: 34600 },
                share: { type: "number", example: 0.84 },
              },
            },
          },
          reasons: {
            type: "object",
            description: "How flags were served, by OFREP reason.",
            properties: {
              STATIC: { type: "integer", example: 6600 },
              TARGETING_MATCH: { type: "integer", example: 34600 },
              SPLIT: { type: "integer", example: 0 },
            },
          },
          series: {
            type: "array",
            description: "Hourly check counts over the window.",
            items: {
              type: "object",
              required: ["hour", "count"],
              properties: {
                hour: { type: "string", format: "date-time" },
                count: { type: "integer", example: 240 },
              },
            },
          },
        },
      },
      Variant: {
        type: "object",
        description:
          "One possible value of a flag. `key` is the machine identity: rules and rollouts reference it, and OFREP reports it as `variant`. `label` is human-facing only and never affects evaluation. The console derives the key from the value when a variant is created and then freezes it.",
        required: ["key", "value"],
        properties: {
          key: {
            type: "string",
            example: "on",
            pattern: "^[a-z][a-z0-9._-]{0,127}$",
          },
          value: {
            description: "Typed to match the flag's type.",
            oneOf: [
              { type: "boolean" },
              { type: "string" },
              { type: "number" },
              { type: "object" },
            ],
          },
          label: {
            type: "string",
            maxLength: 60,
            example: "Dark blue",
            description: "Shown instead of the value in the console.",
          },
        },
      },
      Project: {
        type: "object",
        description: "A project in an organization.",
        required: ["id", "slug", "name", "created_at", "updated_at"],
        properties: {
          id: {
            type: "string",
            example: "019f7cd4-88a1-7f10-b2c4-6a1de2b41c77",
            description: "UUIDv7.",
          },
          slug: {
            type: "string",
            example: "storefront",
            description:
              "Identifier in URLs, SDK configuration, and the API; unique within the organization. Changing it via PATCH moves the project and leaves no redirect.",
          },
          name: { type: "string", example: "Storefront" },
          description: {
            type: "string",
            example: "Checkout and cart for the storefront.",
            description: "One-line summary; empty when unset.",
          },
          website: {
            type: "string",
            example: "https://flagon.io",
            description: "Absolute http(s) URL; empty when unset.",
          },
          topics: {
            type: "array",
            items: { type: "string" },
            example: ["platform", "checkout"],
          },
          overview_markdown: { type: "string", example: "# Storefront" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Member: {
        type: "object",
        description: "A member of an organization.",
        required: ["id", "role", "name", "created_at"],
        properties: {
          id: {
            type: "string",
            example: "019f7cd7-2b41-7e55-8d02-91acd07f13a2",
            description: "Membership id (UUIDv7).",
          },
          role: {
            type: "string",
            enum: ["owner", "admin", "member"],
            example: "member",
          },
          username: {
            type: "string",
            nullable: true,
            example: "robin",
          },
          name: { type: "string", example: "Robin Vale" },
          created_at: {
            type: "string",
            format: "date-time",
            description: "When they joined the organization.",
          },
        },
      },
      Usage: {
        type: "object",
        description:
          "A period's usage, priced per meter, with the plan's included credit applied. All amounts in cents.\n\nOn a contracted plan (`usage_display: \"contracted\"`) every `*_cents` field is **null** and the `contract` object carries consumption against the negotiated envelope instead. Contract pricing is agreed up front from usage estimates, so a period's metered value is not what the organization owes and is deliberately not served as though it were. Quantities are always populated, whatever the mode.",
        required: [
          "period_start",
          "period_end",
          "plan",
          "usage_display",
          "meters",
        ],
        properties: {
          period_start: {
            type: "string",
            format: "date",
            example: "2026-07-19",
          },
          period_end: { type: "string", format: "date", example: "2026-08-18" },
          period_label: {
            type: "string",
            example: "Jul 19, 2026 - Aug 18, 2026",
          },
          period_status: {
            type: "string",
            enum: ["open", "closed", "invoiced", "void"],
            description:
              "Open periods are priced live; anything else is served from the snapshot frozen when it was billed.",
          },
          stripe_invoice_id: { type: "string", nullable: true },
          plan: { type: "string", enum: ["free", "pro", "enterprise"] },
          usage_display: {
            type: "string",
            enum: ["priced", "capped", "contracted"],
            description:
              "Which fields carry meaning for this organization.\n\n- `priced` - every `*_cents` field is populated and `contract` is null.\n- `capped` - the same, but the plan is never invoiced; usage is refused at the cap rather than charged.\n- `contracted` - every `*_cents` field is null; read `contract` instead.\n\nProvided so a client never has to infer presentation from the plan id.",
          },
          included_credit_cents: {
            type: "integer",
            nullable: true,
            example: 2000,
            description: "Null on contract pricing.",
          },
          credit_applied_cents: {
            type: "integer",
            nullable: true,
            example: 1700,
            description: "Null on contract pricing.",
          },
          credit_remaining_cents: {
            type: "integer",
            nullable: true,
            example: 300,
            description: "Null on contract pricing.",
          },
          usage_cents: {
            type: "integer",
            nullable: true,
            example: 1700,
            description:
              "On contract pricing this is the metered overage (usage billed OUTSIDE the base contract); the base contract's pooled figures stay null.",
          },
          overage_cents: {
            type: "integer",
            nullable: true,
            example: 0,
            description:
              "Billed on top of the plan's base price. On contract pricing this equals the metered overage.",
          },
          metered_overage_cents: {
            type: "integer",
            nullable: true,
            example: 750,
            description:
              "What's billed automatically OUTSIDE the base contract this period (metered meters). Null when not on contract pricing. Covered meters are coordinated at renewal and never appear here.",
          },
          subscription_cents: {
            type: "integer",
            nullable: true,
            example: 2000,
            description:
              "The plan's base price for the period. Null on contract pricing (the negotiated fee lives in Stripe).",
          },
          contract: {
            type: "object",
            nullable: true,
            description:
              "Consumption against the negotiated agreement. Present only on contract pricing, and null when no agreement is on file.\n\nThe envelope covers the WHOLE TERM and is drawn down cumulatively across it, not reset per period. A contract negotiated from annual estimates makes no promise about any particular month, so a seasonal organization that consumes 40% of its volume in one quarter and almost nothing in the next is exactly on plan. Compare `used_quantity` against `elapsed_percent` to judge that; per-period figures cannot answer it.",
            required: ["term_start", "term_end", "meters"],
            properties: {
              term_start: { type: "string", format: "date" },
              term_end: { type: "string", format: "date" },
              days_total: { type: "integer", example: 365 },
              days_elapsed: { type: "integer", example: 223 },
              elapsed_percent: { type: "number", example: 61.1 },
              meters: {
                type: "array",
                description:
                  "One entry per meter that has either a contracted volume or recorded usage. Usage on a meter the agreement never mentioned is included deliberately: it is exactly what a renewal review needs to see.",
                items: {
                  type: "object",
                  required: ["meter", "used_quantity"],
                  properties: {
                    meter: { type: "string", example: "flags.evaluations" },
                    label: { type: "string", example: "Flag evaluations" },
                    unit: { type: "string", example: "evaluations" },
                    contracted_quantity: {
                      type: "integer",
                      nullable: true,
                      example: 750000000,
                      description:
                        "Volume agreed for the whole term. Null when the agreement is silent about this meter, which is not the same as zero.",
                    },
                    used_quantity: { type: "integer", example: 412000000 },
                    remaining_quantity: {
                      type: "integer",
                      nullable: true,
                      example: 338000000,
                      description:
                        "Floored at zero; consumption is never cut off.",
                    },
                    used_percent: {
                      type: "number",
                      nullable: true,
                      example: 54.9,
                      description:
                        "Uncapped: passing 100 is a true-up to coordinate, not a limit that was hit.",
                    },
                    projected_quantity: {
                      type: "integer",
                      nullable: true,
                      example: 674000000,
                      description:
                        "Term total at the current average rate. Informational only, and null early in a term: linear extrapolation is a poor lens on seasonal traffic and should never lead.",
                    },
                    pace: {
                      type: "string",
                      nullable: true,
                      enum: ["under", "on", "over"],
                      description:
                        "Projected term total against the contracted volume, within a 10% tolerance. Null when too little of the term has elapsed to judge.",
                    },
                  },
                },
              },
            },
          },
          group_by: { type: "string", enum: ["product", "project", "meter"] },
          granularity: { type: "string", enum: ["daily", "weekly", "monthly"] },
          meters: {
            type: "array",
            description:
              "Period totals per meter. Always the whole period, priced with the meter's included allowance applied across it.",
            items: {
              type: "object",
              required: ["meter", "product", "label", "quantity", "unit"],
              properties: {
                meter: { type: "string", example: "flags.evaluations" },
                product: { type: "string", example: "flags" },
                label: { type: "string", example: "Flag evaluations" },
                quantity: { type: "integer", example: 3400000 },
                unit: { type: "string", example: "evaluations" },
                billing_mode: {
                  type: "string",
                  enum: ["priced", "covered", "metered"],
                  description:
                    "How this meter bills. `priced` (Pro/Hobby). On contract pricing: `covered` (in the base contract's term envelope - volume, cost null, coordinated at renewal) or `metered` (billed automatically on top - cost populated).",
                },
                unit_amount_cents: {
                  type: "integer",
                  nullable: true,
                  example: 5,
                  description:
                    "Populated for priced and metered meters; null for covered meters, where the published rate is not what the customer pays.",
                },
                per: { type: "integer", example: 1000000 },
                included_quantity: {
                  type: "integer",
                  example: 1000000,
                  description:
                    "For a metered meter this is the PER-CYCLE included allowance, which resets each billing period.",
                },
                cost_cents: {
                  type: "integer",
                  nullable: true,
                  example: 17,
                  description:
                    "Populated for priced and metered meters; null for covered meters (not billed).",
                },
              },
            },
          },
          groups: {
            type: "array",
            description:
              "Period totals broken down by `group_by`. Cost is split pro rata by quantity, so the parts always sum to the whole.",
            items: {
              type: "object",
              required: ["key", "label", "quantity"],
              properties: {
                key: {
                  type: "string",
                  example: "flags",
                  description:
                    "Product id, project id (or `__org__`), or meter id, per `group_by`.",
                },
                label: { type: "string", example: "Feature Flags" },
                quantity: { type: "integer", example: 3400000 },
                cost_cents: {
                  type: "integer",
                  nullable: true,
                  example: 17,
                  description: "Null on contract pricing.",
                },
              },
            },
          },
          series: {
            type: "array",
            description:
              "Chronological buckets for charting. The included allowance is drawn down in time order, so buckets sum to exactly `usage_cents`.\n\nEvery bucket carries quantity alongside cost, so a contracted organization still gets a chartable series with the cost fields nulled out. Quantity is never allocated pro rata the way cost is, so it is exact.",
            items: {
              type: "object",
              required: ["start", "end", "quantity", "by_group_quantity"],
              properties: {
                start: {
                  type: "string",
                  format: "date",
                  example: "2026-07-19",
                },
                end: { type: "string", format: "date", example: "2026-07-19" },
                cost_cents: {
                  type: "integer",
                  nullable: true,
                  example: 4,
                  description: "Null on contract pricing.",
                },
                by_group: {
                  type: "object",
                  additionalProperties: { type: "integer" },
                  description:
                    "Cost in cents per group key. Empty on contract pricing.",
                },
                quantity: { type: "integer", example: 120000 },
                by_group_quantity: {
                  type: "object",
                  additionalProperties: { type: "integer" },
                  description: "Raw quantity per group key.",
                },
              },
            },
          },
          projects: {
            type: "array",
            description: "Projects that produced usage in the period.",
            items: {
              type: "object",
              required: ["id", "name"],
              properties: {
                id: {
                  type: "string",
                  example: "019f7cd8-11c2-7a90-b3f1-52f3ec9c238e",
                },
                name: { type: "string", example: "checkout" },
              },
            },
          },
        },
      },
      BillingPeriod: {
        type: "object",
        description:
          "One billing period. Closed periods carry the totals frozen when they were billed; the open period's totals are null because they are still moving.",
        required: [
          "period_start",
          "period_end",
          "label",
          "status",
          "is_current",
          "plan",
        ],
        properties: {
          period_start: {
            type: "string",
            format: "date",
            example: "2026-07-19",
          },
          period_end: { type: "string", format: "date", example: "2026-08-18" },
          label: { type: "string", example: "Jul 19, 2026 - Aug 18, 2026" },
          status: {
            type: "string",
            enum: ["open", "closed", "invoiced", "void"],
          },
          is_current: { type: "boolean" },
          plan: { type: "string", enum: ["free", "pro", "enterprise"] },
          usage_cents: { type: "integer", nullable: true, example: 2512 },
          credit_applied_cents: {
            type: "integer",
            nullable: true,
            example: 2000,
          },
          overage_cents: { type: "integer", nullable: true, example: 512 },
          stripe_invoice_id: { type: "string", nullable: true },
        },
      },
      AccessToken: {
        type: "object",
        description:
          "An access token's metadata. The secret itself is stored only as a hash and is never returned by a list or read.",
        required: ["id", "name", "subject_type", "scopes", "created_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", example: "Production server" },
          subject_type: {
            type: "string",
            enum: ["user", "organization"],
            description:
              "`user` acts as the person who owns it and inherits their roles; `organization` belongs to the org itself and its authority is its scopes.",
          },
          scopes: {
            type: "array",
            items: { type: "string" },
            example: ["flags:evaluate"],
          },
          expires_at: { type: "string", format: "date-time", nullable: true },
          last_used_at: {
            type: "string",
            format: "date-time",
            nullable: true,
            description:
              "Recorded at most once a minute, so it lags a busy token slightly.",
          },
          created_at: { type: "string", format: "date-time" },
        },
      },
      AccessTokenSecret: {
        allOf: [
          { $ref: "#/components/schemas/AccessToken" },
          {
            type: "object",
            required: ["token"],
            properties: {
              token: {
                type: "string",
                description:
                  "The secret. Returned ONLY on creation and rotation, and not recoverable afterwards.",
                example: "flagon_org_...",
              },
            },
          },
        ],
      },
      ProjectOwner: {
        type: "object",
        description:
          "One catalog owner: a team or a person. Ownership documents responsibility and grants no access. `team_id`/`team_name` are populated for teams and null for people; `user_id`/`username` the other way round. `name` is always the display name of whichever it is.",
        required: ["id", "type", "name", "created_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          type: { type: "string", enum: ["team", "user"] },
          name: { type: "string", example: "Platform" },
          team_id: { type: "string", format: "uuid", nullable: true },
          team_name: { type: "string", nullable: true, example: "Platform" },
          user_id: { type: "string", nullable: true },
          username: { type: "string", nullable: true, example: "robin" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      UsageCounters: {
        type: "object",
        description:
          "Live consumption counters for the period the organization is currently accruing into, with each meter's hard cap and included allowance.",
        required: ["period_start", "plan", "counters"],
        properties: {
          period_start: {
            type: "string",
            format: "date",
            description:
              "First day of the window these counters cover. The organization's OWN billing window, not the calendar month, so a cap counts the same period the invoice does. An organization without a subscription has no cycle, so this is the first of the calendar month.",
            example: "2026-07-19",
          },
          plan: { type: "string", enum: ["free", "pro", "enterprise"] },
          counters: {
            type: "array",
            items: { $ref: "#/components/schemas/UsageCounter" },
          },
        },
      },
      UsageCounter: {
        type: "object",
        description:
          "One meter's live counter. `limit` is what the plan may CONSUME before requests are refused; `included` is what it gets before it is CHARGED. Those are different questions: on Pro the sync allowance is billed past, never refused.",
        required: [
          "meter",
          "used",
          "limit",
          "remaining",
          "hard_capped",
          "included",
        ],
        properties: {
          meter: { type: "string", example: "flags.evaluations" },
          used: { type: "integer", format: "int64", example: 8_240_000 },
          limit: {
            type: "integer",
            format: "int64",
            nullable: true,
            description: "Null when the meter is not hard-capped on this plan.",
            example: 10_000_000,
          },
          remaining: {
            type: "integer",
            format: "int64",
            nullable: true,
            description:
              "Null when the meter is not hard-capped. Floored at 0.",
            example: 1_760_000,
          },
          hard_capped: {
            type: "boolean",
            description:
              "Whether exceeding `limit` refuses requests (Hobby) rather than billing for them (Pro, Enterprise).",
          },
          included: {
            type: "integer",
            format: "int64",
            description: "Units this plan gets before pricing starts.",
            example: 0,
          },
        },
      },
      Owner: {
        type: "object",
        description: "The organization's single owner.",
        required: ["username", "name"],
        properties: {
          username: { type: "string", nullable: true, example: "robin" },
          name: { type: "string", example: "Robin Vale" },
          since: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "When they joined the organization.",
          },
        },
      },
      Invitation: {
        type: "object",
        description: "A pending invitation into an organization.",
        required: ["id", "email", "role", "status", "expires_at"],
        properties: {
          id: {
            type: "string",
            example: "019f7cd8-11c2-7a90-b3f1-52f3ec9c238e",
            description: "UUIDv7.",
          },
          email: {
            type: "string",
            format: "email",
            example: "robin@flagon.io",
          },
          role: {
            type: "string",
            enum: ["member", "admin", "owner"],
            example: "member",
          },
          status: { type: "string", example: "pending" },
          expires_at: { type: "string", format: "date-time" },
        },
      },
      TeamMember: {
        type: "object",
        description: "A person on a team.",
        required: ["username", "name", "added_at"],
        properties: {
          username: { type: "string", nullable: true, example: "robin" },
          name: { type: "string", example: "Robin Vale" },
          added_at: { type: "string", format: "date-time" },
        },
      },
      ProjectGrant: {
        type: "object",
        description:
          "An explicit access grant on a project, held by a member or a team.",
        required: ["id", "role", "subject", "created_at"],
        properties: {
          id: {
            type: "string",
            example: "019f7cd6-91b3-7d20-a1c7-4f8e2d93ab55",
            description: "UUIDv7.",
          },
          role: {
            type: "string",
            enum: ["read", "write", "admin"],
            example: "write",
          },
          subject: {
            type: "object",
            description:
              "Who holds the grant: a member (type user, addressed by username) or a team (type team, addressed by id).",
            required: ["type", "name"],
            properties: {
              type: { type: "string", enum: ["user", "team"], example: "team" },
              id: {
                type: "string",
                nullable: true,
                description: "Team id (teams only).",
              },
              username: {
                type: "string",
                nullable: true,
                description: "Username (users only).",
              },
              name: { type: "string", example: "Platform" },
            },
          },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Team: {
        type: "object",
        description: "A team in an organization.",
        required: ["id", "name", "created_at", "updated_at"],
        properties: {
          id: {
            type: "string",
            example: "019f7cd5-3e02-7c88-9f4b-2b91acd07f13",
            description: "UUIDv7.",
          },
          name: { type: "string", example: "Platform" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Email: {
        type: "object",
        description: "An email address on the account.",
        required: ["id", "email", "verified", "primary", "created_at"],
        properties: {
          id: {
            type: "string",
            example: "019f7cce-cd51-7a41-b3aa-52f3ec9c238e",
            description: "UUIDv7.",
          },
          email: { type: "string", format: "email", example: "work@flagon.io" },
          verified: { type: "boolean", example: true },
          primary: { type: "boolean", example: false },
          created_at: { type: "string", format: "date-time" },
        },
      },
    },
  },
} as const;

export type OpenApiSpec = typeof openApiSpec;
