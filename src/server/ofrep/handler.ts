/**
 * OFREP - the OpenFeature Remote Evaluation Protocol - server implementation.
 *
 * Implementing this published standard is what makes Flagon "OpenFeature-native":
 * any OpenFeature SDK configured with the OFREP provider can evaluate against us
 * with zero custom code.
 *
 *   GET  /ofrep/v1/configuration          -> provider capabilities discovery
 *   POST /ofrep/v1/evaluate/flags/{key}   -> single evaluation
 *   POST /ofrep/v1/evaluate/flags         -> bulk evaluation
 *
 * This is the complete OFREP API surface, so any OpenFeature SDK pointed at us
 * with the OFREP provider works unmodified (eval + polling cache invalidation).
 *
 * Auth is an SDK key bearer token (never a user session) - this surface behaves
 * exactly like the standalone Go data plane it will one day become.
 */

import { evaluateAll, evaluateFlag } from '@/core';
import type { EvaluationContext } from '@/core/types';
import { bundleStore } from '@/server/bundles';
import { bearerFromHeader, resolveSdkKey } from '@/server/flags/sdk-keys';

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init?.headers ?? {}) },
  });
}

/** HTTP-correct strong ETag value (quoted) for a bundle etag. */
function etagHeader(etag: string): string {
  return `"${etag}"`;
}

/** Whether the request's If-None-Match matches the bundle etag (quote/weak tolerant). */
function ifNoneMatch(req: Request, etag: string): boolean {
  const header = req.headers.get('if-none-match');
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header
    .split(',')
    .map((t) => t.trim().replace(/^W\//, '').replace(/^"|"$/g, ''))
    .includes(etag);
}

async function authenticate(req: Request) {
  const token = bearerFromHeader(req.headers.get('authorization'));
  if (!token) return null;
  return resolveSdkKey(token);
}

/**
 * GET /ofrep/v1/configuration — OFREP provider capability discovery. Tells the
 * SDK we support polling-based cache invalidation (via the bundle ETag on the
 * bulk endpoint) and which value types we evaluate.
 */
export async function getConfiguration(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth) return json({ errorCode: 'GENERAL', errorDetails: 'invalid SDK key' }, { status: 401 });

  return json({
    name: 'Flagon',
    capabilities: {
      cacheInvalidation: {
        // Both spellings used across OFREP provider versions; extras are ignored.
        polling: { enabled: true, minPollingInterval: 30000, minPollingIntervalMs: 30000 },
      },
      flagEvaluation: {
        supportedTypes: ['boolean', 'string', 'integer', 'float', 'object'],
      },
    },
  });
}

/** Pull the OpenFeature context out of an OFREP request body. */
async function readContext(req: Request): Promise<EvaluationContext> {
  try {
    const body = (await req.json()) as { context?: EvaluationContext } | null;
    return body?.context ?? {};
  } catch {
    return {};
  }
}

/** POST /ofrep/v1/evaluate/flags/{key} */
export async function evaluateSingle(req: Request, key: string): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth) return json({ errorCode: 'GENERAL', errorDetails: 'invalid SDK key' }, { status: 401 });

  const bundle = await bundleStore().get({
    organizationId: auth.organizationId,
    environmentId: auth.environmentId,
  });
  if (!bundle) {
    return json(
      { key, errorCode: 'FLAG_NOT_FOUND', errorDetails: 'no bundle published for environment' },
      { status: 404 },
    );
  }

  const context = await readContext(req);
  const result = evaluateFlag(bundle, key, context);

  // OFREP: errors return 4xx with the error body; success returns 200.
  if (result.errorCode) {
    const status = result.errorCode === 'FLAG_NOT_FOUND' ? 404 : 400;
    return json(result, { status, headers: { etag: etagHeader(bundle.etag) } });
  }
  return json(result, { headers: { etag: etagHeader(bundle.etag) } });
}

/** POST /ofrep/v1/evaluate/flags */
export async function evaluateBulk(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth) return json({ errorCode: 'GENERAL', errorDetails: 'invalid SDK key' }, { status: 401 });

  const bundle = await bundleStore().get({
    organizationId: auth.organizationId,
    environmentId: auth.environmentId,
  });
  if (!bundle) return json({ flags: [] }, { headers: { etag: etagHeader('empty') } });

  // Conditional request support: if the client already has this bundle, 304.
  if (ifNoneMatch(req, bundle.etag)) {
    return new Response(null, { status: 304, headers: { etag: etagHeader(bundle.etag) } });
  }

  const context = await readContext(req);
  const flags = evaluateAll(bundle, context);
  return json({ flags }, { headers: { etag: etagHeader(bundle.etag) } });
}
