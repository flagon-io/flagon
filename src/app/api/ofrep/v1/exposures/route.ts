import { authenticateOfrep } from "@/lib/ofrep-auth.server";
import { OFREP_HEADERS, readOfrepJson } from "@/lib/ofrep.server";
import { rateLimit } from "@/lib/rate-limit.server";
import {
  normalizeEntry,
  recordExposureBatch,
  type ExposureEntry,
} from "@/lib/flag-usage.server";

/**
 * POST /api/ofrep/v1/exposures - client-reported flag usage.
 *
 * The bulk evaluation endpoint computes every flag on every poll, so the server
 * cannot tell which flags an app actually reads. This is where the app tells us:
 * an OpenFeature `after` hook batches the flags it evaluated, PRE-AGGREGATES them
 * by (flag, variant, reason, hour), and posts them here. That pre-aggregation is
 * the whole economics - one batch carries few rows no matter how many checks it
 * represents.
 *
 * Authenticated with the same client evaluation credential the app already
 * holds. Idempotent by `batch_id`: a redelivered batch is dropped whole.
 *
 * An infrastructure ingest endpoint, like metering - not part of the versioned
 * REST resource contract, and documented in the exposure-logging guide rather
 * than as a CRUD resource.
 *
 * PRIVACY: this accepts counts by outcome, never a targeting identity. Any
 * `targeting_key` a client mistakenly includes is ignored here.
 */

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OFREP_HEADERS });
}

/** A generous ceiling: a well-behaved client sends far fewer per batch. */
const MAX_ENTRIES = 10_000;

/**
 * Per-ORG request ceiling. A client flushing every 30s sends ~2 batches a
 * minute, so this covers a large fleet per organization while still stopping a
 * client that has come loose and is posting in a tight loop. Keyed per org, so
 * one noisy tenant can never affect another.
 */
const RATE_LIMIT = 300;
const RATE_WINDOW_SECONDS = 60;

export async function POST(request: Request) {
  const credential = await authenticateOfrep(request, true);
  if (!credential)
    return Response.json(
      {
        errorCode: "UNAUTHORIZED",
        errorDetails: "A valid evaluation credential is required.",
      },
      { status: 401, headers: OFREP_HEADERS },
    );

  // Best-effort rate limit: a limiter failure allows the request rather than
  // failing the ingest closed. Keyed per org.
  let limit;
  try {
    limit = await rateLimit({
      key: `exposures:${credential.orgId}`,
      limit: RATE_LIMIT,
      windowSeconds: RATE_WINDOW_SECONDS,
    });
  } catch {
    limit = null;
  }
  if (limit && !limit.ok)
    return Response.json(
      {
        errorCode: "GENERAL",
        errorDetails: "Too many exposure batches. Slow down and retry.",
      },
      {
        status: 429,
        headers: {
          ...OFREP_HEADERS,
          "Retry-After": String(limit.retryAfterSeconds),
        },
      },
    );

  const parsed = await readOfrepJson(request);
  if (!parsed.ok)
    return Response.json(
      {
        errorCode: "INVALID_CONTEXT",
        errorDetails: parsed.tooLarge
          ? "The exposure batch is too large."
          : "The exposure batch must be valid JSON.",
      },
      { status: parsed.tooLarge ? 413 : 400, headers: OFREP_HEADERS },
    );

  const body = parsed.value as { batch_id?: unknown; entries?: unknown };
  const batchId = typeof body?.batch_id === "string" ? body.batch_id : null;
  // Bounded: the batch id is stored as an idempotency receipt, so an unbounded
  // string is a write-amplification lever on a client-controlled body.
  if (!batchId || batchId.length < 1 || batchId.length > 200)
    return Response.json(
      {
        errorCode: "INVALID_CONTEXT",
        errorDetails: "A batch_id of 1-200 characters is required.",
      },
      { status: 400, headers: OFREP_HEADERS },
    );

  const rawEntries = Array.isArray(body.entries) ? body.entries : null;
  if (!rawEntries)
    return Response.json(
      {
        errorCode: "INVALID_CONTEXT",
        errorDetails: "entries must be an array.",
      },
      { status: 400, headers: OFREP_HEADERS },
    );
  if (rawEntries.length > MAX_ENTRIES)
    return Response.json(
      {
        errorCode: "INVALID_CONTEXT",
        errorDetails: `A batch may carry at most ${MAX_ENTRIES} entries.`,
      },
      { status: 413, headers: OFREP_HEADERS },
    );

  // Drop unusable rows rather than reject the batch: one malformed entry from a
  // buggy client should not cost the caller every good check in the same batch.
  const entries: ExposureEntry[] = [];
  for (const raw of rawEntries) {
    const entry = normalizeEntry(raw);
    if (entry) entries.push(entry);
  }

  const outcome = await recordExposureBatch({
    orgId: credential.orgId,
    batchId,
    entries,
  });

  return Response.json(
    {
      status: outcome.status,
      recorded: outcome.status === "recorded" ? outcome.entries : 0,
      // Told, not hidden: a client that sent junk should be able to see that
      // fewer entries were accepted than it sent.
      received: rawEntries.length,
    },
    { headers: OFREP_HEADERS },
  );
}
