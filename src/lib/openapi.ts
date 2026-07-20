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

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: `${brand.name} API`,
    version: "v1",
    description: [
      `The ${brand.name} REST API. Conventions: success is the HTTP status code, single resources come back as the bare object, collections as a bare array, and errors are a flat { message, code } body. Mutations return the updated resource (200/201) or nothing (204); metadata rides in headers. Pagination, when it lands, uses RFC 8288 Link headers.`,
      "",
      "Authenticate with an access token: personal access tokens for acting as yourself, organization access tokens for automation owned by an org. Both are sent as a Bearer token in the Authorization header. Token issuance is not open yet; until it is, requests from a signed-in browser authenticate with the session cookie (which is how the interactive console on the docs site works).",
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
      name: "Members",
      description:
        "The organization's roster and invitations. Invite an existing account by username (the invitation goes to its primary email) or anyone by email; accepting the emailed invitation is a browser flow.",
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
          "403": errorResponse(
            "Missing or untrusted Origin header.",
            "invalid_origin",
            "Missing or untrusted Origin header.",
          ),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
                    enum: ["member", "admin", "owner"],
                    example: "admin",
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
            "Invalid role.",
            "invalid_role",
            "Role must be one of: member, admin, owner.",
          ),
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
                    enum: ["member", "admin", "owner"],
                    default: "member",
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
        summary: "Rename a project",
        description:
          "Updates the project's display name. The slug is the stable identifier and does not change. Requires project admin.",
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
                required: ["name"],
                properties: {
                  name: { type: "string", example: "Storefront" },
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
          "400": errorResponse("Invalid name.", "invalid_name", "Provide a name."),
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
                    description: "Username of an organization member. Provide exactly one of user, team_id.",
                  },
                  team_id: {
                    type: "string",
                    example: "019f7cd5-3e02-7c88-9f4b-2b91acd07f13",
                    description: "Id of a team in the organization. Provide exactly one of user, team_id.",
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
        summary: "List a team's project access",
        description:
          "The projects this team holds an explicit access grant on, with the granted role. Grants are managed on the project (POST /v1/orgs/{slug}/projects/{project}/access).",
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
            description: "The team's project grants.",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["slug", "name", "role", "granted_at"],
                    properties: {
                      slug: { type: "string", example: "storefront" },
                      name: { type: "string", example: "Storefront" },
                      role: {
                        type: "string",
                        enum: ["read", "write", "admin"],
                        example: "write",
                      },
                      granted_at: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
          "401": errorResponse("Not signed in.", "unauthorized", "Sign in required."),
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
      Error: {
        ...errorEnvelope,
        description: "Every non-2xx response uses this envelope.",
      },
      User: {
        type: "object",
        description: "The authenticated user's profile.",
        required: ["id", "username", "name", "email", "email_verified", "created_at", "updated_at"],
        properties: {
          id: {
            type: "string",
            example: "019f7cce-cd39-77cd-9914-11953345f88e",
            description: "UUIDv7 (accounts created before the v7 rollout keep their historical ids).",
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
              "Stable identifier in URLs, SDK configuration, and the API; unique within the organization.",
          },
          name: { type: "string", example: "Storefront" },
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
          email: { type: "string", format: "email", example: "robin@flagon.io" },
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
