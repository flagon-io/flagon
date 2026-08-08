import type { MonitorType } from "./types.js";
import { urlMonitor } from "./url.js";
import { tcpMonitor } from "./tcp.js";
import { dnsMonitor } from "./dns.js";
import { sslMonitor } from "./ssl.js";
// apiMonitor + browserMonitor are intentionally NOT registered (Soon) — see below.

/**
 * The monitor-type registry — the ONE place a monitor kind is registered.
 *
 * Adding a Checkly type (TCP, DNS, ICMP, gRPC, SSL, Heartbeat, API, Multistep,
 * Playwright suite, …) is a new file exporting a `MonitorType` plus one entry in
 * this array. Everything else — the scheduler's dispatch (by `runner`), metering
 * (by `billingSource`), config validation (by `configSchema`), the console type
 * picker, and the docs — reads this list generically, so no core change is needed.
 */
const MONITOR_TYPES: MonitorType<any>[] = [
  // Uptime monitors (inline probes, billed by monitor count). These are what's LIVE.
  urlMonitor,
  tcpMonitor,
  dnsMonitor,
  sslMonitor,
  // SYNTHETIC checks are deferred to "Soon", so neither is registered here:
  //  - apiMonitor: the adapter (api.ts) is intact and works; held back to flush out the UX.
  //  - browserMonitor: removed entirely — @sparticuz/chromium can't launch on Vercel
  //    serverless (missing system libs, `libnss3.so`); belongs on a container runner.
  // Their billing meters (`check.runs.api`, `check.runs.browser`) are deliberately KEPT in
  // usage/meters.ts so the Stripe scaffold persists. Re-register here to bring either back;
  // registry-driven, so the type picker / config / validation / docs update automatically.
];

const BY_KEY = new Map(MONITOR_TYPES.map((m) => [m.key, m]));

/** Every registered monitor type, in display order. */
export function listMonitorTypes(): MonitorType<any>[] {
  return MONITOR_TYPES;
}

/** Look up a monitor type by key, or undefined if unknown. */
export function getMonitorType(key: string): MonitorType<any> | undefined {
  return BY_KEY.get(key);
}

/** Billable units a run of this type consumes (default 1). */
export function runBillingQuantity(type: MonitorType<any>, result: import("./types.js").RunResult): number {
  const q = type.billingQuantity?.(result) ?? 1;
  return Math.max(1, Math.round(q));
}

export type { MonitorType } from "./types.js";
