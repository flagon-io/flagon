import net from "node:net";
import { z } from "zod";
import type { MonitorType, RunResult } from "./types.js";
import { thresholdMs } from "./types.js";
import { guardHost } from "./guard.js";

/**
 * TCP monitor — a lightweight connectivity probe (Checkly's TCP monitor). Opens a TCP
 * connection to host:port and evaluates on whether it connected and how long it took.
 * Uptime family: billed by monitor count, not per run.
 */
const tcpConfigSchema = z.object({
  host: z.string().min(1).describe("Hostname or IP to connect to."),
  port: z.number().int().min(1).max(65535),
  degradedThresholdMs: thresholdMs.default(3000),
  timeoutMs: thresholdMs.default(5000),
});

export type TcpConfig = z.infer<typeof tcpConfigSchema>;

export const tcpMonitor: MonitorType<TcpConfig> = {
  key: "tcp",
  label: "TCP monitor",
  summary: "Monitor connectivity to a TCP endpoint.",
  family: "uptime",
  runner: "inline",
  supportsDegraded: true,
  configSchema: tcpConfigSchema,
  defaults: { timeoutMs: 5000, degradedThresholdMs: 3000 },

  async run(config, ctx) {
    const timeout = config.timeoutMs ?? this.defaults.timeoutMs;
    const degradedAfter = config.degradedThresholdMs ?? this.defaults.degradedThresholdMs ?? 3000;
    const started = performance.now();
    const latency = () => Math.round(performance.now() - started);
    const blocked = await guardHost(config.host, started);
    if (blocked) return blocked;

    return new Promise<RunResult>((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const done = (r: RunResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(r);
      };

      socket.setTimeout(timeout);
      socket.once("connect", () => {
        const latencyMs = latency();
        done({
          status: latencyMs > degradedAfter ? "degraded" : "passing",
          latencyMs,
          detail: { host: config.host, port: config.port },
        });
      });
      socket.once("timeout", () =>
        done({
          status: "failing",
          latencyMs: latency(),
          error: { code: "timeout", message: `No connection to ${config.host}:${config.port} within ${timeout}ms.` },
        }),
      );
      socket.once("error", (err) =>
        done({ status: "failing", latencyMs: latency(), error: { code: "connect_error", message: err.message } }),
      );
      ctx.signal.addEventListener(
        "abort",
        () => done({ status: "failing", latencyMs: latency(), error: { code: "aborted", message: "Run aborted." } }),
        { once: true },
      );

      socket.connect(config.port, config.host);
    });
  },
};
