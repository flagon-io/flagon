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
import {
  recordServerExposure,
  recordExposureSample,
} from "@/lib/flag-usage.server";
import { isExposureReason } from "@/lib/flag-metrics";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OFREP_HEADERS });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  // Client tokens are allowed here, exactly as on the bulk endpoint. Refusing
  // them would be security theatre: bulk already accepts an arbitrary context
  // from a publishable token and returns EVERY flag, so a single-flag lookup
  // discloses strictly less. The client/server split is about what a token can
  // MANAGE, not about which evaluation shape it may ask for.
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
  if (!validEvaluationContext(body?.context))
    return Response.json(
      {
        errorCode: "INVALID_CONTEXT",
        errorDetails: "A non-empty context.targetingKey is required.",
      },
      { status: 400, headers: OFREP_HEADERS },
    );
  const { key } = await params;
  const { flags: storedFlags, segments: storedSegments } = await loadFlagConfig(
    credential.orgId,
  );
  const flag = storedFlags.find((candidate) => candidate.key === key) ?? null;
  if (!flag)
    return Response.json(
      {
        key,
        errorCode: "FLAG_NOT_FOUND",
        errorDetails: `Flag '${key}' was not found.`,
      },
      { status: 404, headers: OFREP_HEADERS },
    );
  // Conditional request support, same shape as the bulk route. A decision is
  // a pure function of (this flag, the segments it can reference, the
  // context), so those three fully identify the representation: if none of
  // them moved, the caller's cached answer is still correct.
  //
  // This is the single highest-leverage cost lever on the serving path: a 304
  // skips serialization and carries no body, which roughly halves bandwidth
  // on a polling client. It also skips
  // METERING, and that is the honest accounting rather than a giveaway - a
  // revalidation served no new decision, so charging for one would bill for
  // work nobody did.
  const version = configurationVersion([flag], storedSegments);
  const etag = evaluationEtag(version, { key, context: body.context });
  if (etagMatches(request.headers.get("if-none-match"), etag)) {
    return new Response(null, {
      status: 304,
      headers: { ...OFREP_HEADERS, ETag: etag },
    });
  }
  const segments = storedSegments.map((segment) => ({
    key: segment.key,
    criteria: segment.criteria as never,
  }));
  const evaluated = evaluateFlag(
    asEvaluableFlag(flag),
    segments,
    body.context as EvaluationContext,
  );
  const overQuota = await meterEvaluations({
    request,
    orgId: credential.orgId,
    quantity: 1,
  });
  if (overQuota) return overQuota;

  // Server-side exposure: this endpoint knows exactly which flag was evaluated,
  // so it is a real per-flag data source before any client adopts the exposure
  // hook. Recorded only after the eval was accepted (a refused eval is not a
  // check) and never on the 304 above (a revalidation served no new decision).
  // Best-effort: a usage-recording failure must not fail the evaluation.
  //
  // Scheduled with after() rather than a bare `void`: these writes must not
  // block the response, but a fire-and-forget promise is not guaranteed to run
  // once the response is sent on a serverless platform. after() extends the
  // invocation via waitUntil so the exposure records actually land.
  if (isExposureReason(evaluated.reason)) {
    const reason = evaluated.reason;
    const targetingKey = (body.context as EvaluationContext).targetingKey;
    after(() =>
      recordServerExposure({
        orgId: credential.orgId,
        flagKey: evaluated.key,
        variantKey: evaluated.variant,
        reason,
      }).catch(() => {}),
    );
    // A sampled, hashed raw exposure for the detail page's recent-checks stream.
    if (typeof targetingKey === "string" && targetingKey) {
      after(() =>
        recordExposureSample({
          orgId: credential.orgId,
          flagKey: evaluated.key,
          variantKey: evaluated.variant,
          reason,
          targetingKey,
        }).catch(() => {}),
      );
    }
  }

  // no-store would forbid the client from keeping the copy it needs to
  // revalidate against, defeating the ETag entirely.
  return Response.json(evaluated, {
    headers: { ...OFREP_HEADERS, ETag: etag },
  });
}
