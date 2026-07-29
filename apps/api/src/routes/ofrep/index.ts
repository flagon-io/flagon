import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { env } from "../../env.js";
import {
  getEvaluationData,
  getEvaluationDataWithEtag,
} from "../../flags/eval-cache.js";
import { evaluate } from "../../flags/evaluate.js";
import { recordEvaluations, type UsageEntry } from "../../flags/usage.js";
import { createDurableEvalLimiter } from "../../lib/durable-eval-limiter.js";
import { rateLimit, tooManyRequests } from "../../lib/rate-limit.js";
import { clientIp } from "../../lib/http.js";
import {
  looksLikeSdkKey,
  resolveSdkKey,
  type SdkKeyIdentity,
} from "../../flags/sdk-key.js";
import type {
  EvaluationContext,
  EvaluationResult,
} from "../../flags/types.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

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
 * Durable, cross-instance rate limiter on evaluation, keyed by SDK key. The
 * count lives in Postgres so the ceiling holds across every serverless instance,
 * with no dependence on an edge/CDN/WAF. It reserves a small batch of tokens per
 * database round-trip and spends them from memory (see durable-eval-limiter.ts),
 * so a busy key stays cheap on the hot path while the global limit is real.
 */
const evalLimiter = createDurableEvalLimiter({
  limit: env.EVAL_RATE_LIMIT,
  windowSeconds: env.EVAL_RATE_WINDOW_SECONDS,
  chunk: env.EVAL_RATE_RESERVE_CHUNK,
});

async function authenticate(c: Context): Promise<SdkKeyIdentity | null> {
  const authorization = c.req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!looksLikeSdkKey(token)) return null;
  return resolveSdkKey(token);
}

/**
 * Resolve the SDK key, or return the response to send. A bad/absent key still
 * costs a resolveSdkKey DB lookup, so a flood of invalid keys could hammer the
 * database on this public hot path. Throttle repeated FAILURES by IP (mirroring
 * the management API's failed-bearer backstop) before returning 401; a valid key
 * never touches the limiter.
 */
