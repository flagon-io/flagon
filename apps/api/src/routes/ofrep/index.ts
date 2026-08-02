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
import { compactUsageEvents, ingestEvents } from "../../usage/events.js";
import { notifyUsageThresholds } from "../../usage/notify.js";
import { eventsAllowanceStatus, isIngestCapped } from "../../usage/allowance.js";
import { anyPlanHardCaps, planHardCaps } from "../../lib/plans.js";
import { withOrg } from "../../db/tenant.js";
import { orgPlan } from "../../lib/org-context.js";
import { createDurableEvalLimiter } from "../../lib/durable-eval-limiter.js";
import { rateLimit, tooManyRequests } from "../../lib/rate-limit.js";
import { clientIp } from "../../lib/http.js";
import {
  looksLikeClientKey,
  resolveClientKey,
  type ClientKeyIdentity,
} from "../../flags/client-key.js";
import type {
  EvaluationContext,
  EvaluationResult,
} from "../../flags/types.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * OFREP — the OpenFeature Remote Evaluation Protocol. This is the hot path SDKs
 * call: an OpenFeature client with an OFREP provider hits these endpoints to
 * evaluate flags, authenticated by an client key (which pins the org + environment).
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
 * Durable, cross-instance rate limiter on evaluation, keyed by client key. The
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

/**
 * The per-key eval-REQUEST ceiling for a plan. Hobby (free) gets a tighter
 * fair-use limit; paid plans get the full default. Logical checks stay free and
 * unlimited — this bounds only the network requests behind them (the real infra
 * cost), so uncached/abusive polling is throttled while a well-cached SDK, which
 * fetches once and evaluates from memory, never comes close.
 */
function evalRateLimitForPlan(plan: string): number {
  return plan === "hobby" ? env.EVAL_RATE_LIMIT_HOBBY : env.EVAL_RATE_LIMIT;
}

async function authenticate(c: Context): Promise<ClientKeyIdentity | null> {
  const authorization = c.req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!looksLikeClientKey(token)) return null;
  return resolveClientKey(token);
}

/**
 * Resolve the client key, or return the response to send. A bad/absent key still
 * costs a resolveClientKey DB lookup, so a flood of invalid keys could hammer the
 * database on this public hot path. Throttle repeated FAILURES by IP (mirroring
 * the management API's failed-bearer backstop) before returning 401; a valid key
 * never touches the limiter.
 */
async function requireSdkKey(c: Context): Promise<ClientKeyIdentity | Response> {
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
function defer(c: Context, promise: Promise<unknown>): Promise<void> | void {
  let ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined;
  }
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(promise);
  else return promise as Promise<void>;
}

