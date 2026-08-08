// The DEDICATED browser-check function (Vercel Node runtime), kept OUT of the main
// API function so ~50MB of headless Chromium never bloats the hot path. The sweep
// (src/checks/sweep.ts) dispatches browser checks here by POST; this function runs
// the Playwright probe and records the result via the shared runner.
//
// The two static imports below exist ONLY to force the bundler's file tracer to
// include Chromium + Playwright in THIS function's deployment (the adapter loads
// them via a runtime-assembled specifier, which the tracer can't follow — that is
// deliberate, so the MAIN function stays small). `maxDuration`/`memory` are set for
// this path in vercel.json.
import "@sparticuz/chromium";
import "playwright-core";
import { runCheckById } from "../dist/checks/execute.js";

function unauthorized(res) {
  res.statusCode = 401;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "unauthorized" }));
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers["authorization"] !== `Bearer ${secret}`) {
    return unauthorized(res);
  }

  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    body = {};
  }
  const { orgId, checkId } = body;
  if (!orgId || !checkId) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "orgId and checkId are required" }));
    return;
  }

  try {
    const recorded = await runCheckById(orgId, checkId);
    res.statusCode = recorded ? 200 : 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: Boolean(recorded) }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  }
}
