import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { urlMonitor } from "./url.js";
import { apiMonitor } from "./api.js";
import type { RunContext } from "./types.js";

/**
 * The URL adapter, exercised against real local HTTP servers (no network, no mocks):
 * passing, degraded (slow), failing (bad status), and timeout mapping.
 */

let okServer: Server;
let slowServer: Server;
let errServer: Server;
let okUrl: string;
let slowUrl: string;
let errUrl: string;

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

const ctx = (): RunContext => ({
  orgId: "org",
  checkId: "chk",
  now: new Date(),
  location: "default",
  signal: new AbortController().signal,
});

beforeAll(async () => {
  okServer = createServer((_req, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  slowServer = createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(200);
      res.end("slow");
    }, 120);
  });
  errServer = createServer((_req, res) => {
    res.writeHead(500);
    res.end("boom");
  });
  [okUrl, slowUrl, errUrl] = await Promise.all([listen(okServer), listen(slowServer), listen(errServer)]);
});

afterAll(async () => {
  await Promise.all(
    [okServer, slowServer, errServer].map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
});

describe("url monitor", () => {
  it("passes on a 2xx within the degraded threshold", async () => {
    const result = await urlMonitor.run(
      urlMonitor.configSchema.parse({ url: okUrl }),
      ctx(),
    );
    expect(result.status).toBe("passing");
    expect(result.httpStatus).toBe(200);
    expect(result.assertions?.[0]?.ok).toBe(true);
  });

  it("degrades when slower than the degraded threshold", async () => {
    const result = await urlMonitor.run(
      urlMonitor.configSchema.parse({ url: slowUrl, degradedThresholdMs: 20 }),
      ctx(),
    );
    expect(result.status).toBe("degraded");
    expect(result.latencyMs).toBeGreaterThan(20);
  });

  it("fails the default assertion on an error status", async () => {
    const result = await urlMonitor.run(
      urlMonitor.configSchema.parse({ url: errUrl }),
      ctx(),
    );
    expect(result.status).toBe("failing");
    expect(result.httpStatus).toBe(500);
    expect(result.error?.code).toBe("assertion_failed");
  });

  it("honors an explicit status assertion", async () => {
    const result = await urlMonitor.run(
      urlMonitor.configSchema.parse({
        url: errUrl,
        assertions: [{ source: "status", comparison: "equals", target: "500" }],
      }),
      ctx(),
    );
    expect(result.status).toBe("passing");
    expect(result.assertions?.[0]?.ok).toBe(true);
  });

  it("fails with a timeout when the endpoint is too slow", async () => {
    const result = await urlMonitor.run(
      urlMonitor.configSchema.parse({ url: slowUrl, timeoutMs: 10 }),
      ctx(),
    );
    expect(result.status).toBe("failing");
    expect(result.error?.code).toBe("timeout");
  });
});

describe("monitor billing model (Checkly-faithful)", () => {
  it("uptime monitors are NOT run-metered; synthetic checks are", () => {
    // The runner meters a run only when the type declares a billingSource. Uptime
    // monitors omit it (billed by monitor count); synthetic checks carry one.
    expect(urlMonitor.family).toBe("uptime");
    expect(urlMonitor.billingSource).toBeFalsy();
    expect(apiMonitor.family).toBe("synthetic");
    expect(apiMonitor.billingSource).toBe("checks.api");
  });
});
