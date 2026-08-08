import { z } from "zod";
import type { MonitorType, RunResult } from "./types.js";
import { thresholdMs } from "./types.js";
import { guardUrl } from "./guard.js";
import { DEFAULT_HTTP_ASSERTIONS, assertionSchema, evaluateAssertions, needsBody } from "./assertions.js";

/**
 * URL uptime monitor — the lightweight HTTP(S) availability probe (Checkly's URL
 * monitor). One request, evaluated by its ASSERTIONS (status code / response time by
 * default) and how long it took. Cheap by design — billed under the uptime family
 * (by monitor count, not per run), so it has no `billingSource`.
 *
 * Evaluation: failing if the request errored/timed out OR any assertion failed;
 * degraded if it succeeded but was slower than `degradedThresholdMs`; else passing.
 */
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

const urlConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(HTTP_METHODS).default("GET"),
  followRedirects: z.boolean().default(true),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  /** Response assertions (source / comparison / target). Defaults to status < 400. */
  assertions: z.array(assertionSchema).default(DEFAULT_HTTP_ASSERTIONS),
  degradedThresholdMs: thresholdMs.default(3000),
  timeoutMs: thresholdMs.default(5000),
});

export type UrlConfig = z.infer<typeof urlConfigSchema>;

export const urlMonitor: MonitorType<UrlConfig> = {
  key: "url",
  label: "URL monitor",
  summary: "Verify the availability and response time of a URL.",
  family: "uptime",
  runner: "inline",
  supportsDegraded: true,
  configSchema: urlConfigSchema,
  defaults: { timeoutMs: 5000, degradedThresholdMs: 3000 },

  async run(config, ctx) {
    const timeout = config.timeoutMs ?? this.defaults.timeoutMs;
    const degradedAfter = config.degradedThresholdMs ?? this.defaults.degradedThresholdMs ?? 3000;
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
