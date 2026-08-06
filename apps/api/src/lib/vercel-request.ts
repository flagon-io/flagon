import type { IncomingMessage } from "node:http";

/**
 * Body reading for the Vercel serverless entry (see ../../api/index.js).
 *
 * Vercel's Node runtime adds "helpers" to the request object, one of which is a
 * lazy `req.body` getter that PARSES the body by Content-Type — `application/json`
 * becomes a JavaScript object. Accessing it means the original bytes are gone:
 * re-serializing the object yields semantically equal but byte-different JSON.
 *
 * That is fatal for any request whose signature covers the raw body. Stripe signs
 * the exact payload bytes it sends (and pretty-prints its JSON), so a re-serialized
 * body fails `constructEvent` every single time — a silent, total webhook outage
 * that looks like a wrong signing secret.
 *
 * The fix is to turn the helpers off: set `NODEJS_HELPERS=0` on the API's Vercel
 * project (Settings > Environment Variables, every environment) and redeploy. `req`
 * is then a plain IncomingMessage whose stream we drain ourselves, byte for byte.
 *
 * Because that lives in project settings rather than in this repo, it can silently
 * come undone. So this module DETECTS the helpers and refuses signature-bearing
 * requests loudly rather than handing the app a body that cannot verify.
 */

/**
 * Headers whose value authenticates the exact bytes of the body. A request
 * carrying one of these cannot be served from a re-serialized body.
 */
const RAW_BODY_HEADERS = ["stripe-signature"] as const;

/** Thrown when the raw bytes a signature covers are no longer recoverable. */
export class RawBodyUnavailableError extends Error {
  constructor(header: string) {
    super(
      `Request carries "${header}", which signs the raw request body, but Vercel's ` +
        `Node helpers already parsed it — the original bytes are unrecoverable and ` +
        `signature verification would fail. Set NODEJS_HELPERS=0 on the API project ` +
        `(Vercel > Settings > Environment Variables, all environments) and redeploy.`,
    );
    this.name = "RawBodyUnavailableError";
  }
}

/**
 * Whether Vercel's Node helpers are active. They define `body` as an own getter on
 * the request; reading the DESCRIPTOR (not the value) detects them without invoking
 * the getter, which throws on malformed JSON.
 */
export function helpersEnabled(req: IncomingMessage): boolean {
  return Object.getOwnPropertyDescriptor(req, "body") !== undefined;
}

/**
 * The request body, materialized eagerly and unparsed.
 *
 * Eagerly, because @hono/node-server's Vercel adapter builds the body lazily from
 * the Node stream and hangs when the runtime has already consumed it. Unparsed,
 * because signatures cover bytes — see the module comment.
 */
export async function readRequestBody(
  req: IncomingMessage,
): Promise<Buffer | string | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  if (helpersEnabled(req)) {
    const signed = RAW_BODY_HEADERS.find((h) => req.headers[h] !== undefined);
    if (signed) throw new RawBodyUnavailableError(signed);

    // Nothing signs this body, so the parsed value is a faithful enough stand-in.
    const parsed = (req as IncomingMessage & { body?: unknown }).body;
    if (parsed !== undefined && parsed !== null && parsed !== "") {
      if (Buffer.isBuffer(parsed)) return parsed;
      if (typeof parsed === "string") return parsed;
      // Parsed JSON/object — re-serialize. The Content-Type header is preserved,
      // so the app reads it back correctly (our request bodies are all JSON).
      return JSON.stringify(parsed);
    }
    // Helpers leave `body` undefined when there is no Content-Type; fall through
    // and try the stream (already drained, so this yields nothing — but a future
    // runtime that leaves it readable then still works).
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}
