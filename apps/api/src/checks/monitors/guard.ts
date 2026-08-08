import { assertPublicHost, assertPublicUrl, BlockedTargetError } from "../net-guard.js";
import type { RunResult } from "./types.js";

/**
 * SSRF egress guards for monitor targets. Each returns a FAILING RunResult when the target
 * is a blocked (private/internal/metadata) address, or null to proceed. Adapters call these
 * before connecting, so a check can never be used to reach the cloud metadata endpoint or
 * scan internal hosts. Never throws (an unexpected guard error proceeds — fail open on the
 * guard, closed on the classifier).
 */
function blocked(err: unknown, started: number): RunResult | null {
  if (err instanceof BlockedTargetError) {
    return {
      status: "failing",
      latencyMs: Math.round(performance.now() - started),
      error: { code: "blocked_target", message: err.message },
    };
  }
  return null;
}

export async function guardUrl(url: string, started: number): Promise<RunResult | null> {
  try {
    await assertPublicUrl(url);
    return null;
  } catch (err) {
    return blocked(err, started);
  }
}

export async function guardHost(host: string, started: number): Promise<RunResult | null> {
  try {
    await assertPublicHost(host);
    return null;
  } catch (err) {
    return blocked(err, started);
  }
}
