import type { CheckResult } from "../db/schema.js";

/**
 * The wire shape of a recorded run. Shared by the checks route (list/run responses) and the
 * dedicated browser function (which returns the result it recorded so a synchronous
 * "Run now" can relay it) — one definition so both stay in lockstep.
 */
export function serializeResult(row: CheckResult) {
  return {
    id: row.id,
    runStartedAt: row.runStartedAt.toISOString(),
    status: row.status,
    latencyMs: row.latencyMs,
    httpStatus: row.httpStatus,
    location: row.location,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    assertions: row.assertions,
    detail: row.detail,
  };
}

export type SerializedResult = ReturnType<typeof serializeResult>;
