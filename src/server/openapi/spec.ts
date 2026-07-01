/**
 * OpenAPI 3.1 document for the Flagon API.
 *
 * This is the single source of truth that powers both the machine-readable
 * `/api/openapi.json` and the built-in viewer at `/docs/api`. As the platform
 * grows, add tags, paths, and component schemas here and both stay in sync.
 * The API documents itself, and anyone can generate clients from it.
 *
 * Paths are relative to the `servers` entry, which is the request's API base
 * (e.g. https://api.flagon.io, or http://localhost:3000/api locally).
 *
 * SCOPE: this documents the PRODUCT API only - the contract people build on.
 * Internal platform endpoints (waitlist, admin, the BetterAuth handler) are
 * excluded. Capability APIs (Feature Flags, …) are added here as they land.
 */

type Json = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const errorResponse = (description: string, schema = 'Error') => ({
  description,
  content: { 'application/json': { schema: ref(schema) } },
});

const jsonBody = (schema: string, required = true) => ({
  required,
  content: { 'application/json': { schema: ref(schema) } },
});

export function buildOpenApiDocument(serverUrl: string): Json {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Flagon API',
      version: '1.0.0',
      description:
        'The Flagon developer platform API. JSON only; responses return the resource directly (no `data` envelope). Errors are `{ "message" }`, with a per-field `errors` object on validation failures.',
      license: { name: 'FSL-1.1-Apache-2.0' },
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'General', description: 'Discovery and health' },
      { name: 'Account', description: 'The signed-in user' },
      { name: 'Authentication', description: 'Token exchange for the JWT seam' },
      { name: 'Projects', description: 'Projects within an organization' },
    ],
    paths: {
      '/v1': {
        get: {
          tags: ['General'],
          summary: 'API index',
          description: 'A self-documenting map of v1 endpoint URLs.',
          responses: { '200': { description: 'Endpoint map' } },
        },
      },
      '/v1/health': {
        get: {
          tags: ['General'],
          summary: 'Health check',
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: ref('Health') } } },
          },
        },
      },
      '/v1/me': {
        get: {
          tags: ['Account'],
          summary: 'Current user',
          security: [{ apiToken: [] }, { sessionCookie: [] }],
          responses: {
            '200': {
              description: 'The signed-in user and their organizations',
              content: { 'application/json': { schema: ref('Me') } },
            },
            '401': errorResponse('Unauthenticated'),
          },
        },
      },
      '/v1/token': {
        post: {
          tags: ['Authentication'],
          summary: 'Exchange a credential for a JWT',
          description:
            'Exchanges the caller’s session, personal access token, or org token for a short-lived (15-minute) signed JWT. Backends validate that JWT against the published JWKS — no session or token lookup required.',
          security: [{ apiToken: [] }, { sessionCookie: [] }],
          responses: {
            '200': {
              description: 'A short-lived bearer JWT',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      token_type: { type: 'string', example: 'Bearer' },
                      expires_in: { type: 'integer', example: 900 },
                    },
                  },
                },
              },
            },
            '401': errorResponse('Unauthenticated'),
          },
        },
      },
      '/v1/orgs/{org}/projects': {
        parameters: [{ $ref: '#/components/parameters/Org' }],
        get: {
          tags: ['Projects'],
          summary: 'List projects',
          security: [{ apiToken: [] }, { sessionCookie: [] }],
          responses: {
            '200': {
              description: 'Projects',
              content: { 'application/json': { schema: ref('ProjectList') } },
            },
            '403': errorResponse('Forbidden'),
          },
        },
        post: {
          tags: ['Projects'],
          summary: 'Create a project',
          security: [{ apiToken: [] }, { sessionCookie: [] }],
          requestBody: jsonBody('ProjectCreate'),
          responses: {
            '201': {
              description: 'Created',
              content: { 'application/json': { schema: ref('ProjectWrapper') } },
            },
            '409': errorResponse('Slug already exists'),
            '422': errorResponse('Validation failed', 'ValidationError'),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        apiToken: {
          type: 'http',
          scheme: 'bearer',
          description:
            'A personal access token (flagon_pat_…), an org token (flagon_oat_…), or a JWT from POST /v1/token. Carries the caller’s permissions, optionally narrowed by scopes. Token requests are rate limited (429 + Retry-After).',
        },
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'flagon.session_token',
          description: 'The session cookie set after signing in.',
        },
      },
      parameters: {
        Org: {
          name: 'org',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Organization slug or id',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
            documentation_url: { type: 'string' },
          },
        },
        ValidationError: {
          type: 'object',
          required: ['message', 'errors'],
          properties: {
            message: { type: 'string', example: 'The given data was invalid.' },
            errors: {
              type: 'object',
              additionalProperties: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        Health: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            service: { type: 'string', example: 'flagon' },
            version: { type: 'string' },
            time: { type: 'string', format: 'date-time' },
          },
        },
        Me: {
          type: 'object',
          properties: {
            user: ref('User'),
            organizations: { type: 'array', items: ref('Organization') },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
          },
        },
        Organization: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            role: { type: 'string', enum: ['owner', 'admin', 'member', 'viewer'] },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
        ProjectList: {
          type: 'object',
          properties: { projects: { type: 'array', items: ref('Project') } },
        },
        ProjectWrapper: { type: 'object', properties: { project: ref('Project') } },
        ProjectCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', maxLength: 64 },
            slug: { type: 'string', pattern: '^[a-z0-9-]+$' },
          },
        },
      },
    },
  };
}
