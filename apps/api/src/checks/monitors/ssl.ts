import tls from "node:tls";
import { z } from "zod";
import type { MonitorType, RunResult } from "./types.js";
import { thresholdMs } from "./types.js";
import { guardHost } from "./guard.js";

/**
 * SSL monitor — opens a TLS connection and checks the certificate (Checkly's SSL
 * monitor). Uptime family (billed by count). Evaluation:
 *   failing   the handshake failed, the cert is untrusted/invalid, or it has EXPIRED.
 *   degraded  the cert is valid but expires within `expiryThresholdDays` (a heads-up).
 *   passing   valid with comfortable time to expiry.
 */
const sslConfigSchema = z.object({
  host: z.string().min(1).describe("The hostname to check the certificate of."),
  port: z.number().int().min(1).max(65535).default(443),
  /** Warn (degraded) when the cert expires within this many days. */
  expiryThresholdDays: z.number().int().min(1).max(365).default(14),
  timeoutMs: thresholdMs.default(5000),
});

export type SslConfig = z.infer<typeof sslConfigSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

export const sslMonitor: MonitorType<SslConfig> = {
  key: "ssl",
  label: "SSL monitor",
  summary: "Verify TLS handshake, certificate validity, and expiry.",
  family: "uptime",
  runner: "inline",
  supportsDegraded: true,
  configSchema: sslConfigSchema,
  defaults: { timeoutMs: 5000 },

  async run(config, ctx) {
    const timeout = config.timeoutMs ?? this.defaults.timeoutMs;
    const started = performance.now();
    const latency = () => Math.round(performance.now() - started);
    const blocked = await guardHost(config.host, started);
    if (blocked) return blocked;

    return new Promise<RunResult>((resolve) => {
      let settled = false;
      const done = (r: RunResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(r);
      };

      const socket = tls.connect(
        { host: config.host, port: config.port, servername: config.host, timeout },
        () => {
          if (!socket.authorized) {
            done({
              status: "failing",
              latencyMs: latency(),
              error: { code: "cert_invalid", message: socket.authorizationError?.toString() ?? "Certificate not trusted." },
            });
            return;
          }
          const cert = socket.getPeerCertificate();
          const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
          if (!validTo || Number.isNaN(validTo.getTime())) {
            done({ status: "failing", latencyMs: latency(), error: { code: "no_cert", message: "No certificate returned." } });
            return;
          }
          const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / DAY_MS);
          const detail = {
            validTo: cert.valid_to,
            daysRemaining,
            issuer: typeof cert.issuer === "object" ? (cert.issuer.O ?? cert.issuer.CN) : undefined,
          };
          if (daysRemaining <= 0) {
            done({ status: "failing", latencyMs: latency(), detail, error: { code: "cert_expired", message: "The certificate has expired." } });
          } else if (daysRemaining <= config.expiryThresholdDays) {
            done({ status: "degraded", latencyMs: latency(), detail });
          } else {
            done({ status: "passing", latencyMs: latency(), detail });
          }
        },
      );

      socket.once("timeout", () =>
        done({ status: "failing", latencyMs: latency(), error: { code: "timeout", message: `No TLS handshake within ${timeout}ms.` } }),
      );
      socket.once("error", (err) =>
        done({ status: "failing", latencyMs: latency(), error: { code: "tls_error", message: err.message } }),
      );
      ctx.signal.addEventListener(
        "abort",
        () => done({ status: "failing", latencyMs: latency(), error: { code: "aborted", message: "Run aborted." } }),
        { once: true },
      );
    });
  },
};
