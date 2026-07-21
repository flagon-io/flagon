import { OFREP_HEADERS } from "./ofrep.server";
import { EVALUATION_METER, SYNC_METER } from "./quota";
import { eventKeyFrom, recordUsageEvent } from "./usage-events.server";

/**
 * The sync guardrail's refusal. Separate from the evaluation cap because it
 * means something different: the customer has not run out of decisions, they
 * have run out of full configuration downloads, and the fix is to send
 * If-None-Match rather than to evaluate less.
 */
function syncRefused(allowance: number): Response {
  return Response.json(
    {
      errorCode: "GENERAL",
      errorDetails: `This organization has used its monthly configuration sync allowance (${allowance.toLocaleString("en-US")} syncs). Send If-None-Match so unchanged configuration returns 304 without counting, or upgrade to Pro.`,
    },
    {
      status: 429,
      headers: {
        ...OFREP_HEADERS,
        "X-Flagon-Syncs-Limit": String(allowance),
      },
    },
  );
}

/**
 * Metering for the OFREP evaluation endpoints.
 *
 * Kept out of the routes so both the bulk and single-flag paths meter
 * identically - a cap that only one of them enforced would be no cap at all.
 */

/**
 * Meters an evaluation response and enforces the plan's hard cap.
 *
 * Returns a Response to send INSTEAD of the evaluation when the org is over
 * its allowance, or null to proceed. Replays return null: the caller already
 * paid for this event id, so re-serving it is free and correct.
 */
export async function meterEvaluations(input: {
  request: Request;
  orgId: string;
  quantity: number;
  projectId?: string | null;
  /**
   * Whether this response also carried a full configuration payload, and so
   * counts as a sync. True for the bulk endpoint, which is what SDKs poll;
   * false for a single-flag lookup, which is not a config download. A 304
   * never reaches here at all, which is the entire point of the ETag.
   */
  sync?: boolean;
}): Promise<Response | null> {
  // An org with no flags configured evaluates nothing; there is no event to
  // record and nothing to charge for.
  if (input.quantity <= 0) return null;

  const eventKey = eventKeyFrom(input.request);
  const outcome = await recordUsageEvent({
    orgId: input.orgId,
    meter: EVALUATION_METER,
    quantity: input.quantity,
    eventKey,
    projectId: input.projectId ?? null,
  });

  if (outcome.status === "recorded" && input.sync) {
    // Same event key, different meter: the receipt is scoped per meter, so
    // one request records at most one evaluation event and one sync event,
    // and a retry of it deduplicates against both.
    //
    // Only after the evaluation was accepted, and its own rejection is
    // swallowed: refusing to serve a config the customer is already within
    // their evaluation budget for would be a confusing second cap on one
    // request. The sync ceiling bites through its own 429 below instead.
    const sync = await recordUsageEvent({
      orgId: input.orgId,
      meter: SYNC_METER,
      quantity: 1,
      eventKey,
      projectId: input.projectId ?? null,
    });
    if (sync.status === "quota_exceeded") return syncRefused(sync.allowance);
  }

  if (outcome.status !== "quota_exceeded") return null;

  /**
   * 429, not 402. The cap is a rate/volume ceiling on a plan, and OFREP
   * clients already understand 429 as "back off" - they will keep serving
   * their last good configuration from cache rather than failing open into
   * default values, which is the behaviour we want when a Hobby org runs out.
   *
   * errorCode stays inside the OpenFeature vocabulary ("GENERAL") so
   * spec-compliant SDKs map it cleanly; the detail carries the specifics.
   */
  return Response.json(
    {
      errorCode: "GENERAL",
      errorDetails: `This organization has used its monthly evaluation allowance (${outcome.allowance.toLocaleString("en-US")} evaluations). Upgrade to Pro for usage-based evaluations with no hard cap.`,
    },
    {
      status: 429,
      headers: {
        ...OFREP_HEADERS,
        "X-Flagon-Evaluations-Limit": String(outcome.allowance),
        "X-Flagon-Evaluations-Used": String(outcome.used),
      },
    },
  );
}
