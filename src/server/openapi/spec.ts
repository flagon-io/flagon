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
 * Internal platform endpoints that are side effects of running the hosted
 * service (the waitlist, admin tooling, the BetterAuth handler) are deliberately
 * excluded; they exist and work, but they are not part of the published spec.
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
      { name: 'Projects', description: 'Projects within an organization' },
      { name: 'Environments', description: 'Environments and publishing' },
      { name: 'Evaluation', description: 'OpenFeature flag evaluation (OFREP)' },
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
          security: [{ sessionCookie: [] }],
          responses: {
            '200': {
              description: 'The signed-in user and their organizations',
              content: { 'application/json': { schema: ref('Me') } },
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
          security: [{ sessionCookie: [] }],
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
          security: [{ sessionCookie: [] }],
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
      '/v1/orgs/{org}/environments/{environmentId}/publish': {
        parameters: [
          { $ref: '#/components/parameters/Org' },
          { $ref: '#/components/parameters/EnvironmentId' },
        ],
        post: {
          tags: ['Environments'],
          summary: 'Publish an environment',
          description: 'Compiles the environment’s flags into a bundle and makes it live.',
          security: [{ sessionCookie: [] }],
          responses: {
            '200': {
              description: 'Published',
              content: { 'application/json': { schema: ref('PublishResult') } },
            },
            '404': errorResponse('Environment not found'),
          },
        },
      },
      '/ofrep/v1/evaluate/flags/{key}': {
        parameters: [
          {
            name: 'key',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Flag key',
          },
        ],
        post: {
          tags: ['Evaluation'],
          summary: 'Evaluate a flag (OFREP)',
          security: [{ sdkKey: [] }],
          requestBody: jsonBody('EvaluationRequest', false),
          responses: {
            '200': {
              description: 'Evaluation result',
              content: { 'application/json': { schema: ref('EvaluationResult') } },
            },
            '401': errorResponse('Invalid SDK key'),
            '404': errorResponse('Flag or bundle not found'),
          },
        },
      },
      '/ofrep/v1/evaluate/flags': {
        post: {
          tags: ['Evaluation'],
          summary: 'Bulk evaluate (OFREP)',
          security: [{ sdkKey: [] }],
          requestBody: jsonBody('EvaluationRequest', false),
          responses: {
            '200': {
              description: 'All flag evaluations',
              content: { 'application/json': { schema: ref('BulkEvaluationResult') } },
            },
            '304': { description: 'Not modified (matched If-None-Match etag)' },
            '401': errorResponse('Invalid SDK key'),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        sdkKey: {
          type: 'http',
          scheme: 'bearer',
          description: 'An environment SDK key, used for flag evaluation.',
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
        EnvironmentId: {
          name: 'environmentId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
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
        PublishResult: {
          type: 'object',
          properties: {
            published: { type: 'boolean' },
            etag: { type: 'string' },
            flagCount: { type: 'integer' },
            generatedAt: { type: 'string', format: 'date-time' },
          },
        },
        EvaluationRequest: {
          type: 'object',
          properties: {
            context: {
              type: 'object',
              description: 'OpenFeature evaluation context (targetingKey + attributes).',
              additionalProperties: true,
            },
          },
        },
        EvaluationResult: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: {},
            reason: {
              type: 'string',
              enum: ['STATIC', 'DEFAULT', 'TARGETING_MATCH', 'SPLIT', 'DISABLED', 'ERROR', 'UNKNOWN'],
            },
            variant: { type: 'string' },
            errorCode: { type: 'string' },
          },
        },
        BulkEvaluationResult: {
          type: 'object',
          properties: { flags: { type: 'array', items: ref('EvaluationResult') } },
        },
      },
    },
  };
}
