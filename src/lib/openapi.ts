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