async function requireSdkKey(c: Context): Promise<SdkKeyIdentity | Response> {
  const identity = await authenticate(c);
  if (identity) return identity;
  const limited = await rateLimit({
    key: `sdk-fail:${clientIp(c)}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!limited.ok) return tooManyRequests(c, limited);
  return authError(c);
}

type ContextOrError =
  | { context: EvaluationContext }
  | { errorCode: string; errorDetails: string };

/**
 * Parse and validate the evaluation context from the request body. Per OFREP, a
 * malformed body is a 400 PARSE_ERROR and a non-object `context` is a 400
 * INVALID_CONTEXT; an empty body is treated as an empty context (lenient — a
 * flag with no rollout needs no targetingKey). The server clock is stamped last.
 */
async function readContext(c: Context): Promise<ContextOrError> {
  const text = await c.req.text().catch(() => "");
  let context: EvaluationContext = {};
  if (text.trim() !== "") {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { errorCode: "PARSE_ERROR", errorDetails: "Request body is not valid JSON." };
    }
    const ctx = (body as { context?: unknown } | null)?.context;
    if (ctx !== undefined) {
      if (typeof ctx !== "object" || ctx === null || Array.isArray(ctx)) {
        return { errorCode: "INVALID_CONTEXT", errorDetails: "`context` must be an object." };
      }
      context = ctx as EvaluationContext;
    }
  }
  // Server-enforced clock: `$currentTime` is set AFTER spreading the client
  // context, so time-based rules can't be spoofed by a client-supplied attribute.
  return { context: { ...context, $currentTime: Date.now() } };
}

const authError = (c: Context) =>
  c.json(
    {
      errorCode: "AUTHENTICATION_ERROR",
      errorDetails: "A valid client key is required (Authorization: Bearer ...).",
    },
    401,
  );

/** An OFREP error response: `{ errorCode, errorDetails }` at an HTTP status. */
function ofrepFail(
  c: Context,
  status: 400 | 404 | 500,
  errorCode: string,
  errorDetails: string,
  extra: Record<string, unknown> = {},
) {
  return c.json({ ...extra, errorCode, errorDetails }, status);
}

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

/** Project a successful evaluation into the OFREP success shape. */
function toSuccess(result: EvaluationResult): Record<string, unknown> {
  return {
    key: result.key,
    value: result.value,
    reason: result.reason,
    ...(result.variant ? { variant: result.variant } : {}),
    metadata: result.metadata ?? {},
  };
}

/**
 * Project a result into a bulk-array entry: a success object, or an OFREP
 * failure object ({ key, errorCode, errorDetails }) when the engine errored on
 * that one flag — so one misconfigured flag never fails the whole bulk call.
 */
function toBulkEntry(result: EvaluationResult): Record<string, unknown> {
  if (result.reason === "ERROR") {
    return {
      key: result.key,
      errorCode: result.errorCode ?? "GENERAL",
      ...(result.errorDetails ? { errorDetails: result.errorDetails } : {}),
    };
  }
  return toSuccess(result);
}

// Single flag.
ofrep.post("/v1/evaluate/flags/:key", async (c) => {
  const identity = await requireSdkKey(c);
  if (identity instanceof Response) return identity;

  const limited = await evalLimiter.check(identity.keyId);
  if (!limited.ok) return tooManyRequests(c, limited);

  const parsed = await readContext(c);
  if ("errorCode" in parsed) {
    return ofrepFail(c, 400, parsed.errorCode, parsed.errorDetails);
  }

  const key = c.req.param("key");
  const data = await getEvaluationData(
    identity.organizationId,
    identity.environmentId,
  );
  const flag = data.flags.find((f) => f.key === key);

  if (!flag) {
    return ofrepFail(
      c,
      404,
      "FLAG_NOT_FOUND",
      `Flag "${key}" is not configured in this environment.`,
      { key },
    );
  }

  const result = evaluate(flag, parsed.context, data.segments);
  if (result.reason === "ERROR") {
    // A handled evaluation error (bad variant reference, degenerate config) is a
    // 400 per the OFREP spec: the request reached us and was understood, the
    // flag's configuration just could not resolve. Genuinely unexpected throws
    // still surface as a 500 via the app-level error handler.
    return ofrepFail(
      c,
      400,
      result.errorCode ?? "GENERAL",
      result.errorDetails ?? "Evaluation failed.",
      { key },
    );
  }

  await record(c, identity.organizationId, identity.environmentId, [
    usageEntry(flag.id, result),
  ]);

  return c.json(toSuccess(result));
});

// Bulk: all flags configured in the key's environment.
ofrep.post("/v1/evaluate/flags", async (c) => {
  const identity = await requireSdkKey(c);
  if (identity instanceof Response) return identity;

  const limited = await evalLimiter.check(identity.keyId);
  if (!limited.ok) return tooManyRequests(c, limited);

  const parsed = await readContext(c);
  if ("errorCode" in parsed) {
    return ofrepFail(c, 400, parsed.errorCode, parsed.errorDetails);
  }

  const { data, etag } = await getEvaluationDataWithEtag(
    identity.organizationId,
    identity.environmentId,
  );

  // Config-version caching: a client polls with a static context, so an
  // unchanged config (same ETag) means unchanged results — answer 304 with no
  // body, sparing the evaluation and the payload.
  c.header("ETag", etag);
  if (c.req.header("if-none-match") === etag) return c.body(null, 304);

  const results = data.flags.map((flag) => evaluate(flag, parsed.context, data.segments));
  const entries = data.flags
    .map((flag, i) => ({ flag, result: results[i] }))
    .filter(({ result }) => result.reason !== "ERROR")
    .map(({ flag, result }) => usageEntry(flag.id, result));

  await record(c, identity.organizationId, identity.environmentId, entries);

  return c.json({ flags: results.map(toBulkEntry) });
});

// --- OpenAPI registration ----------------------------------------------------
// The two evaluation endpoints, declared so they appear in GET /openapi.json and
// the root index. Both take an SDK key and read the OFREP evaluation context.
const OFREP_TAG = "OFREP evaluation";

// The request body: an optional OpenFeature evaluation context. `targetingKey`
// steers deterministic rollouts; any other attribute is matched by rules.
const evaluationContextSchema = z
  .object({ targetingKey: z.string().optional() })
  .catchall(z.unknown());
const evaluateRequestSchema = z.object({ context: evaluationContextSchema.optional() });

// A successful evaluation (see toSuccess): the resolved value, reason, the
// serving variant when there is one, and a metadata object.
const evaluationSuccessSchema = z.object({
  key: z.string(),
  value: z.unknown().describe("The resolved flag value; any JSON type."),
  reason: z.string(),
  variant: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
});
registerComponentSchema("EvaluationResponse", evaluationSuccessSchema);

// A per-flag failure entry in a bulk response (see toBulkEntry): one
// misconfigured flag never fails the whole bulk call.
const evaluationFailureSchema = z.object({
  key: z.string(),
  errorCode: z.string(),
  errorDetails: z.string().optional(),
});
registerComponentSchema(
  "BulkEvaluationResponse",
  z.object({
    flags: z.array(z.union([evaluationSuccessSchema, evaluationFailureSchema])),
  }),
);

registerRoute({
  method: "post",
  path: "/ofrep/v1/evaluate/flags/{key}",
  summary: "Evaluate a flag",
  description:
    "Evaluate one flag for the supplied evaluation context. Authenticated by a client key, which pins the organization and environment.",
  tags: [OFREP_TAG],
  security: "sdkKey",
  paramDescriptions: { key: "The flag key." },
  request: { body: evaluateRequestSchema },
  responses: {
    200: { description: "The evaluation result.", schemaName: "EvaluationResponse" },
    400: {
      description:
        "The request body could not be parsed, the context was invalid, or the flag's configuration could not resolve.",
    },
    401: { description: "A valid client key is required." },
    404: { description: "The flag is not configured in this environment." },
    429: { description: "Too many evaluations; retry after the Retry-After delay." },
  },
});

registerRoute({
  method: "post",
  path: "/ofrep/v1/evaluate/flags",
  summary: "Evaluate all flags",
  description:
    "Evaluate every flag configured in the client key's environment for the supplied context. Each entry is a success object or a per-flag failure object, so one misconfigured flag never fails the call.",
  tags: [OFREP_TAG],
  security: "sdkKey",
  request: { body: evaluateRequestSchema },
  responses: {
    200: { description: "The evaluation results. The response carries an ETag.", schemaName: "BulkEvaluationResponse" },
    304: {
      description:
        "The configuration is unchanged since the ETag in the If-None-Match request header, so the previous results still hold. No body is returned.",
    },
    400: {
      description: "The request body could not be parsed, or the context was invalid.",
    },
    401: { description: "A valid client key is required." },
    429: { description: "Too many evaluations; retry after the Retry-After delay." },
  },
});
