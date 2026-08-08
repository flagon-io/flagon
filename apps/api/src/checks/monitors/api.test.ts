import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiMonitor } from "./api.js";
import type { RunContext } from "./types.js";

/** API adapter against real local HTTP servers — assertion sources + timing. */
let jsonServer: Server;
let errServer: Server;
let slowServer: Server;
let jsonUrl: string;
let errUrl: string;
let slowUrl: string;

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`);
    });
  });
}
const ctx = (): RunContext => ({ orgId: "o", checkId: "c", now: new Date(), location: "default", signal: new AbortController().signal });

beforeAll(async () => {
  jsonServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", "x-flag": "on" });
    res.end(JSON.stringify({ ok: true, data: { id: 42 } }));
  });
  errServer = createServer((_req, res) => {
    res.writeHead(503);
    res.end("unavailable");
  });
  slowServer = createServer((_req, res) => setTimeout(() => (res.writeHead(200), res.end("ok")), 120));
  [jsonUrl, errUrl, slowUrl] = await Promise.all([listen(jsonServer), listen(errServer), listen(slowServer)]);
});
afterAll(async () => {
  await Promise.all([jsonServer, errServer, slowServer].map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe("api monitor", () => {
  it("passes the default status assertion on 2xx", async () => {
    const r = await apiMonitor.run(apiMonitor.configSchema.parse({ url: jsonUrl }), ctx());
    expect(r.status).toBe("passing");
    expect(r.httpStatus).toBe(200);
  });

  it("asserts on a JSON body path", async () => {
    const r = await apiMonitor.run(
      apiMonitor.configSchema.parse({ url: jsonUrl, assertions: [{ source: "jsonBody", property: "data.id", comparison: "equals", target: "42" }] }),
      ctx(),
    );
    expect(r.status).toBe("passing");
    expect(r.assertions?.[0]?.ok).toBe(true);
  });

  it("asserts on a header", async () => {
    const r = await apiMonitor.run(
      apiMonitor.configSchema.parse({ url: jsonUrl, assertions: [{ source: "header", property: "x-flag", comparison: "equals", target: "on" }] }),
      ctx(),
    );
    expect(r.status).toBe("passing");
  });

  it("fails when an assertion does not hold", async () => {
    const r = await apiMonitor.run(
      apiMonitor.configSchema.parse({ url: errUrl, assertions: [{ source: "status", comparison: "equals", target: "200" }] }),
      ctx(),
    );
    expect(r.status).toBe("failing");
    expect(r.error?.code).toBe("assertion_failed");
  });

  it("degrades when slower than the threshold", async () => {
    const r = await apiMonitor.run(apiMonitor.configSchema.parse({ url: slowUrl, degradedThresholdMs: 20 }), ctx());
    expect(r.status).toBe("degraded");
  });

  it("fails with a timeout", async () => {
    const r = await apiMonitor.run(apiMonitor.configSchema.parse({ url: slowUrl, timeoutMs: 10 }), ctx());
    expect(r.status).toBe("failing");
    expect(r.error?.code).toBe("timeout");
  });

  it("bills as a synthetic run under the api meter", () => {
    expect(apiMonitor.family).toBe("synthetic");
    expect(apiMonitor.billingSource).toBe("checks.api");
  });
});
