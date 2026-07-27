import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

/**
 * Every response this API returns is JSON — success and failure alike. These
 * helpers keep the error shape consistent so a client can always parse a
 * failure the same way it parses a success (this may broaden later, e.g. gRPC,
 * but the JSON contract is the baseline).
 *
 * The error envelope:
 *   { "message": string, "status": number }
 * and for a failed-validation response, additionally:
 *   { "errors": { "<field>": string[] } }
 *
 * One human-readable `message`, the numeric `status`, and — only when a body
 * failed validation — a per-field `errors` map.
 */

/**
 * The externally-visible origin of this request, honoring proxy headers so the
 * generated URLs are correct behind a proxy rather than the internal address.
 */
export function baseUrl(c: Context): string {
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? url.host;
  return `${proto}://${host}`;
}

export function jsonError(
  c: Context,
  status: ContentfulStatusCode,
  message: string,
  extra?: Record<string, unknown>,
) {
  return c.json({ message, status, ...extra }, status);
}

/** Turn a zod failure into the per-field `errors` envelope. */
export function validationError(c: Context, error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    (errors[key] ??= []).push(issue.message);
  }
  return jsonError(c, 422, "The given data was invalid.", { errors });
}
