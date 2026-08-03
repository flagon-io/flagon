import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { env } from "../../env.js";
import {
  getEvaluationData,
  getEvaluationDataWithEtag,
} from "../../flags/eval-cache.js";
import { evaluate } from "../../flags/evaluate.js";
import {
  applyHoldout,
  getHoldoutOverlay,
  overlayFingerprint,
} from "../../experiments/holdout-overlay.js";
import { recordEvaluations, type UsageEntry } from "../../flags/usage.js";
import { compactUsageEvents, ingestEvents } from "../../usage/events.js";
import { maybeAutoExpose, claimExposure } from "../../usage/auto-expose.js";
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
import {
  attributeExposures,
  recordMetricEvents,
  type ExposureEvent,
  type MetricEventInput,
} from "../../experiments/ingest.js";

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
  // Flag config (the primitive) and the experiments holdout overlay are loaded and
  // cached independently, then composed here — flags does not know about holdouts.
  const [data, overlay] = await Promise.all([
    getEvaluationData(identity.organizationId, identity.environmentId),
    getHoldoutOverlay(identity.organizationId, identity.environmentId),
  ]);
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

  const result = applyHoldout(
    flag,
    evaluate(flag, parsed.context, data.segments),
    parsed.context,
    overlay,
  );
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

  // Exposures default-on: a remote per-flag evaluation with a targetingKey logs one
  // billable exposure (deduped per session), unless the key or this request opted
  // out. Deferred + best-effort, so it never adds latency to or fails the response.
  const optedOut = c.req.header("x-flagon-exposure")?.trim().toLowerCase() === "off";
  defer(c, maybeAutoExpose(identity, flag, result, parsed.context, optedOut));

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

  const [{ data, etag: flagEtag }, overlay] = await Promise.all([
    getEvaluationDataWithEtag(identity.organizationId, identity.environmentId),
    getHoldoutOverlay(identity.organizationId, identity.environmentId),
  ]);

  // Config-version caching: a client polls with a static context, so an unchanged
  // config (same ETag) means unchanged results — answer 304 with no body, sparing
  // the evaluation and the payload. The flag ETag and the holdout-overlay
  // fingerprint are folded together so the ETag also moves when a holdout or a
  // running experiment changes, even though the two caches are independent.
  const etag = `${flagEtag.slice(0, -1)}:${overlayFingerprint(overlay)}"`;
  c.header("ETag", etag);
  if (c.req.header("if-none-match") === etag) return c.body(null, 304);

  const results = data.flags.map((flag) =>
    applyHoldout(flag, evaluate(flag, parsed.context, data.segments), parsed.context, overlay),
  );
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

  // Dedup billing per (env, flag, unit, variant) within the session window, sharing the
  // SAME window as auto-expose so a customer who uses BOTH the auto path and this
  // endpoint isn't double-billed for one served evaluation (and in-batch repeats
  // collapse). Unit-less exposures have no dedup basis, so each is billed. Attribution
  // below still runs on ALL events — analytics is unaffected. The durable Idempotency-Key
  // remains the cross-restart retry safety net.
  const nowMs = Date.now();
  const billable = (events as ExposureEvent[]).reduce((n, e) => {
    const unit = typeof e.targetingKey === "string" ? e.targetingKey : "";
    const flagKey = typeof e.key === "string" ? e.key : "";
    const variant = typeof e.variant === "string" ? e.variant : "";
    // Dedup only when we have both a unit and a flag key to key on; otherwise bill
    // (over-bill is the safe direction, and unkeyable events are filtered upstream).
    return unit && flagKey &&
      !claimExposure(identity.environmentId, flagKey, unit, variant, nowMs)
      ? n
      : n + 1;
  }, 0);

  // Durable + idempotent: awaited in-band so a write failure becomes an error the
  // client retries safely. `Idempotency-Key` (if sent) is the batch's retry
  // identity; a repeat collapses to a no-op.
  const idempotencyKey = c.req.header("idempotency-key")?.trim() || undefined;
  const result =
    billable > 0
      ? await ingestEvents(identity.organizationId, billable, {
          source: "flags.exposure",
          idempotencyKey,
        })
      : { recorded: 0, duplicate: false };

  // Off the hot path: attribute exposures to any running experiments (additive
  // analytics — best-effort, idempotent per unit) and, for a genuinely new
  // receipt, fold it into the daily rollups and send any warn-first threshold
  // email. All of this is deferred and swallows its own errors so it can never
  // fail the metered response the client just earned. Billing already happened
  // in-band above; this is analysis only.
  const post: Promise<unknown>[] = [
    attributeExposures(
      identity.organizationId,
      identity.environmentId,
      events as ExposureEvent[],
    ),
  ];
  if (!result.duplicate) {
    post.push(
      compactUsageEvents(identity.organizationId),
      notifyUsageThresholds(identity.organizationId),
    );
  }
  await defer(c, Promise.all(post).catch(() => {}));

  return c.json({ recorded: result.recorded, duplicate: result.duplicate }, 202);
});

