import { createHash } from "node:crypto";

/**
 * Deterministic bucketing for percentage rollouts.
 *
 * Maps a seed string uniformly into [0, 1). The same seed always lands in the
 * same place, so a given user stays in the same rollout slice across
 * evaluations (sticky), while different flags shuffle independently because the
 * flag key is part of the seed. sha1 is used as a fast, well-distributed hash;
 * this is not a security boundary, just a spreader.
 */
export function bucket(seed: string): number {
  const digest = createHash("sha1").update(seed).digest();
  // Top 4 bytes as an unsigned 32-bit int, divided by 2^32 -> [0, 1).
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

/** The seed for a rollout: flag key + the bucketing identity, namespaced. */
export function rolloutSeed(flagKey: string, bucketByValue: unknown): string {
  return `${flagKey}:${bucketByValue == null ? "" : String(bucketByValue)}`;
}
