import { and, eq } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { experiments } from "../db/schema.js";

/**
 * Targeting is LOCKED while an experiment is running on a flag's environment.
 *
 * An experiment measures a fixed set of arms with a fixed split. Reallocating
 * traffic mid-run — changing the default/off arm, the split weights, a targeting
 * rule's serve, or disabling the flag — reshuffles deterministic buckets and
 * desyncs the variant a unit is now served from the arm it was enrolled in. That
 * shows up as a sample-ratio mismatch the stats engine then flags, and silently
 * corrupts the result. So the flag's environment targeting can't change until the
 * experiment stops. (Enrollment itself is still frozen per unit — this guards the
 * SERVED experience from drifting away from the analyzed arms.)
 */

/** The key of a RUNNING experiment on this (flag, environment), or null. */
export async function runningExperimentKey(
  tx: TenantTx,
  flagId: string,
  environmentId: string,
): Promise<string | null> {
  const [exp] = await tx
    .select({ key: experiments.key })
    .from(experiments)
    .where(
      and(
        eq(experiments.flagId, flagId),
        eq(experiments.environmentId, environmentId),
        eq(experiments.status, "running"),
      ),
    )
    .limit(1);
  return exp?.key ?? null;
}

/** The 409 message shown when a targeting write is blocked by a running experiment. */
export function experimentLockMessage(experimentKey: string, envKey: string): string {
  return `Experiment "${experimentKey}" is running on this flag in ${envKey}. Stop it before changing this environment's targeting — reallocating traffic mid-experiment invalidates the results.`;
}
