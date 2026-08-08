import { z } from "zod";

/**
 * The monitor-type adapter contract — the extension point for the Checks product.
 *
 * A "check" is a scheduled probe. Every KIND of probe (a URL uptime monitor, a
 * Playwright browser check, and — later — TCP/DNS/ICMP/gRPC/SSL/heartbeat/API/
 * multistep) is one adapter implementing this interface, registered in
 * monitors/index.ts. The scheduler, the runner, the metering, request validation,
 * the console form, and the docs all read the registry generically and NEVER name
 * a specific type — so adding a new monitor is a single new file plus one line in
 * the registry array, with zero changes to the core. This mirrors the BYO
 * integration registry (integrations/providers.ts): data + one small function.
 */

/** The product family a monitor belongs to — drives console grouping (Checkly's
 *  "Uptime monitors" vs "Synthetic checks" split) and, by convention, its price. */
export type MonitorFamily = "uptime" | "synthetic";

/**
 * How the scheduler DISPATCHES a run:
 *  - "inline"  runs in-process during the cron sweep (a fetch/socket probe).
 *  - "browser" is handed to the isolated browser Vercel function (Playwright +
 *    headless Chromium), kept out of the main API bundle.
 *  - "agent"   is enqueued for a remote/private-location runner to claim (later).
 */
export type Runner = "inline" | "browser" | "agent";

/** A probe's evaluated outcome. `degraded` = working but slow; some types (browser)
 *  never emit it (see `supportsDegraded`). */
export type CheckStatus = "passing" | "degraded" | "failing";

/** One validated assertion outcome recorded on a run (status code, latency, a
 *  JSONPath, a browser step, …). */
export type Assertion = {
  /** What was asserted, e.g. "status", "latency", "jsonpath:$.ok", a step name. */
  source: string;
  ok: boolean;
  expected?: string;
  actual?: string;
  message?: string;
};

/** Handed to every adapter run. Carries identity + a timeout signal; no DB access —
 *  an adapter is a pure probe, and recording is the runner's job. */
export type RunContext = {
  orgId: string;
  checkId: string;
  now: Date;
  /** The location this run executes from (MVP: always "default"). */
  location: string;
  /** Aborts when the adapter's timeout elapses; adapters MUST pass it to fetch/etc. */
  signal: AbortSignal;
};

/** The outcome of one probe. An adapter's `run` NEVER throws — a thrown or timed-out
 *  probe is returned as a `failing` result. */
export type RunResult = {
  status: CheckStatus;
  /** Total wall-clock latency of the probe, in milliseconds. */
  latencyMs: number;
  /** HTTP status code, when the probe made an HTTP request. */
  httpStatus?: number;
  /** Per-assertion outcomes, for the run detail view. */
  assertions?: Assertion[];
  /** Set on a `failing` result; null/omitted otherwise. */
  error?: { code: string; message: string } | null;
  /** Adapter-specific extra, persisted verbatim to check_results.detail (jsonb). */
  detail?: Record<string, unknown>;
};

export type MonitorType<C = unknown> = {
  /** Stable key stored on the check row and used in the API/URLs ("url", "browser"). */
  key: string;
  /** Human label for the console + docs. */
  label: string;
  /** One-line description for the type picker. */
  summary: string;
  family: MonitorFamily;
  runner: Runner;
  /** Whether this type can report the `degraded` state (URL: yes; browser: no). */
  supportsDegraded: boolean;
  /**
   * The durable-event `source` a run of this type meters under (see
   * usage/meters.ts SOURCE_METERS), for SYNTHETIC types billed per run (browser, and
   * later API/multistep). UPTIME monitors OMIT this — they are billed by monitor
   * COUNT (a licensed subscription quantity, lib/plans.ts + lib/billing.ts), not per
   * run — so the runner skips run-metering when it is absent.
   */
  billingSource?: string | null;
  /** Zod schema for the type-specific `config` jsonb; validated on create/update. */
  configSchema: z.ZodType<C>;
  /** Type defaults surfaced in the console and applied when the config omits them. */
  defaults: { timeoutMs: number; degradedThresholdMs?: number };
  /** Execute one probe. MUST NOT throw; honor `ctx.signal`. */
  run(config: C, ctx: RunContext): Promise<RunResult>;
  /**
   * Billable units one run consumes. Defaults to 1; a time-metered type (a
   * Playwright suite) overrides this to charge by execution time (Checkly bills 1
   * run per 30s). Never returns less than 1 for a real run.
   */
  billingQuantity?(result: RunResult): number;
};

/** The frequency ladder (seconds) the console offers, mirroring Checkly's rungs.
 *  Sub-minute rungs are deferred (the cron floor is 1 minute), so the MVP minimum
 *  is 60s; the API validates a check's `frequencySeconds` against this set. */
export const FREQUENCY_SECONDS = [
  60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400,
] as const;

/** A response-time threshold field: a positive integer count of milliseconds,
 *  hard-capped at 30s like Checkly (a run can never take longer than the cap). */
export const thresholdMs = z.number().int().positive().max(30_000);