/**
 * Goal (metric) event ingest — the experiment analytics + revenue endpoint.
 *
 * Where an exposure records that a unit SAW an arm, a track event records that a
 * unit DID something (converted, purchased, engaged). Metrics measure the impact
 * of an experiment by joining these back to a unit's assigned arm. Same client-key
 * auth, rate limiter, and idempotent-batch durability as exposures.
 *
 * These events are BILLED: they meter through the same durable spine as exposures
 * under source "experiments.metric" (one "events" unit, one rate, one shared allowance).
 * The per-unit analysis rows (metric_events) are written off the hot path.
 *
 *   POST /ofrep/v1/track   body: { "events": [ { "metric": "checkout", "targetingKey": "u1", "value": 1 } ] }
 *   Header (optional):     Idempotency-Key: <stable per-batch id>
 */
ofrep.post("/v1/track", async (c) => {
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

  const raw = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(raw)) {
    return ofrepFail(c, 400, "INVALID_CONTEXT", "`events` must be an array of goal events.");
  }
  if (raw.length > MAX_EXPOSURES_PER_REQUEST) {
    return ofrepFail(
      c,
      400,
      "INVALID_CONTEXT",
      `Too many events in one request (max ${MAX_EXPOSURES_PER_REQUEST}); send them in smaller batches.`,
    );
  }

  // Normalize each event: name (`metric` or `event`) + unit (`targetingKey` or
  // `unit`) are required; `value` defaults to 1. Malformed entries are dropped so
  // one bad row never fails the batch, but we bill only what we accept.
  const parsed: MetricEventInput[] = [];
  for (const e of raw as Record<string, unknown>[]) {
    const name =
      typeof e.metric === "string" && e.metric
        ? e.metric
        : typeof e.event === "string" && e.event
          ? e.event
          : null;
    const targetingKey =
      typeof e.targetingKey === "string" && e.targetingKey
        ? e.targetingKey
        : typeof e.unit === "string" && e.unit
          ? e.unit
          : null;
    if (!name || !targetingKey) continue;
    parsed.push({
      name,
      targetingKey,
      value: typeof e.value === "number" ? e.value : 1,
      timestamp: typeof e.timestamp === "number" ? e.timestamp : undefined,
    });
  }

  if (parsed.length === 0) return c.json({ recorded: 0, duplicate: false }, 202);

  // Same hard-cap gate as exposures: a hard-capped plan past its allowance is
  // refused so the free tier can't run up unbounded cost (metric events share the
  // one "events" allowance with exposures).
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

  // BILLED in-band, exactly-once (source experiments.metric). We meter the ACCEPTED
  // count so the invoice matches what we stored.
  const idempotencyKey = c.req.header("idempotency-key")?.trim() || undefined;
  const result = await ingestEvents(identity.organizationId, parsed.length, {
    source: "experiments.metric",
    idempotencyKey,
  });

  // Off the hot path: persist the analysis detail and, for a new receipt, compact
  // + notify. Deferred and self-swallowing so analytics can never fail billing.
  // recordMetricEvents is idempotent on the SAME idempotencyKey (ON CONFLICT), so it
  // runs unconditionally — safe on a duplicate, and it self-heals a partially-failed
  // prior insert. (Billing already dedups; this keeps the stored rows exactly-once.)
  const post: Promise<unknown>[] = [
    recordMetricEvents(identity.organizationId, parsed, idempotencyKey),
  ];
  if (!result.duplicate) {
    post.push(
      compactUsageEvents(identity.organizationId),
      notifyUsageThresholds(identity.organizationId),
    );
  }
  await defer(c, Promise.all(post).catch(() => {}));

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
// flag key it relates to; to attribute an exposure to a running experiment, also
// send the served `variant` and the `targetingKey` (the unit). Flagon meters the
// count regardless; attribution is additive and privacy-preserving (the targeting
// key is stored only as a salted hash).
const exposuresRequestSchema = z.object({
  events: z
    .array(
      z
        .object({
          key: z.string().optional().describe("The flag key the exposure is for."),
          variant: z
            .string()
            .optional()
            .describe("The variant the SDK served — the experiment arm to attribute."),
          targetingKey: z
            .string()
            .optional()
            .describe("The unit identity (evaluation targetingKey); stored as a salted hash."),
        })
        .catchall(z.unknown()),
    )
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

// The goal-event ingest body: a batch of metric events. Each carries the metric
// (event) name and the unit (targetingKey), plus an optional numeric `value` for
// mean/sum metrics. The count is metered as a billable event (source experiments.metric).
const trackRequestSchema = z.object({
  events: z
    .array(
      z
        .object({
          metric: z
            .string()
            .optional()
            .describe("The metric/event name a metric definition matches on (alias: `event`)."),
          event: z.string().optional().describe("Alias for `metric`."),
          targetingKey: z
            .string()
            .optional()
            .describe("The unit identity, joined to the arm the unit was assigned (alias: `unit`)."),
          unit: z.string().optional().describe("Alias for `targetingKey`."),
          value: z
            .number()
            .optional()
            .describe("Numeric payload for mean/sum metrics; defaults to 1 for a conversion."),
          timestamp: z.number().optional().describe("Client event time (ms since epoch)."),
        })
        .catchall(z.unknown()),
    )
    .describe("A batch of goal events; each accepted event is a billable metric event."),
});
registerComponentSchema("TrackRequest", trackRequestSchema);
registerComponentSchema(
  "TrackResponse",
  z.object({
    recorded: z
      .number()
      .describe("Goal events durably metered by this request; 0 if it was a duplicate."),
    duplicate: z
      .boolean()
      .describe("True when this batch's Idempotency-Key was already seen; the request was a no-op."),
  }),
);

registerRoute({
  method: "post",
  path: "/ofrep/v1/track",
  summary: "Record goal events",
  description:
    "Record a batch of goal (metric) events for experiment analysis. Where an exposure records that a unit saw an arm, a goal event records that a unit did something (converted, purchased, engaged); metrics measure impact by joining these to the unit's assigned arm. Authenticated by the same client key as evaluation. Each accepted event is a billable event (metered under the Experiments line, at the same rate as exposures). Send an `Idempotency-Key` header so a network retry of the same batch is counted exactly once. Malformed entries (missing name or unit) are dropped, and only accepted events are metered.",
  tags: [OFREP_TAG],
  security: "sdkKey",
  headerParams: [
    {
      name: "Idempotency-Key",
      description:
        "A stable, unique id for this batch. A retry with the same key is counted once; omit it and each request is a distinct batch.",
    },
  ],
  request: { body: trackRequestSchema },
  responses: {
    202: { description: "The goal events were accepted for metering.", schemaName: "TrackResponse" },
    400: { description: "The request body could not be parsed, or `events` was invalid or too large." },
    401: { description: "A valid client key is required." },
    429: { description: "Too many requests; retry after the Retry-After delay." },
  },
});
