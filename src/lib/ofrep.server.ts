import { createHash } from "node:crypto";

type VersionedResource = { id: string; updatedAt: Date };

function digest(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

/** Stable JSON is required because context property order is not semantic. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Changes whenever any flag or segment definition in the organization changes. */
export function configurationVersion(flags: VersionedResource[], segments: VersionedResource[]) {
  const entries = [
    ...flags.map((item) => `flag:${item.id}:${item.updatedAt.getTime()}`),
    ...segments.map((item) => `segment:${item.id}:${item.updatedAt.getTime()}`),
  ].sort();
  return digest(entries.join("|"));
}

/** HTTP validators identify an evaluated representation, so context is included. */
export function evaluationEtag(version: string, context: unknown) {
  return `"${digest(`${version}:${stableJson(context)}`)}"`;
}

export function etagMatches(header: string | null, current: string) {
  if (!header) return false;
  const normalize = (value: string) => value.trim().replace(/^W\//, "");
  return header.split(",").some((candidate) => candidate.trim() === "*" || normalize(candidate) === normalize(current));
}

export function validEvaluationContext(value: unknown): value is Record<string, unknown> & { targetingKey: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const targetingKey = (value as Record<string, unknown>).targetingKey;
  return typeof targetingKey === "string" && targetingKey.trim().length > 0 && targetingKey.length <= 1024;
}

export const OFREP_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  // The event-id headers are allow-listed so BROWSER clients can dedupe their
  // own retries too; without this, CORS would silently strip them and only
  // server-side callers would get idempotent ingest.
  "Access-Control-Allow-Headers": "Authorization, Content-Type, If-None-Match, X-Flagon-Organization, X-Flagon-Event-Id, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "ETag",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "private, no-cache, must-revalidate",
  "Vary": "Authorization",
} as const;

export const OFREP_MAX_BODY_BYTES = 64 * 1024;

export async function readOfrepJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; tooLarge: boolean }> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > OFREP_MAX_BODY_BYTES) return { ok: false, tooLarge: true };
  if (!request.body) return { ok: false, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > OFREP_MAX_BODY_BYTES) {
      await reader.cancel();
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) }; }
  catch { return { ok: false, tooLarge: false }; }
}
