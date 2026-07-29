import { Hono } from "hono";
import type { Context } from "hono";
import { env } from "../../env.js";
import { getEvaluationData } from "../../flags/eval-cache.js";
import { evaluate } from "../../flags/evaluate.js";
import { recordEvaluations, type UsageEntry } from "../../flags/usage.js";
import { createHotRateLimiter } from "../../lib/hot-rate-limit.js";
import { tooManyRequests } from "../../lib/rate-limit.js";
import {
  looksLikeSdkKey,
  resolveSdkKey,
  type SdkKeyIdentity,
} from "../../flags/sdk-key.js";
import type {
  EvaluationContext,
  EvaluationResult,
} from "../../flags/types.js";

/**
 * OFREP — the OpenFeature Remote Evaluation Protocol. This is the hot path SDKs
 * call: an OpenFeature client with an OFREP provider hits these endpoints to
 * evaluate flags, authenticated by an SDK key (which pins the org + environment).
 *
 *   POST /ofrep/v1/evaluate/flags/{key}   single flag
 *   POST /ofrep/v1/evaluate/flags         all flags (bulk)
 *
 * Body: { "context": { "targetingKey": "...", ...attributes } }.
 *
 * Every evaluation runs inside withOrg() so row-level security scopes the flag
 * data to the key's org; the pure engine (flags/evaluate.ts) does the rest.
 */
export const ofrep = new Hono();

/**
 * Per-instance burst guardrail on evaluation, keyed by SDK key. In-memory on
 * purpose (see hot-rate-limit.ts): a DB-backed check per eval would undo the
 * eval-cache's whole point. Turns away runaway clients cheaply; precise global
 * quotas and real DoS defense live elsewhere (billing, the edge/CDN).
 */
const evalLimiter = createHotRateLimiter({
  limit: env.EVAL_RATE_LIMIT,
  windowSeconds: env.EVAL_RATE_WINDOW_SECONDS,
});

async function authenticate(c: Context): Promise<SdkKeyIdentity | null> {
  const authorization = c.req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!looksLikeSdkKey(token)) return null;
  return resolveSdkKey(token);
}

async function readContext(c: Context): Promise<EvaluationContext> {
  const body = (await c.req.json().catch(() => null)) as {
    context?: EvaluationContext;
  } | null;
  // Server-enforced clock: `$currentTime` is set here, AFTER spreading the
  // client context, so time-based rules ("live after <date>") evaluate against
  // our clock and can't be spoofed by a client-supplied attribute.
  return { ...(body?.context ?? {}), $currentTime: Date.now() };
}

const authError = (c: Context) =>
  c.json(
    {
      errorCode: "AUTHENTICATION_ERROR",
      errorDetails: "A valid SDK key is required (Authorization: Bearer ...).",
    },
    401,
  );

/**
 * Fold this request's evaluations into the usage rollups. Uses the platform's
 * waitUntil so it doesn't add latency to the eval response when available (e.g.
 * on Vercel); otherwise awaits (local/tests). recordEvaluations never throws.
 */
async function record(
  c: Context,
  organizationId: string,
  environmentId: string,
  entries: UsageEntry[],
): Promise<void> {
  const promise = recordEvaluations(organizationId, environmentId, entries);
  let ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined;
  }
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(promise);
  else await promise;
}

const usageEntry = (flagId: string, result: EvaluationResult): UsageEntry => ({
  flagId,
  variantKey: result.variant ?? "",
  reason: result.reason,
});

/** Project an internal result into the OFREP wire shape. */
function toOfrep(result: EvaluationResult): Record<string, unknown> {
  if (result.reason === "ERROR") {
    return {
      key: result.key,
      reason: "ERROR",
      errorCode: result.errorCode ?? "GENERAL",
      ...(result.errorDetails ? { errorDetails: result.errorDetails } : {}),
      value: result.value,
      metadata: result.metadata ?? {},
    };
  }
  return {
    key: result.key,
    value: result.value,
    reason: result.reason,
    ...(result.variant ? { variant: result.variant } : {}),
    metadata: result.metadata ?? {},
  };
}

// Single flag.
ofrep.post("/v1/evaluate/flags/:key", async (c) => {
  const identity = await authenticate(c);
  if (!identity) return authError(c);

  const limited = evalLimiter.check(identity.keyId);
  if (!limited.ok) return tooManyRequests(c, limited);

  const key = c.req.param("key");
  const context = await readContext(c);

  const data = await getEvaluationData(
    identity.organizationId,
    identity.environmentId,
  );
  const flag = data.flags.find((f) => f.key === key);

  if (!flag) {
    return c.json(
      {
        key,
        errorCode: "FLAG_NOT_FOUND",
        errorDetails: `Flag "${key}" is not configured in this environment.`,
      },
      404,
    );
  }

  const result = evaluate(flag, context, data.segments);

  await record(c, identity.organizationId, identity.environmentId, [
    usageEntry(flag.id, result),
  ]);

  return c.json(toOfrep(result));
});

// Bulk: all flags configured in the key's environment.
ofrep.post("/v1/evaluate/flags", async (c) => {
  const identity = await authenticate(c);
  if (!identity) return authError(c);

  const limited = evalLimiter.check(identity.keyId);
  if (!limited.ok) return tooManyRequests(c, limited);

  const context = await readContext(c);

  const data = await getEvaluationData(
    identity.organizationId,
    identity.environmentId,
  );
  const results = data.flags.map((flag) => evaluate(flag, context, data.segments));
  const entries = data.flags.map((flag, i) => usageEntry(flag.id, results[i]));

  await record(c, identity.organizationId, identity.environmentId, entries);

  return c.json({ flags: results.map(toOfrep) });
});
