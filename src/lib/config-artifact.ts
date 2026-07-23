import { createHash } from "node:crypto";
import type { FlagConfig } from "@/lib/flag-config-cache.server";
import { configurationVersion } from "@/lib/ofrep.server";

/**
 * The on-disk/in-bucket shape of a published evaluation artifact. It is
 * self-describing and integrity-checked so a corrupt, truncated, or torn object
 * is detectable on read rather than served as if it were valid:
 *
 *   - `version`  changes whenever any flag or segment changes (configurationVersion)
 *   - `checksum` is SHA-256 of `payloadJson`, verified on every read
 *   - `payloadJson` is the exact serialized payload the checksum covers, so
 *     verification is byte-exact and immune to key-order drift
 *
 * Bumping SCHEMA is a breaking change to the envelope; a reader that sees an
 * unknown schema treats the artifact as unreadable and falls back to the
 * database, which is always safe.
 */
export const ARTIFACT_SCHEMA = 1;

export type ConfigArtifact = {
  /** The serialized artifact bytes to store. */
  body: string;
  /** Content version (matches organizations.config_version once published). */
  version: string;
  /** SHA-256 of the payload (matches organizations.config_checksum). */
  checksum: string;
};

/** Thrown when an artifact cannot be trusted: bad schema, shape, or checksum. */
export class ArtifactError extends Error {}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Build the versioned, checksummed artifact bytes for an org's config. */
export function buildArtifact(
  orgId: string,
  config: FlagConfig,
  publishedAt: Date = new Date(),
): ConfigArtifact {
  const payloadJson = JSON.stringify(config);
  const checksum = sha256(payloadJson);
  const version = configurationVersion(config.flags, config.segments);
  const body = JSON.stringify({
    schema: ARTIFACT_SCHEMA,
    orgId,
    version,
    checksum,
    publishedAt: publishedAt.toISOString(),
    payloadJson,
  });
  return { body, version, checksum };
}

function reviveRow<T extends { createdAt: Date; updatedAt: Date }>(row: T): T {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/**
 * Parse and verify an artifact. Throws {@link ArtifactError} if the envelope is
 * malformed, an unknown schema, or the checksum does not match the payload -
 * every one of which the caller treats as a store miss and repairs from the
 * database. `updatedAt`/`createdAt` are revived to Date (configurationVersion
 * and evaluation depend on real Dates, not strings).
 */
export function parseArtifact(body: string): {
  config: FlagConfig;
  version: string;
  checksum: string;
} {
  let envelope: {
    schema?: unknown;
    version?: unknown;
    checksum?: unknown;
    payloadJson?: unknown;
  };
  try {
    envelope = JSON.parse(body);
  } catch {
    throw new ArtifactError("artifact is not valid JSON");
  }
  if (envelope.schema !== ARTIFACT_SCHEMA)
    throw new ArtifactError(`unsupported artifact schema: ${envelope.schema}`);
  if (
    typeof envelope.payloadJson !== "string" ||
    typeof envelope.checksum !== "string" ||
    typeof envelope.version !== "string"
  )
    throw new ArtifactError("artifact envelope is missing required fields");
  if (sha256(envelope.payloadJson) !== envelope.checksum)
    throw new ArtifactError("artifact checksum mismatch");

  let parsed: FlagConfig;
  try {
    parsed = JSON.parse(envelope.payloadJson) as FlagConfig;
  } catch {
    throw new ArtifactError("artifact payload is not valid JSON");
  }
  return {
    config: {
      flags: parsed.flags.map(reviveRow),
      segments: parsed.segments.map(reviveRow),
    },
    version: envelope.version,
    checksum: envelope.checksum,
  };
}
