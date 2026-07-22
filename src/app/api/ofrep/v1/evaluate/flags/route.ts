import { after } from "next/server";
import { evaluateFlag, type EvaluationContext } from "@/lib/flags";
import { asEvaluableFlag } from "@/lib/flags.server";
import { loadFlagConfig } from "@/lib/flag-config-cache.server";
import { authenticateOfrep } from "@/lib/ofrep-auth.server";
import {
  configurationVersion,
  etagMatches,
  evaluationEtag,
  OFREP_HEADERS,
  readOfrepJson,
  validEvaluationContext,
} from "@/lib/ofrep.server";
import { meterEvaluations } from "@/lib/ofrep-usage.server";
import { recordServed } from "@/lib/flag-usage.server";
import { isExposureReason, type ExposureReason } from "@/lib/flag-metrics";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OFREP_HEADERS });
}

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
  const parsed = await readOfrepJson(request);
  if (!parsed.ok)
    return Response.json(
      {
        errorCode: "INVALID_CONTEXT",
        errorDetails: parsed.tooLarge
          ? "The evaluation request is too large."
          : "The evaluation request must be valid JSON.",
      },
      { status: parsed.tooLarge ? 413 : 400, headers: OFREP_HEADERS },
    );
  const body = parsed.value as { context?: unknown };
  if (!validEvaluationContext(body?.context)) {
    return Response.json(
      {
        errorCode: "INVALID_CONTEXT",
        errorDetails: "A non-empty context.targetingKey is required.",
      },
      { status: 400, headers: OFREP_HEADERS },
    );
  }
  const { flags: storedFlags, segments: storedSegments } = await loadFlagConfig(
    credential.orgId,
  );
  const version = configurationVersion(storedFlags, storedSegments);
  const etag = evaluationEtag(version, body.context);
  if (etagMatches(request.headers.get("if-none-match"), etag))
    return new Response(null, {
      status: 304,
      headers: { ...OFREP_HEADERS, ETag: etag },
    });
  const segments = storedSegments.map((segment) => ({
    key: segment.key,
    criteria: segment.criteria as never,
  }));
  const flags = storedFlags.map((flag) =>
    evaluateFlag(
      asEvaluableFlag(flag),
      segments,
      body.context as EvaluationContext,
    ),
  );
  // Metered BEFORE the response is served: a hard-capped org that is over its
  // allowance gets 429 rather than a free evaluation.
  // sync: this endpoint returns the whole configuration, which is what SDKs
  // poll for, so a 200 here is the bandwidth the guardrail meters. The 304
  // above returns before this and costs nothing.
  const overQuota = await meterEvaluations({
    request,
    orgId: credential.orgId,
    quantity: flags.length,
    sync: true,
  });
  if (overQuota) return overQuota;

  // Attribute the billed bulk evaluation per flag (source 'served'), so the
  // per-flag view reconciles with the invoice: this records exactly the
  // `flags.length` evaluations just metered, one per flag. Best-effort - a
  // recording hiccup must not fail the evaluation. Runs only on a served 200;
  // the 304 above returns before any of this and is neither billed nor counted.
  //
  // Scheduled with after() rather than a bare `void`: this write must not block
  // the response, but a fire-and-forget promise is not guaranteed to run once
  // the response is sent on a serverless platform (the invocation can freeze).
  // after() extends the invocation via waitUntil so the attribution actually
  // lands, on both serverless and the self-hosted Node server.
  after(() =>
    recordServed({
      orgId: credential.orgId,
      evaluations: flags
        .filter((flag) => isExposureReason(flag.reason))
        .map((flag) => ({
          flagKey: flag.key,
          variantKey: flag.variant,
          reason: flag.reason as ExposureReason,
        })),
    }).catch(() => {}),
  );

  return Response.json(
    {
      flags,
      metadata: { version },
    },
    { headers: { ...OFREP_HEADERS, ETag: etag } },
  );
}
