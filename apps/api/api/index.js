import app from "../dist/index.js";

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
 * Instead we read the body EAGERLY here (Vercel's parsed `req.body` when present,
 * else the raw stream), construct a real Web Request with that fully-materialized
 * body, run `app.fetch`, and write the Response back — preserving multiple
 * Set-Cookie headers, which auth depends on. GET/HEAD carry no body and are
 * unaffected. The compiled app is imported from ../dist (build output).
 */

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  // Vercel usually parses the body onto req.body (consuming the stream). Use it.
  const parsed = req.body;
  if (parsed !== undefined && parsed !== null && parsed !== "") {
    if (Buffer.isBuffer(parsed)) return parsed;
    if (typeof parsed === "string") return parsed;
    // Parsed JSON/object — re-serialize. The Content-Type header is preserved,
    // so the app reads it back correctly (our request bodies are all JSON).
    return JSON.stringify(parsed);
  }

  // Otherwise drain the raw stream ourselves (fully, before app.fetch).
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

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
      body: await readBody(req),
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
    console.error("[vercel-entry] error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
    }
    res.end(JSON.stringify({ message: "Server Error", status: 500 }));
  }
}
