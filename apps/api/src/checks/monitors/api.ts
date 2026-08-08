import { z } from "zod";
import type { MonitorType, RunResult } from "./types.js";
import { thresholdMs } from "./types.js";
import { guardUrl } from "./guard.js";
import { DEFAULT_HTTP_ASSERTIONS, assertionSchema, evaluateAssertions, needsBody } from "./assertions.js";

/**
 * API check — a single HTTP request with request setup + response ASSERTIONS (Checkly's
 * API check). Richer than the URL monitor: send headers and a body, and assert on the
 * status code, response time, headers, the raw body, or a JSONPath into it — via the
 * shared assertion engine. SYNTHETIC family, so it bills per RUN under its own meter
 * (cheaper than a browser run, mirroring Checkly's API-run pricing).
 */
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

const apiConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(HTTP_METHODS).default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  followRedirects: z.boolean().default(true),
  assertions: z.array(assertionSchema).default(DEFAULT_HTTP_ASSERTIONS),
  degradedThresholdMs: thresholdMs.default(5000),
  timeoutMs: thresholdMs.default(10_000),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;

export const apiMonitor: MonitorType<ApiConfig> = {
  key: "api",
  label: "API check",
  summary: "Check speed and validity of API endpoints.",
  family: "synthetic",
  runner: "inline",
  supportsDegraded: true,
  billingSource: "checks.api",
  configSchema: apiConfigSchema,
  defaults: { timeoutMs: 10_000, degradedThresholdMs: 5000 },

  async run(config, ctx) {
    const timeout = config.timeoutMs ?? this.defaults.timeoutMs;
    const degradedAfter = config.degradedThresholdMs ?? this.defaults.degradedThresholdMs ?? 5000;
    const assertions = config.assertions ?? DEFAULT_HTTP_ASSERTIONS;
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(timeout)]);

    const started = performance.now();
    const blocked = await guardUrl(config.url, started);
    if (blocked) return blocked;

    let res: Response;
    try {
      res = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.method === "GET" || config.method === "HEAD" ? undefined : config.body,
        redirect: config.followRedirects ? "follow" : "manual",
        signal,
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      return {
        status: "failing",
        latencyMs: Math.round(performance.now() - started),
        error: {
          code: timedOut ? "timeout" : "network_error",
          message: timedOut ? `No response within ${timeout}ms.` : err instanceof Error ? err.message : "The request failed.",
        },
      } satisfies RunResult;
    }

    const bodyText = needsBody(assertions) ? await res.text().catch(() => "") : ((await res.arrayBuffer().catch(() => undefined)), "");
    const latencyMs = Math.round(performance.now() - started);

    const results = evaluateAssertions(assertions, {
      status: res.status,
      responseTimeMs: latencyMs,
      bodyText,
      header: (n) => res.headers.get(n),
    });
    const failed = results.find((a) => !a.ok);
    if (failed) {
      return {
        status: "failing",
        latencyMs,
        httpStatus: res.status,
        assertions: results,
        error: { code: "assertion_failed", message: `Assertion on ${failed.source} failed.` },
      };
    }

    return {
      status: latencyMs > degradedAfter ? "degraded" : "passing",
      latencyMs,
      httpStatus: res.status,
      assertions: results,
    };
  },
};
