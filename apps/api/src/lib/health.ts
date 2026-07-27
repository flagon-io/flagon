import { META } from "../meta.js";

/**
 * The liveness payload, shared by the top-level /healthz and every versioned
 * /v{n}/healthz so they can never drift.
 *
 * The top-level probe calls this with no argument and is deliberately
 * unversioned: load balancers and uptime checks get one stable URL that keeps
 * meaning "is the service up" even after /v2 ships. A versioned probe passes
 * its API version (e.g. `{ version: "v1" }`), which is part of that version's
 * documented response contract.
 */
export function healthBody(extra?: { version?: string }) {
  return {
    status: "ok" as const,
    service: META.service,
    ...extra,
    time: new Date().toISOString(),
  };
}