async function record(
  c: Context,
  organizationId: string,
  environmentId: string,
  entries: UsageEntry[],
): Promise<void> {
  await defer(c, recordEvaluations(organizationId, environmentId, entries));
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

  const limited = await evalLimiter.check(identity.keyId, evalRateLimitForPlan(identity.plan));
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

  const limited = await evalLimiter.check(identity.keyId, evalRateLimitForPlan(identity.plan));
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

/**
 * The most events we fold from a single ingest request. A batch beyond this is
 * rejected (400) rather than silently truncated, so a client never believes it
 * recorded more than it did. Clients should chunk larger batches.
 */
const MAX_EXPOSURES_PER_REQUEST = 1000;

/**
 * Exposure ingest: the billable events meter.
 *
 * A flag CHECK is free (that is the wedge); an EXPOSURE is the analytics event a
 * customer chooses to send when they want usage or experiment analysis on a
 * check. Same client-key auth and rate limiter as evaluation; the body is a batch
 * of exposures.
 *
 * Because this is the money meter it is DURABLE, not best-effort: the batch is
 * written in-band as one immutable, idempotent receipt (usage_events), so a
 * network retry never double-counts and a failed write surfaces as an error the
 * client can safely retry. Send an `Idempotency-Key` header to make retries
 * exactly-once; without one each request is a distinct batch. We store only the
 * count, not the exposure detail. Compaction into the daily rollups runs off the
 * hot path.
 *
 *   POST /ofrep/v1/exposures   body: { "events": [ { "key": "my-flag", ... } ] }
 *   Header (optional):         Idempotency-Key: <stable per-batch id>
 */
ofrep.post("/v1/exposures", async (c) => {
  const identity = await requireSdkKey(c);
  if (identity instanceof Response) return identity;

  const limited = await evalLimiter.check(identity.keyId, evalRateLimitForPlan(identity.plan));
  if (!limited.ok) return tooManyRequests(c, limited);

  const text = await c.req.text().catch(() => "");
  let body: unknown;
  try {
    body = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    return ofrepFail(c, 400, "PARSE_ERROR", "Request body is not valid JSON.");
  }

  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) {
    return ofrepFail(c, 400, "INVALID_CONTEXT", "`events` must be an array of exposures.");
  }
  if (events.length > MAX_EXPOSURES_PER_REQUEST) {
    return ofrepFail(
      c,
      400,
      "INVALID_CONTEXT",
      `Too many events in one request (max ${MAX_EXPOSURES_PER_REQUEST}); send them in smaller batches.`,
    );
  }

  if (events.length === 0) return c.json({ recorded: 0, duplicate: false }, 202);

  // Plan-cap enforcement, GATED by the plan's hardCap policy (lib/plans.ts). Hobby
  // (free) HARD-CAPS: past its monthly allowance an org is refused here (403), so the
  // free tier can't run up unbounded cost. Paid plans are warn-first (hardCap:false):
  // we only MEASURE against the allowance (the counter increments below, surfaced on
  // the usage page) and never block. `anyPlanHardCaps()` is a static short-circuit, so
  // if NO plan hard-caps this loads no plan and touches no DB; today Hobby does, so a
  // hard-capped plan pays one plan lookup here.
  if (anyPlanHardCaps()) {
    const plan = await orgPlan(identity.organizationId);
    if (planHardCaps(plan)) {
      const status = await withOrg(identity.organizationId, (tx) =>
        eventsAllowanceStatus(tx, plan),
      );
      if (isIngestCapped(status)) {
        return c.json(
          {
            errorCode: "PLAN_LIMIT_REACHED",
            errorDetails: `This organization has used its ${status.includedEvents.toLocaleString()} included events for the current period. Upgrade to record more.`,
            includedEvents: status.includedEvents,
            usedEvents: status.usedEvents,
          },
          403,
        );
      }
    }
  }

  // Durable + idempotent: awaited in-band so a write failure becomes an error the
  // client retries safely. `Idempotency-Key` (if sent) is the batch's retry
  // identity; a repeat collapses to a no-op.
  const idempotencyKey = c.req.header("idempotency-key")?.trim() || undefined;
  const result = await ingestEvents(identity.organizationId, events.length, {
    source: "flags.exposure",
    idempotencyKey,
  });

  // Off the hot path, for a genuinely new receipt: fold it into the daily rollups
  // (if this slips, the receipt stays uncompacted and the next ingest picks it up)
  // and send any warn-first threshold email. notifyUsageThresholds never throws.
  if (!result.duplicate) {
    await defer(
      c,
      Promise.all([
        compactUsageEvents(identity.organizationId),
        notifyUsageThresholds(identity.organizationId),
      ]),
    );
  }

  return c.json({ recorded: result.recorded, duplicate: result.duplicate }, 202);
});

// --- OpenAPI registration ----------------------------------------------------
// The two evaluation endpoints, declared so they appear in GET /openapi.json and
// the root index. Both take an client key and read the OFREP evaluation context.
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

// The exposure ingest body: a batch of analytics events. Each entry carries the
// flag key it relates to (and any client-side detail); Flagon meters the count.
const exposuresRequestSchema = z.object({
  events: z
    .array(z.object({ key: z.string().optional() }).catchall(z.unknown()))
    .describe("A batch of exposure events; the count is metered."),
});
registerComponentSchema("ExposuresRequest", exposuresRequestSchema);
registerComponentSchema(
  "ExposuresResponse",
  z.object({
    recorded: z
      .number()
      .describe("Events durably recorded by this request; 0 if it was a duplicate."),
    duplicate: z
      .boolean()
      .describe("True when this batch's Idempotency-Key was already seen; the request was a no-op."),
  }),
);

registerRoute({
  method: "post",
  path: "/ofrep/v1/exposures",
  summary: "Record flag exposures",
  description:
    "Record a batch of flag exposures for analytics. A flag check is free; an exposure is the billable analytics event you send when you want usage or experiment analysis on a check. Authenticated by the same client key as evaluation. Flagon meters the number of events; the batch is capped per request, so chunk larger volumes. Recording is durable: send an `Idempotency-Key` header so a network retry of the same batch is counted exactly once (a repeat returns `duplicate: true` and records nothing further).",
  tags: [OFREP_TAG],
  security: "sdkKey",
  headerParams: [
    {
      name: "Idempotency-Key",
      description:
        "A stable, unique id for this batch. A retry with the same key is counted once; omit it and each request is a distinct batch.",
    },
  ],
  request: { body: exposuresRequestSchema },
  responses: {
    202: { description: "The exposures were accepted for metering.", schemaName: "ExposuresResponse" },
    400: { description: "The request body could not be parsed, or `events` was invalid or too large." },
    401: { description: "A valid client key is required." },
    429: { description: "Too many requests; retry after the Retry-After delay." },
  },
});
