import { Resolver } from "node:dns/promises";
import { z } from "zod";
import type { Assertion, MonitorType, RunResult } from "./types.js";
import { thresholdMs } from "./types.js";

/**
 * DNS monitor — resolves a record on a schedule and checks the answer (Checkly's DNS
 * monitor). Uptime family (billed by count). Supports an optional `expected` substring
 * the resolved answer must contain (e.g. an IP, a CNAME target, an MX host).
 */
const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "NS", "TXT"] as const;

const dnsConfigSchema = z.object({
  hostname: z.string().min(1).describe("The domain to resolve."),
  recordType: z.enum(RECORD_TYPES).default("A"),
  /** Optional: the answer must contain this value (an IP, hostname, …). */
  expected: z.string().optional(),
  degradedThresholdMs: thresholdMs.default(3000),
  timeoutMs: thresholdMs.default(5000),
});

export type DnsConfig = z.infer<typeof dnsConfigSchema>;

async function resolveRecord(resolver: Resolver, hostname: string, type: (typeof RECORD_TYPES)[number]): Promise<unknown[]> {
  switch (type) {
    case "A":
      return resolver.resolve4(hostname);
    case "AAAA":
      return resolver.resolve6(hostname);
    case "CNAME":
      return resolver.resolveCname(hostname);
    case "MX":
      return resolver.resolveMx(hostname);
    case "NS":
      return resolver.resolveNs(hostname);
    case "TXT":
      return resolver.resolveTxt(hostname);
  }
}

export const dnsMonitor: MonitorType<DnsConfig> = {
  key: "dns",
  label: "DNS monitor",
  summary: "Monitor DNS resolution for a domain.",
  family: "uptime",
  runner: "inline",
  supportsDegraded: true,
  configSchema: dnsConfigSchema,
  defaults: { timeoutMs: 5000, degradedThresholdMs: 3000 },

  async run(config, ctx) {
    const timeout = config.timeoutMs ?? this.defaults.timeoutMs;
    const degradedAfter = config.degradedThresholdMs ?? this.defaults.degradedThresholdMs ?? 3000;
    const resolver = new Resolver({ timeout, tries: 1 });
    ctx.signal.addEventListener("abort", () => resolver.cancel(), { once: true });

    const started = performance.now();
    let answers: unknown[];
    try {
      answers = await resolveRecord(resolver, config.hostname, config.recordType);
    } catch (err) {
      return {
        status: "failing",
        latencyMs: Math.round(performance.now() - started),
        error: {
          code: "resolve_error",
          message: err instanceof Error ? err.message : `Could not resolve ${config.hostname}.`,
        },
      } satisfies RunResult;
    }

    const latencyMs = Math.round(performance.now() - started);
    const flat = JSON.stringify(answers);
    const hasAnswer = answers.length > 0;
    const matches = config.expected ? flat.includes(config.expected) : true;
    const assertions: Assertion[] = [
      { source: "answer", ok: hasAnswer, expected: "≥ 1 record", actual: String(answers.length) },
    ];
    if (config.expected) {
      assertions.push({ source: "contains", ok: matches, expected: config.expected });
    }

    if (!hasAnswer || !matches) {
      return {
        status: "failing",
        latencyMs,
        assertions,
        detail: { answers },
        error: {
          code: "assertion_failed",
          message: !hasAnswer ? "No records returned." : `Answer did not contain "${config.expected}".`,
        },
      };
    }

    return {
      status: latencyMs > degradedAfter ? "degraded" : "passing",
      latencyMs,
      assertions,
      detail: { answers },
    };
  },
};
