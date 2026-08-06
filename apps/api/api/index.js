import app from "../dist/index.js";
import {
  RawBodyUnavailableError,
  readRequestBody,
} from "../dist/lib/vercel-request.js";

/**
 * Serverless function entry (Vercel Node runtime).
 *
 * We deliberately do NOT use @hono/node-server/vercel's `handle()`. That adapter
 * builds the request body LAZILY from the Node stream (Readable.toWeb(incoming)),
 * which hangs on Vercel: the runtime buffers/consumes the request body before our
 * handler runs, so the adapter's stream never emits and any POST that reads its
 * body (auth sign-in, waitlist, a real OFREP evaluate) awaits `request.json()`
 * forever — the request just sits at "waiting for response".
 *
 * Instead we read the body EAGERLY here, construct a real Web Request with that
 * fully-materialized body, run `app.fetch`, and write the Response back —
 * preserving multiple Set-Cookie headers, which auth depends on. Reading the body
 * without destroying its exact bytes is subtle enough to live in its own module:
 * see ../src/lib/vercel-request.ts (and the NODEJS_HELPERS=0 requirement it
 * documents). The compiled app is imported from ../dist (build output).
 */

function toHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(nodeHeaders)) {
    if (Array.isArray(v)) v.forEach((val) => headers.append(k, val));
    else if (v != null) headers.set(k, String(v));
  }
  return headers;
}

export default async function handler(req, res) {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    const url = `${proto}://${host}${req.url}`;

    const request = new Request(url, {
      method: req.method,
      headers: toHeaders(req.headers),
      body: await readRequestBody(req),
    });

    const response = await app.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "set-cookie") return; // set below (may be many)
      if (lower === "content-length") return; // Node sets it from the buffer
      res.setHeader(key, value);
    });
    const cookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    if (cookies.length) res.setHeader("set-cookie", cookies);

    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    // A misconfigured runtime is not a generic 500 — say exactly what is wrong and
    // how to fix it, because the alternative (a silently unverifiable body) cost us
    // four days of dropped Stripe webhooks. 5xx so the sender retries after the fix.
    const misconfigured = err instanceof RawBodyUnavailableError;
    console.error("[vercel-entry] error:", err);
    if (!res.headersSent) {
      res.statusCode = misconfigured ? 503 : 500;
      res.setHeader("content-type", "application/json");
    }
    res.end(
      JSON.stringify(
        misconfigured
          ? { message: "Server Misconfigured", status: 503 }
          : { message: "Server Error", status: 500 },
      ),
    );
  }
}
